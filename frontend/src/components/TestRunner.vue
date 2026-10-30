<script setup lang="ts">
import AppIcon from './AppIcon.vue'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import ContentBlocksViewer from './ContentBlocksViewer.vue'
import MatchingQuestionRunner from './MatchingQuestionRunner.vue'
import { createMatchingOrder } from '../learner/presentation'
import { choiceFeedback, questionProgress, type ChoiceFeedback, type ProgressState } from '../learner/overview'
import { showsOverallScore, type ChoiceQuestion, type DraftTest, type Question } from '../editor/model'
import {
  freshAnswers, grade, hasValidAnswerKey, setChoiceAnswer, setMatchingAnswer,
  type Answers, type QuestionResult,
} from '../learner/scoring'

const props = defineProps<{
  test: DraftTest
  privatePreview?: boolean
  mediaUrls?: Record<string, string>
}>()
const { t } = useI18n()
/** Short tests fit on the page without a navigator; longer ones get the question overview. */
const OVERVIEW_MIN_QUESTIONS = 6
const root = ref<HTMLElement | null>(null)
const overview = ref<HTMLElement | null>(null)
const overviewToggle = ref<HTMLButtonElement | null>(null)
const overviewList = ref<HTMLOListElement | null>(null)
const summaryHeading = ref<HTMLElement | null>(null)
const answers = ref<Answers>(freshAnswers())
const submitted = ref(false)
const overviewOpen = ref(false)
const activeQuestionId = ref('')
const scrollOffset = ref(16)
const matchingOrder = ref<Record<string, string[]>>({})
const result = computed(() => grade(props.test.questions, answers.value))
const resultsById = computed(() => new Map(result.value.results.map(item => [item.questionId, item])))
const incompleteDraft = computed(() => props.privatePreview && props.test.questions.length === 0)
const scoreVisible = computed(() => showsOverallScore(props.test))
const showOverview = computed(() => props.test.questions.length >= OVERVIEW_MIN_QUESTIONS)
const progress = computed(() => new Map(props.test.questions.map(question =>
  [question.id, questionProgress(question, answers.value)])))
const completed = computed(() => [...progress.value.values()].filter(item => item.state === 'answered').length)
const activeIndex = computed(() => Math.max(0, props.test.questions.findIndex(question => question.id === activeQuestionId.value)))
const positionLabel = computed(() => t('runnerQuestionPosition', { index: activeIndex.value + 1, total: props.test.questions.length }))
const progressLabel = computed(() => submitted.value ? t('runnerReviewAnswers')
  : t('runnerAnsweredProgress', { count: completed.value, total: props.test.questions.length }))

type QuestionState = ProgressState | 'correct' | 'incorrect' | 'ungraded'
// Only states with a meaning of their own carry an icon. An empty circle for
// "unanswered" sat right above the radio buttons and looked like one of them.
const statusIcons: Partial<Record<QuestionState, 'check-lg' | 'x-lg'>> = {
  answered: 'check-lg', correct: 'check-lg', incorrect: 'x-lg',
}
const feedbackIcons: Record<ChoiceFeedback, 'check-lg' | 'x-lg' | 'exclamation-circle'> = {
  neutral: 'check-lg', selected: 'check-lg', 'chosen-correct': 'check-lg',
  'chosen-incorrect': 'x-lg', 'correct-unselected': 'exclamation-circle',
}

function resultFor(question: Question): QuestionResult | undefined {
  return resultsById.value.get(question.id)
}
function questionState(question: Question): QuestionState {
  if (!submitted.value) return progress.value.get(question.id)?.state ?? 'unanswered'
  if (!hasValidAnswerKey(question)) return 'ungraded'
  const feedback = resultFor(question)
  return feedback?.correct ? 'correct' : feedback?.answered ? 'incorrect' : 'unanswered'
}
function statusIcon(question: Question): 'check-lg' | 'x-lg' | undefined {
  return statusIcons[questionState(question)]
}
function questionFeedback(question: Question): string {
  const feedback = resultFor(question)
  const state = feedback?.correct ? 'Correct' : feedback?.answered ? 'Incorrect' : 'Unanswered'
  return t('runnerQuestion' + state + (scoreVisible.value ? '' : 'NoScore'))
}
function statusLabel(question: Question): string {
  if (submitted.value) return hasValidAnswerKey(question) ? questionFeedback(question) : t('runnerUngraded')
  const item = progress.value.get(question.id)
  if (item?.state === 'partial') return t('runnerPartialPairs', { count: item.completed, total: item.total })
  return t(item?.state === 'answered' ? 'runnerAnswered' : 'runnerUnanswered')
}
/** A, B, C… label choice options; past Z, numbers keep every label unique. */
function optionLetter(index: number): string {
  return index < 26 ? String.fromCharCode(65 + index) : String(index + 1)
}
/** Text answers read best one per row; pictures and videos sit two per row. */
function hasMediaOptions(question: ChoiceQuestion): boolean {
  return question.options.some(option => option.content.some(block => block.type !== 'text'))
}
function optionState(question: ChoiceQuestion, id: string) {
  return choiceFeedback(question, answers.value.choices[question.id] ?? [], id, submitted.value)
}
function optionLabel(question: ChoiceQuestion, id: string): string {
  const state = optionState(question, id)
  const labels = {
    neutral: '', selected: 'runnerSelectedAnswer', 'chosen-correct': 'runnerChosenCorrect',
    'chosen-incorrect': 'runnerChosenIncorrect', 'correct-unselected': 'runnerCorrectUnselected',
  }
  return labels[state] ? t(labels[state]) : ''
}
function choose(question: ChoiceQuestion, id: string, checked: boolean): void {
  if (!submitted.value) answers.value = setChoiceAnswer(answers.value, question, id, checked)
}
function chooseFromCard(event: MouseEvent, question: ChoiceQuestion, id: string): void {
  // Keep native players, links, labels and form controls independent of the
  // pointer shortcut. The real input remains the accessible keyboard control.
  if (submitted.value || (event.target as Element).closest('video, audio, a, button, input, label, select, textarea, summary')) return
  choose(question, id, question.mode === 'single' || !(answers.value.choices[question.id] ?? []).includes(id))
  const input = (event.currentTarget as HTMLElement).querySelector<HTMLInputElement>('input')
  input?.focus({ preventScroll: true })
}
function match(question: Extract<Question, { type: 'matching' }>, leftId: string, rightId: string): void {
  if (!submitted.value) answers.value = setMatchingAnswer(answers.value, question, leftId, rightId)
}
function sectionFor(id: string): HTMLElement | undefined {
  return Array.from(root.value?.querySelectorAll<HTMLElement>('[data-runner-question]') ?? [])
    .find(section => section.dataset.runnerQuestion === id)
}
function pauseMedia(element: HTMLElement | null | undefined = root.value): void {
  // Grading, a new attempt or leaving the page stops playback but keeps the position.
  element?.querySelectorAll<HTMLMediaElement>('video, audio').forEach(media => media.pause())
}
function mobileOverview(): boolean {
  return window.matchMedia('(max-width: 991.98px)').matches
}
function measureOverview(): void {
  scrollOffset.value = mobileOverview() ? (overview.value?.getBoundingClientRect().height ?? 0) + 16 : 16
}
async function jumpToQuestion(id: string): Promise<void> {
  overviewOpen.value = false
  activeQuestionId.value = id
  await nextTick()
  // Measure after closing the mobile list: its expanded height is not the
  // sticky obstruction that will remain above the destination question.
  measureOverview()
  await nextTick()
  const section = sectionFor(id)
  section?.scrollIntoView({ block: 'start', behavior: 'instant' })
  section?.querySelector<HTMLElement>('.question-position')?.focus({ preventScroll: true })
}
function closeOverview(event: KeyboardEvent): void {
  if (event.key !== 'Escape' || !overviewOpen.value || !mobileOverview()) return
  event.preventDefault()
  overviewOpen.value = false
  overviewToggle.value?.focus({ preventScroll: true })
}
let frame = 0
let overviewObserver: ResizeObserver | undefined
function updateActiveQuestion(): void {
  frame = 0
  if (overviewOpen.value && mobileOverview()) return
  const sections = Array.from(root.value?.querySelectorAll<HTMLElement>('[data-runner-question]') ?? [])
  // The question crossing the reading line is current. For very short cards,
  // the first visible card takes precedence over one above it.
  const line = scrollOffset.value + 32
  const current = sections.find(section => section.getBoundingClientRect().bottom > line) ?? sections.at(-1)
  if (current?.dataset.runnerQuestion) activeQuestionId.value = current.dataset.runnerQuestion
}
function scheduleActiveQuestion(): void {
  if (!frame) frame = window.requestAnimationFrame(updateActiveQuestion)
}
function resize(): void { measureOverview(); scheduleActiveQuestion() }
async function submit(): Promise<void> {
  pauseMedia()
  overviewOpen.value = false
  submitted.value = true
  await nextTick()
  measureOverview()
  await nextTick()
  summaryHeading.value?.scrollIntoView({ block: 'start', behavior: 'instant' })
  summaryHeading.value?.focus({ preventScroll: true })
}
function reset(): void {
  pauseMedia()
  answers.value = freshAnswers()
  submitted.value = false
  overviewOpen.value = false
  activeQuestionId.value = props.test.questions[0]?.id ?? ''
  matchingOrder.value = createMatchingOrder(props.test.questions)
}
async function restart(): Promise<void> {
  reset()
  const first = props.test.questions[0]
  if (first) await jumpToQuestion(first.id)
}
// Only a newly loaded test or explicit retry resets an attempt. Locale changes
// and answer updates must not reshuffle matching items.
watch(() => props.test, reset, { immediate: true })
watch(activeQuestionId, async () => {
  await nextTick()
  const list = overviewList.value
  const current = list?.querySelector<HTMLElement>('.is-current')
  if (!list || !current || (mobileOverview() && !overviewOpen.value)) return
  // Scroll only the overview's own list. scrollIntoView here would also move
  // the page away from the question the learner is reading.
  const bounds = list.getBoundingClientRect()
  const item = current.getBoundingClientRect()
  if (item.top < bounds.top) list.scrollTop += item.top - bounds.top
  else if (item.bottom > bounds.bottom) list.scrollTop += item.bottom - bounds.bottom
})
watch(overview, element => {
  overviewObserver?.disconnect()
  if (element) overviewObserver?.observe(element)
}, { flush: 'post' })
onMounted(() => {
  measureOverview()
  window.addEventListener('scroll', scheduleActiveQuestion, { passive: true })
  window.addEventListener('resize', resize)
  overviewObserver = new window.ResizeObserver(measureOverview)
  if (overview.value) overviewObserver.observe(overview.value)
})
onBeforeUnmount(() => {
  pauseMedia()
  window.removeEventListener('scroll', scheduleActiveQuestion)
  window.removeEventListener('resize', resize)
  overviewObserver?.disconnect()
  if (frame) window.cancelAnimationFrame(frame)
})
</script>

<template>
  <article ref="root" class="test-runner" :style="{ '--runner-scroll-offset': scrollOffset + 'px' }">
    <header class="card mb-4">
      <div class="card-body p-md-4">
        <slot name="context" />
        <h1 class="h3" :class="{ 'mb-0': !test.description }">{{ test.title }}</h1>
        <p v-if="test.description" class="mb-0" style="white-space: pre-wrap">{{ test.description }}</p>
      </div>
    </header>
    <div v-if="privatePreview" class="alert alert-info" role="status">{{ t('runnerPreviewBanner') }}</div>
    <p v-if="incompleteDraft" class="alert alert-warning" role="status">{{ t('runnerEmptyDraft') }}</p>

    <form class="runner-layout" @submit.prevent="submit">
      <aside v-if="showOverview" ref="overview" class="runner-overview card" @keydown="closeOverview">
        <nav :aria-label="t('runnerOverview')">
          <div class="overview-desktop p-3 border-bottom">
            <h2 class="h6 mb-2"><AppIcon name="list-check" /> {{ t('runnerOverview') }}</h2>
            <p class="small text-secondary mb-0">{{ progressLabel }}</p>
          </div>
          <button ref="overviewToggle" class="overview-mobile btn text-start w-100" type="button"
            :aria-label="t('runnerToggleOverview', { position: positionLabel })"
            :aria-expanded="overviewOpen" aria-controls="runner-overview-list" @click="overviewOpen = !overviewOpen">
            <span class="flex-grow-1">
              <strong class="d-block">{{ positionLabel }}</strong>
              <span class="small text-secondary">{{ progressLabel }}</span>
            </span>
            <span class="small">{{ t('runnerOverview') }}</span>
            <AppIcon :name="overviewOpen ? 'chevron-up' : 'chevron-down'" />
          </button>
          <ol id="runner-overview-list" ref="overviewList" class="overview-list list-unstyled mb-0" :class="{ 'overview-open': overviewOpen }">
            <li v-for="(question, index) in test.questions" :key="question.id">
              <button type="button" class="overview-question" :class="{ 'is-current': activeQuestionId === question.id }"
                :aria-current="activeQuestionId === question.id ? 'location' : undefined"
                :aria-controls="'runner-section-' + question.id" @click="jumpToQuestion(question.id)">
                <span class="overview-number" aria-hidden="true">{{ index + 1 }}</span>
                <span class="overview-description">
                  <span class="fw-semibold d-block">{{ t('runnerQuestion', { index: index + 1 }) }}</span>
                  <span class="question-status" :class="'status-' + questionState(question)">
                    <AppIcon v-if="statusIcon(question)" :name="statusIcon(question)!" />{{ statusLabel(question) }}
                  </span>
                </span>
              </button>
            </li>
          </ol>
        </nav>
      </aside>

      <div class="runner-content">
        <section v-if="submitted" class="runner-summary card mb-4" aria-labelledby="runner-summary-heading">
          <div class="card-body">
            <h2 id="runner-summary-heading" ref="summaryHeading" class="h5" tabindex="-1">
              <AppIcon name="list-check" />
              {{ scoreVisible ? t('runnerScore', { score: result.correct, total: result.total }) : t('runnerEvaluated') }}
            </h2>
            <p class="mb-0 text-secondary">{{ t('runnerResultsHint') }}</p>
          </div>
        </section>

        <section v-for="(question, index) in test.questions" :id="'runner-section-' + question.id" :key="question.id"
          class="runner-question card mb-4" :class="submitted ? 'result-' + questionState(question) : ''"
          :data-runner-question="question.id" :aria-labelledby="'runner-question-' + question.id"
          @focusin="activeQuestionId = question.id">
          <!-- The question's own text leads; its position and status are small labels above it. -->
          <div class="question-header">
            <h2 :id="'runner-question-' + question.id" class="question-position" tabindex="-1">
              {{ t('runnerQuestionPosition', { index: index + 1, total: test.questions.length }) }}
            </h2>
            <span class="question-status" :class="'status-' + questionState(question)">
              <AppIcon v-if="statusIcon(question)" :name="statusIcon(question)!" />{{ statusLabel(question) }}
            </span>
          </div>
          <div :id="'runner-body-' + question.id" class="question-body">
            <ContentBlocksViewer class="question-prompt" :blocks="question.prompt"
              :private-preview="privatePreview" :media-urls="mediaUrls" />

            <template v-if="question.type === 'choice'">
              <p class="small text-secondary mt-3">{{ t(question.mode === 'single' ? 'runnerPickOne' : 'runnerPickMultiple') }}</p>
              <div class="choice-options" :class="{ 'choice-options-media': hasMediaOptions(question) }">
                <div v-for="(option, optionIndex) in question.options" :key="option.id" class="choice-option rounded"
                  :class="'option-' + optionState(question, option.id)" @click="chooseFromCard($event, question, option.id)">
                  <!-- The accessible name is "Answer A" followed by the answer's own content. -->
                  <input :id="'runner-option-' + question.id + '-' + option.id" class="form-check-input"
                    :type="question.mode === 'single' ? 'radio' : 'checkbox'" :name="'runner-choice-' + question.id"
                    :checked="(answers.choices[question.id] ?? []).includes(option.id)" :disabled="submitted"
                    :aria-labelledby="'runner-option-label-' + question.id + '-' + option.id + ' runner-option-content-' + question.id + '-' + option.id"
                    :aria-describedby="optionLabel(question, option.id) ? 'runner-feedback-' + question.id + '-' + option.id : undefined"
                    @change="choose(question, option.id, ($event.target as HTMLInputElement).checked)" />
                  <label :id="'runner-option-label-' + question.id + '-' + option.id" class="option-letter"
                    :for="'runner-option-' + question.id + '-' + option.id">
                    <span aria-hidden="true">{{ optionLetter(optionIndex) }}</span>
                    <span class="visually-hidden">{{ t('runnerAnswer', { index: optionLetter(optionIndex) }) }}</span>
                  </label>
                  <!-- Keep native video controls outside the input label. -->
                  <ContentBlocksViewer :id="'runner-option-content-' + question.id + '-' + option.id" class="option-content"
                    :blocks="option.content" :private-preview="privatePreview" :media-urls="mediaUrls" />
                  <p v-if="optionLabel(question, option.id)" :id="'runner-feedback-' + question.id + '-' + option.id"
                    class="option-feedback small fw-semibold mb-0">
                    <AppIcon :name="feedbackIcons[optionState(question, option.id)]" />
                    {{ optionLabel(question, option.id) }}
                  </p>
                </div>
              </div>
            </template>

            <MatchingQuestionRunner v-else :question="question" :responses="answers.matches[question.id] ?? {}"
              :right-order="matchingOrder[question.id] ?? []" :submitted="submitted"
              :private-preview="privatePreview" :media-urls="mediaUrls"
              @match="(leftId, rightId) => match(question, leftId, rightId)" />

            <p v-if="privatePreview && !hasValidAnswerKey(question)" class="alert alert-warning py-2 mt-3 mb-0" role="status">
              {{ t('runnerMissingAnswerKey') }}
            </p>
          </div>
        </section>

        <div v-if="test.questions.length" class="runner-actions d-flex gap-2 gap-sm-3 flex-wrap align-items-center">
          <button v-if="!submitted" class="btn btn-primary runner-submit" type="submit"><AppIcon name="check2-circle" />{{ t('runnerSubmit') }}</button>
          <button v-else type="button" class="btn btn-outline-primary" @click="restart">
            <AppIcon name="arrow-counterclockwise" />{{ t('runnerTryAgain') }}
          </button>
          <span v-if="!submitted" class="runner-progress small text-secondary">{{ progressLabel }}</span>
        </div>
        <p class="text-secondary small mt-3 mb-0">{{ t('runnerNoStorage') }}</p>
      </div>
    </form>
  </article>
</template>

<style scoped>
.test-runner { min-width: 0; }
.runner-layout { display: grid; grid-template-columns: 14rem minmax(0, 1fr); gap: 1.5rem; align-items: start; }
.runner-layout:not(:has(.runner-overview)) { grid-template-columns: minmax(0, 1fr); }
.runner-content, .overview-description { min-width: 0; }
.runner-overview { position: sticky; top: 1rem; overflow: hidden; }
.overview-desktop { background: var(--bs-tertiary-bg); }
.overview-mobile { display: none; }
.overview-list { max-height: calc(100dvh - 9rem); overflow-y: auto; padding: .5rem; }
.overview-question { display: flex; align-items: center; gap: .75rem; width: 100%; min-height: 3.5rem; padding: .5rem; border: 2px solid transparent; border-radius: var(--bs-border-radius); background: transparent; color: var(--bs-body-color); text-align: start; }
.overview-question:hover { background: var(--bs-tertiary-bg); }
.overview-question.is-current { border-color: var(--bs-primary); background: var(--bs-primary-bg-subtle); }
.overview-question .question-status { margin-top: .2rem; }
/* The current item's tint would swallow a tinted tag. */
.overview-question.is-current .question-status { background: var(--bs-body-bg); }
.overview-number { display: grid; place-items: center; width: 2rem; height: 2rem; flex-shrink: 0; border: 1px solid var(--bs-border-color); border-radius: .375rem; background: var(--bs-body-bg); font-weight: 600; }
.is-current .overview-number { color: var(--bs-white); background: var(--bs-primary); border-color: var(--bs-primary); }
.overview-question:focus-visible { position: relative; outline: 3px solid var(--bs-primary); outline-offset: -3px; }
/* Status tags carry the state in words; colour only supports it. Rounded
   rectangles rather than pills, so longer texts can wrap in the overview. */
.question-status { display: inline-flex; align-items: center; gap: .3rem; width: fit-content; padding: .125rem .5rem; border-radius: var(--bs-border-radius-sm); font-size: .8125rem; font-weight: 500; line-height: 1.4; color: var(--bs-secondary-color); background: var(--bs-secondary-bg); }
.status-answered, .status-partial { color: var(--bs-primary-text-emphasis); background: var(--bs-primary-bg-subtle); }
.status-correct { color: var(--bs-success-text-emphasis); background: var(--bs-success-bg-subtle); }
.status-incorrect { color: var(--bs-danger-text-emphasis); background: var(--bs-danger-bg-subtle); }
.status-ungraded { color: var(--bs-warning-text-emphasis); background: var(--bs-warning-bg-subtle); }
.runner-question { overflow-wrap: anywhere; scroll-margin-top: var(--runner-scroll-offset); }
.question-header { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: .5rem 1rem; padding: 1rem 1.25rem 0; }
.question-position { margin: 0; font-size: .75rem; font-weight: 600; letter-spacing: .06em; text-transform: uppercase; color: var(--bs-secondary-color); }
.question-position:focus-visible { outline: 3px solid var(--bs-primary); outline-offset: 2px; border-radius: 2px; }
.question-body { padding: .5rem 1.25rem 1.25rem; }
.question-prompt { font-size: 1.25rem; font-weight: 600; line-height: 1.4; }
.question-prompt :deep(> :last-child) { margin-bottom: 0 !important; }
.choice-options { display: grid; grid-template-columns: minmax(0, 1fr); gap: .75rem; }
/* Exactly two per row: without the overview, auto-fit would spread pictures into three columns. */
.choice-options-media { grid-template-columns: repeat(2, minmax(0, 1fr)); }
/* Input, letter and content share the first row; feedback sits under the content. */
.choice-option { display: grid; grid-template-columns: auto auto minmax(0, 1fr); column-gap: .75rem; align-items: start; min-width: 0; padding: .875rem 1rem; border: 2px solid var(--bs-border-color); background: var(--bs-body-bg); }
.choice-option:not(:has(input:disabled)) { cursor: pointer; }
.choice-option:not(:has(input:disabled)):hover { border-color: var(--bs-primary-border-subtle); }
.choice-option:focus-within { outline: 2px solid var(--bs-primary); outline-offset: 2px; }
/* Centre the 1em control and the letter on the 1.5rem first line of the content. */
.choice-option .form-check-input { margin-top: .25rem; }
.option-letter { min-width: 1ch; font-size: .875rem; font-weight: 700; line-height: 1.5rem; color: var(--bs-secondary-color); cursor: pointer; }
.option-feedback { grid-column: 3; display: flex; align-items: center; gap: .35rem; margin-top: .5rem; }
.option-selected { border-color: var(--bs-primary); background: rgba(var(--bs-primary-rgb), .06); }
.option-selected .option-feedback { color: var(--bs-primary-text-emphasis); }
.result-correct { border-color: var(--bs-success-border-subtle); }
.result-incorrect { border-color: var(--bs-danger-border-subtle); }
.option-chosen-correct { border-color: var(--bs-success); background: rgba(var(--bs-success-rgb), .06); }
.option-chosen-incorrect { border-color: var(--bs-danger); background: rgba(var(--bs-danger-rgb), .06); }
/* A correct answer the learner missed must not read as a success: dashed amber, not green. */
.option-correct-unselected { border-style: dashed; border-color: var(--app-amber); background: var(--app-amber-bg); }
.option-chosen-correct .option-feedback { color: var(--bs-success-text-emphasis); }
.option-chosen-incorrect .option-feedback { color: var(--bs-danger-text-emphasis); }
.option-correct-unselected .option-feedback { color: var(--app-amber-strong); }
.runner-summary { background: var(--bs-tertiary-bg); }
#runner-summary-heading { scroll-margin-top: var(--runner-scroll-offset); }
.runner-actions .btn { min-height: 2.75rem; }
.runner-actions .runner-submit { min-height: 3rem; padding: .5rem 1.5rem; font-size: 1.125rem; font-weight: 600; }
@media (max-width: 991.98px) {
  /* A block container lets the sticky overview travel with the entire form. */
  .runner-layout { display: block; }
  .runner-overview { top: 0; z-index: 1010; margin-bottom: 1rem; box-shadow: 0 .25rem .5rem rgb(0 0 0 / .08); }
  .overview-desktop { display: none; }
  .overview-mobile { display: flex; align-items: center; gap: .75rem; min-height: 4.5rem; padding: .75rem 1rem; border: 0; border-radius: 0; background: var(--bs-body-bg); }
  .overview-list { display: none; max-height: 50dvh; border-top: 1px solid var(--bs-border-color); }
  .overview-list.overview-open { display: block; }
}
@media (max-width: 575.98px) {
  .question-header { padding: 1rem 1rem 0; }
  .question-body { padding: .5rem 1rem 1rem; }
  .question-prompt { font-size: 1.125rem; }
  .choice-options-media { grid-template-columns: minmax(0, 1fr); }
  .choice-option { column-gap: .625rem; padding: .75rem; }
  .runner-actions .runner-submit { width: 100%; }
}
</style>
