<script setup lang="ts">
import AppIcon from './AppIcon.vue'
import { computed, nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import ContentBlocksEditor from './ContentBlocksEditor.vue'
import EditorMenu from './EditorMenu.vue'
import { matchingRows, confirmMatchingRow, type MatchingRow } from '../editor/matching'
import {
  blankItem, addMatchingPair, removeMatchingPair,
  move, removeChoiceOption, switchChoiceMode, toggleChoiceCorrect, publicationProblems, invalidMediaReference,
  type ContentItem, type Question, type ChoiceQuestion, type MatchingQuestion,
} from '../editor/model'

const props = defineProps<{ question: Question; csrfToken: string; groupId: string; index: number; total: number; initiallyExpanded: boolean }>()
const emit = defineEmits<{ remove: []; move: [direction: -1 | 1]; duplicate: [] }>()
const { t } = useI18n()
const root = ref<HTMLElement | null>(null)
const choice = computed<ChoiceQuestion | null>(() => props.question.type === 'choice' ? props.question : null)
const matching = computed<MatchingQuestion | null>(() => props.question.type === 'matching' ? props.question : null)

const pairs = computed(() => matching.value ? matchingRows(matching.value) : [])
const expanded = ref(props.initiallyExpanded)
const bodyMounted = ref(props.initiallyExpanded)
watch(expanded, value => {
  if (value) bodyMounted.value = true
  else root.value?.querySelectorAll('video').forEach(video => video.pause())
})
// The surrounding test overview can open a collapsed question without
// remounting its composers or discarding another question's expansion state.
defineExpose({ expand: () => { expanded.value = true } })
const complete = computed(() => !publicationProblems([props.question]).length && !invalidMediaReference([props.question]))
const summary = computed(() => props.question.prompt
  .filter(block => block.type === 'text').map(block => block.text.trim()).filter(Boolean).join(' ')
  || t('editorUntitledQuestion'))

function changeMode(value: string): void {
  if (choice.value && (value === 'single' || value === 'multiple')) switchChoiceMode(choice.value, value)
}
function toggleCorrect(id: string, checked: boolean): void {
  if (choice.value) toggleChoiceCorrect(choice.value, id, checked)
}
function addOption(): void {
  if (choice.value) choice.value.options = [...choice.value.options, blankItem()]
}
async function removeOption(id: string): Promise<void> {
  if (!choice.value) return
  const index = choice.value.options.findIndex(option => option.id === id)
  removeChoiceOption(choice.value, id)
  await nextTick()
  focusRemaining('.answer-editor', index, '.add-answer')
}
function orderOption(index: number, direction: -1 | 1): void {
  if (choice.value) choice.value.options = move(choice.value.options, index, direction)
}
function addPair(): void {
  if (matching.value) addMatchingPair(matching.value)
}
async function removePair(row: MatchingRow): Promise<void> {
  if (!matching.value) return
  const index = pairs.value.findIndex(pair => pair.id === row.id)
  removeMatchingPair(matching.value, row.left?.id ?? null, row.right?.id ?? null)
  await nextTick()
  focusRemaining('.matching-pair', index, '.add-pair')
}
function focusRemaining(selector: string, index: number, fallback: string): void {
  const rows = Array.from(root.value?.querySelectorAll<HTMLElement>(selector) ?? [])
  const next = rows[Math.min(index, rows.length - 1)]
  const target = next?.querySelector<HTMLElement>('input, textarea, summary, button') ?? root.value?.querySelector<HTMLElement>(fallback)
  target?.focus()
}
function confirmPair(row: MatchingRow): void {
  if (matching.value) confirmMatchingRow(matching.value, row)
}
function updateContent(item: ContentItem, content: ContentItem['content']): void {
  item.content = content
}
</script>

<template>
  <section ref="root" class="card question-card my-3" :aria-label="t('editorQuestionNumber', { index: index + 1 })">
    <div class="question-header card-header d-flex gap-2 align-items-center p-2 p-sm-3">
      <button type="button" class="question-toggle btn p-0 text-start flex-grow-1 d-flex align-items-center gap-2"
        :aria-expanded="expanded" :aria-controls="'question-body-' + question.id" @click="expanded = !expanded">
        <AppIcon :name="expanded ? 'chevron-up' : 'chevron-down'" />
        <span class="question-heading-content">
          <span class="d-flex flex-wrap align-items-center gap-2">
            <span class="h5 mb-0">{{ t('editorQuestionNumber', { index: index + 1 }) }}</span>
            <span class="small text-secondary">{{ question.type === 'choice' ? t('editorChoice') : t('editorMatching') }}</span>
          </span>
          <span class="question-state small text-secondary" :title="t('editorCompletenessHelp')">
            <AppIcon :name="complete ? 'check2-circle' : 'circle-half'" /> {{ complete ? t('editorComplete') : t('editorIncomplete') }}
          </span>
          <span v-if="!expanded" class="question-summary d-block text-secondary small mt-1">{{ summary }}</span>
        </span>
      </button>
      <EditorMenu :label="t('editorQuestionActions', { index: index + 1 })">
        <button type="button" class="btn btn-sm" :disabled="index === 0" @click="emit('move', -1)"><AppIcon name="arrow-up" />{{ t('editorMoveUp') }}</button>
        <button type="button" class="btn btn-sm" :disabled="index === total - 1" @click="emit('move', 1)"><AppIcon name="arrow-down" />{{ t('editorMoveDown') }}</button>
        <button type="button" class="btn btn-sm" @click="emit('duplicate')"><AppIcon name="copy" />{{ t('editorDuplicateQuestion') }}</button>
        <button type="button" class="btn btn-sm text-danger" @click="emit('remove')"><AppIcon name="trash3" />{{ t('editorRemoveQuestion') }}</button>
      </EditorMenu>
    </div>

    <!-- Mount lazily, then retain composers/media while collapsed. Pausing on
         collapse keeps hidden playback silent without discarding its position. -->
    <div v-if="bodyMounted" v-show="expanded" :id="'question-body-' + question.id" class="question-body p-2 p-sm-3">
      <section class="question-prompt rounded p-2 p-sm-3" :aria-labelledby="'prompt-heading-' + question.id">
        <h2 :id="'prompt-heading-' + question.id" class="h6 mb-3">{{ t('editorPrompt') }}</h2>
        <ContentBlocksEditor v-model="question.prompt" :csrf-token="csrfToken" :group-id="groupId" :label="t('editorPrompt')"
          :add-label="t('editorAddPromptContent')" hide-label />
      </section>
      <section v-if="choice" class="question-answers" :aria-labelledby="'answers-heading-' + question.id">
        <div class="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-2">
          <h2 :id="'answers-heading-' + question.id" class="h6 mb-0">{{ t('editorAnswers') }}</h2>
          <div class="choice-mode-control d-flex flex-wrap align-items-center gap-2">
            <label class="small text-secondary" :for="'mode-' + question.id">{{ t('editorChoiceMode') }}</label>
            <select :id="'mode-' + question.id" class="form-select form-select-sm choice-mode"
              :value="choice.mode" @change="changeMode(($event.target as HTMLSelectElement).value)">
              <option value="single">{{ t('editorSingle') }}</option>
              <option value="multiple">{{ t('editorMultiple') }}</option>
            </select>
          </div>
        </div>
        <p class="small text-secondary mb-2">{{ t('editorCorrectHint') }}</p>
        <p v-if="!choice.correctOptionIds.length" class="small text-warning-emphasis" role="status">{{ t('editorNoCorrectCompact') }}</p>
        <div v-for="(option, optionIndex) in choice.options" :key="option.id" class="answer-editor rounded p-2 p-md-3 mb-3" :data-option-id="option.id"
          :class="{ 'answer-correct': choice.correctOptionIds.includes(option.id) }">
          <div class="answer-heading mb-2">
            <span class="fw-semibold">{{ t('editorOptionNumber', { index: optionIndex + 1 }) }}</span>
            <label :for="'correct-' + option.id" class="answer-correct-control small">
              <input :id="'correct-' + option.id" class="form-check-input m-0"
                :type="choice.mode === 'single' ? 'radio' : 'checkbox'" :name="'correct-' + choice.id"
                :checked="choice.correctOptionIds.includes(option.id)" :aria-label="t('editorMarkOptionCorrect', { index: optionIndex + 1 })"
                @change="toggleCorrect(option.id, ($event.target as HTMLInputElement).checked)" />
              <span>{{ t('editorCorrectAnswer') }}</span>
            </label>
            <EditorMenu class="answer-actions" :label="t('editorAnswerActions', { index: optionIndex + 1 })">
              <button type="button" class="btn btn-sm" :disabled="optionIndex === 0" @click="orderOption(optionIndex, -1)"><AppIcon name="arrow-up" />{{ t('editorMoveUp') }}</button>
              <button type="button" class="btn btn-sm" :disabled="optionIndex === choice.options.length - 1" @click="orderOption(optionIndex, 1)"><AppIcon name="arrow-down" />{{ t('editorMoveDown') }}</button>
              <button type="button" class="btn btn-sm text-danger" @click="removeOption(option.id)"><AppIcon name="trash3" />{{ t('editorRemoveOption') }}</button>
            </EditorMenu>
          </div>
          <ContentBlocksEditor :model-value="option.content" :csrf-token="csrfToken" :group-id="groupId"
            :label="t('editorOptionNumber', { index: optionIndex + 1 })" hide-label @update:model-value="updateContent(option, $event)" />
        </div>
        <button class="btn btn-outline-primary btn-sm add-answer" type="button" @click="addOption"><AppIcon name="plus-lg" />{{ t('editorAddOption') }}</button>
      </section>

      <section v-if="matching" class="question-answers" :aria-labelledby="'pairs-heading-' + question.id">
        <h2 :id="'pairs-heading-' + question.id" class="h6 mb-1">{{ t('editorCorrectPairs') }}</h2>
        <p class="text-secondary small mb-3">{{ t('editorDirectPairsHelp') }}</p>
        <section v-for="(pair, pairIndex) in pairs" :key="pair.id" class="matching-pair border rounded mb-3"
          :aria-label="t('editorPairNumber', { index: pairIndex + 1 })" :data-pair-id="pair.id">
          <div class="pair-header d-flex align-items-center justify-content-between gap-2 px-2 py-2 border-bottom">
            <h3 class="h6 mb-0">{{ t('editorPairNumber', { index: pairIndex + 1 }) }}</h3>
            <EditorMenu :label="t('editorPairActions', { index: pairIndex + 1 })">
              <button type="button" class="btn btn-sm text-danger" @click="removePair(pair)"><AppIcon name="trash3" />{{ t('editorRemovePair') }}</button>
            </EditorMenu>
          </div>
          <div class="pair-items p-2 p-sm-3">
            <div class="pair-item">
              <p class="small text-secondary mb-2">{{ t('editorLeftItem') }}</p>
              <ContentBlocksEditor v-if="pair.left" :model-value="pair.left.content" :csrf-token="csrfToken" :group-id="groupId"
                :label="t('editorPairNumber', { index: pairIndex + 1 }) + ': ' + t('editorLeftItem')" hide-label
                @update:model-value="updateContent(pair.left!, $event)" />
              <button v-else type="button" class="btn btn-outline-primary btn-sm" @click="confirmPair(pair)">
                <AppIcon name="plus-lg" />{{ t('editorCompleteLeft') }}
              </button>
            </div>
            <span class="pair-connection text-secondary" aria-hidden="true"><AppIcon name="link-45deg" /></span>
            <div class="pair-item">
              <p class="small text-secondary mb-2">{{ t('editorRightItem') }}</p>
              <ContentBlocksEditor v-if="pair.right" :model-value="pair.right.content" :csrf-token="csrfToken" :group-id="groupId"
                :label="t('editorPairNumber', { index: pairIndex + 1 }) + ': ' + t('editorRightItem')" hide-label
                @update:model-value="updateContent(pair.right!, $event)" />
              <button v-else type="button" class="btn btn-outline-primary btn-sm" @click="confirmPair(pair)">
                <AppIcon name="plus-lg" />{{ t('editorCompleteRight') }}
              </button>
            </div>
          </div>
          <div v-if="!pair.confirmed && pair.left && pair.right"
            class="d-flex flex-wrap align-items-center justify-content-between gap-2 border-top p-2 bg-warning-subtle">
            <span class="small">{{ t('editorUnconfirmedPair') }}</span>
            <button type="button" class="btn btn-outline-primary btn-sm" @click="confirmPair(pair)"><AppIcon name="check-lg" />{{ t('editorConfirmPair') }}</button>
          </div>
        </section>
        <button class="btn btn-outline-primary btn-sm add-pair" type="button" @click="addPair"><AppIcon name="plus-lg" />{{ t('editorAddPair') }}</button>
        <p class="small text-secondary mt-2 mb-0">{{ t('editorMatchingShuffle') }}</p>
      </section>
    </div>
  </section>
</template>

<style scoped>
.question-card { min-width: 0; border-color: var(--bs-border-color); container-type: inline-size; }
.question-card:has(.editor-menu[open]) { z-index: 45; }
.question-header { background: var(--bs-tertiary-bg); }
.question-toggle { min-width: 0; min-height: 2.75rem; border: 0; }
.question-toggle > .app-icon { flex-shrink: 0; margin: 0; }
.question-heading-content { min-width: 0; }
.question-state { display: block; margin-top: .25rem; }
.question-body { display: grid; gap: 1.5rem; }
.question-prompt { background: var(--bs-tertiary-bg); }
.question-prompt:has(.editor-menu[open]) { position: relative; z-index: 45; }
.question-toggle:focus-visible { box-shadow: 0 0 0 .2rem var(--bs-focus-ring-color); }
.question-summary { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 65ch; }
.choice-mode { width: auto; max-width: 100%; }
.choice-mode-control { min-width: 0; max-width: 100%; }
.answer-editor { min-width: 0; border: 1px solid var(--bs-border-color); container-type: inline-size; }
.answer-editor:has(.editor-menu[open]), .matching-pair:has(.editor-menu[open]) { position: relative; z-index: 45; }
.answer-heading { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: .5rem .75rem; }
.answer-correct-control { display: flex; align-items: center; justify-self: end; gap: .5rem; min-height: 2.75rem; color: var(--bs-secondary-color); }
.answer-correct-control input { flex-shrink: 0; width: 1.5rem; height: 1.5rem; border: 2px solid var(--bs-secondary-color); }
.answer-correct-control input:focus-visible { outline: 2px solid var(--bs-primary); outline-offset: 3px; box-shadow: none; }
.answer-correct { background: color-mix(in srgb, var(--bs-success-bg-subtle) 50%, var(--bs-body-bg)); }
.answer-correct .answer-correct-control { color: var(--bs-success-text-emphasis); }
.answer-correct .form-check-input:checked { background-color: var(--bs-success); border-color: var(--bs-success); }
.matching-pair, .pair-header { background: var(--bs-tertiary-bg); }
.pair-items { display: grid; grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr); gap: .75rem; align-items: start; }
.pair-item { min-width: 0; }
.pair-connection { align-self: center; }
.add-answer, .add-pair { min-height: 2.75rem; }
@container (max-width: 40rem) {
  .pair-items { grid-template-columns: minmax(0, 1fr); gap: .5rem; }
  .pair-connection { justify-self: center; }
}
@container (max-width: 26rem) {
  .answer-heading { grid-template-columns: minmax(0, 1fr) auto; }
  .answer-correct-control { grid-column: 1 / -1; grid-row: 2; justify-self: start; }
  .answer-actions { grid-column: 2; grid-row: 1; }
}
</style>
