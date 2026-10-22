<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import ContentBlocksViewer from './ContentBlocksViewer.vue'
import { createMatchingOrder } from '../learner/presentation'
import type { ContentItem, DraftTest, Question } from '../editor/model'
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
const answers = ref<Answers>(freshAnswers())
const submitted = ref(false)
const matchingOrder = ref<Record<string, string[]>>({})
const result = computed(() => grade(props.test.questions, answers.value))
const resultsById = computed(() =>
  new Map(result.value.results.map(item => [item.questionId, item])))
const incompleteDraft = computed(() => props.privatePreview && props.test.questions.length === 0)

function resultFor(question: Question): QuestionResult | undefined {
  return resultsById.value.get(question.id)
}
function rightName(item: ContentItem, index: number): string {
  const text = item.content.filter(block => block.type === 'text')
    .map(block => block.type === 'text' ? block.text.trim() : '')
    .filter(Boolean).join(' ')
  return text ? t('runnerRightItem', { index: index + 1 }) + ': ' + text.slice(0, 100)
    : t('runnerRightItem', { index: index + 1 })
}
function displayedRightItems(question: Extract<Question, { type: 'matching' }>): ContentItem[] {
  const byId = new Map(question.rightItems.map(item => [item.id, item]))
  return (matchingOrder.value[question.id] ?? []).flatMap(id => {
    const item = byId.get(id)
    return item ? [item] : []
  })
}
function rightLabel(question: Extract<Question, { type: 'matching' }>, rightId: string): string {
  const items = displayedRightItems(question)
  const index = items.findIndex(item => item.id === rightId)
  return index === -1 ? t('runnerNotAnswered') : rightName(items[index]!, index)
}
function choose(question: Extract<Question, { type: 'choice' }>, id: string, checked: boolean): void {
  if (!submitted.value) answers.value = setChoiceAnswer(answers.value, question, id, checked)
}
function match(question: Extract<Question, { type: 'matching' }>, leftId: string, rightId: string): void {
  if (!submitted.value) answers.value = setMatchingAnswer(answers.value, question, leftId, rightId)
}
function restart(): void {
  answers.value = freshAnswers()
  submitted.value = false
  matchingOrder.value = createMatchingOrder(props.test.questions)
}
// Initialize once per loaded test; answer changes and translations must never
// reshuffle an ongoing attempt or renumber its result feedback.
watch(() => props.test, restart, { immediate: true })
</script>

<template>
  <article class="py-2">
    <h1 class="h3">{{ test.title }}</h1>
    <p v-if="test.description" class="mb-3" style="white-space: pre-wrap">{{ test.description }}</p>
    <div v-if="privatePreview" class="alert alert-info" role="status">
      {{ t('runnerPreviewBanner') }}
    </div>
    <p v-if="incompleteDraft" class="alert alert-warning" role="status">
      {{ t('runnerEmptyDraft') }}
    </p>

    <form @submit.prevent="submitted = true">
      <section v-for="(question, index) in test.questions" :key="question.id"
        class="card p-3 mb-4" :aria-labelledby="'runner-question-' + question.id">
        <h2 :id="'runner-question-' + question.id" class="h5">
          {{ t('runnerQuestion', { index: index + 1 }) }}
        </h2>
        <ContentBlocksViewer :blocks="question.prompt"
          :private-preview="privatePreview" :media-urls="mediaUrls" />

        <template v-if="question.type === 'choice'">
          <p class="small text-secondary mt-3">
            {{ t(question.mode === 'single' ? 'runnerPickOne' : 'runnerPickMultiple') }}
          </p>
          <div v-for="(option, optionIndex) in question.options" :key="option.id"
            class="border rounded p-2 mb-2">
            <div class="d-flex gap-2 align-items-start">
              <input :id="'runner-option-' + question.id + '-' + option.id"
                class="form-check-input mt-1" :type="question.mode === 'single' ? 'radio' : 'checkbox'"
                :name="'runner-choice-' + question.id"
                :checked="(answers.choices[question.id] ?? []).includes(option.id)"
                :disabled="submitted"
                @change="choose(question, option.id, ($event.target as HTMLInputElement).checked)" />
              <div class="flex-grow-1">
                <label class="fw-semibold d-block" :for="'runner-option-' + question.id + '-' + option.id">
                  {{ t('runnerAnswer', { index: optionIndex + 1 }) }}
                </label>
                <!-- Video controls must not be nested in a radio/checkbox label:
                     playback and seeking may not change the selected answer. -->
                <ContentBlocksViewer :blocks="option.content"
                  :private-preview="privatePreview" :media-urls="mediaUrls" />
              </div>
            </div>
            <p v-if="submitted && question.correctOptionIds.includes(option.id)"
              class="text-success small mb-0">{{ t('runnerCorrectOption') }}</p>
          </div>
        </template>

        <template v-else>
          <p class="small text-secondary mt-3">{{ t('runnerMatchingInstruction') }}</p>
          <!-- The list, selects and result labels share one attempt-local order. -->
          <div class="border rounded p-2 mb-3">
            <h3 class="h6">{{ t('runnerRightColumn') }}</h3>
            <div v-for="(item, rightIndex) in displayedRightItems(question)" :key="item.id"
              class="border-top py-2">
              <strong>{{ t('runnerRightItem', { index: rightIndex + 1 }) }}</strong>
              <ContentBlocksViewer :blocks="item.content"
                :private-preview="privatePreview" :media-urls="mediaUrls" />
            </div>
          </div>
          <div v-for="(item, leftIndex) in question.leftItems" :key="item.id"
            class="border rounded p-2 mb-2">
            <h3 class="h6">{{ t('runnerLeftItem', { index: leftIndex + 1 }) }}</h3>
            <ContentBlocksViewer :blocks="item.content"
              :private-preview="privatePreview" :media-urls="mediaUrls" />
            <label class="form-label mt-2" :for="'runner-match-' + question.id + '-' + item.id">
              {{ t('runnerSelectMatch') }}
            </label>
            <select :id="'runner-match-' + question.id + '-' + item.id" class="form-select"
              :value="answers.matches[question.id]?.[item.id] ?? ''" :disabled="submitted"
              @change="match(question, item.id, ($event.target as HTMLSelectElement).value)">
              <option value="">{{ t('runnerNotAnswered') }}</option>
              <option v-for="(right, rightIndex) in displayedRightItems(question)" :key="right.id"
                :value="right.id"
                :disabled="Object.entries(answers.matches[question.id] ?? {}).some(([key, selected]) => key !== item.id && selected === right.id)">
                {{ rightName(right, rightIndex) }}
              </option>
            </select>
            <p v-if="submitted" class="small mt-2 mb-0">
              {{ t('runnerCorrectMatch') }}:
              <strong>{{ rightLabel(question, question.matches.find(pair => pair.leftId === item.id)?.rightId ?? '') }}</strong>
            </p>
          </div>
        </template>

        <p v-if="privatePreview && !hasValidAnswerKey(question)"
          class="alert alert-warning py-2 mt-3 mb-0" role="status">
          {{ t('runnerMissingAnswerKey') }}
        </p>
        <p v-if="submitted && (!privatePreview || hasValidAnswerKey(question))" class="mt-3 mb-0"
          :class="resultFor(question)?.correct ? 'text-success' : 'text-danger'"
          role="status">
          {{ t(resultFor(question)?.correct ? 'runnerQuestionCorrect'
            : resultFor(question)?.answered ? 'runnerQuestionIncorrect' : 'runnerQuestionUnanswered') }}
        </p>
      </section>

      <div v-if="test.questions.length > 0" class="d-flex gap-2 flex-wrap align-items-center">
        <button v-if="!submitted" class="btn btn-primary" type="submit">{{ t('runnerSubmit') }}</button>
        <button v-else type="button" class="btn btn-outline-primary" @click="restart">
          {{ t('runnerTryAgain') }}
        </button>
      </div>
    </form>
    <div v-if="submitted" class="alert alert-primary mt-3" role="status">
      <strong>{{ t('runnerScore', { score: result.correct, total: result.total }) }}</strong>
      <p class="mb-0">{{ t('runnerResultsHint') }}</p>
    </div>
    <p class="text-secondary small mt-3">{{ t('runnerNoStorage') }}</p>
  </article>
</template>
