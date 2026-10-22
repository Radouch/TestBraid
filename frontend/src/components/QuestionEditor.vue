<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import ContentBlocksEditor from './ContentBlocksEditor.vue'
import EditorMenu from './EditorMenu.vue'
import { matchingRows, confirmMatchingRow, type MatchingRow } from '../editor/matching'
import {
  blankItem, addMatchingPair, removeMatchingPair,
  move, removeChoiceOption, switchChoiceMode, toggleChoiceCorrect, publicationProblems, invalidMediaReference,
  type ContentItem, type Question, type ChoiceQuestion, type MatchingQuestion,
} from '../editor/model'

const props = defineProps<{ question: Question; csrfToken: string; index: number; total: number; initiallyExpanded: boolean }>()
const emit = defineEmits<{ remove: []; move: [direction: -1 | 1]; duplicate: [] }>()
const { t } = useI18n()
const choice = computed<ChoiceQuestion | null>(() => props.question.type === 'choice' ? props.question : null)
const matching = computed<MatchingQuestion | null>(() => props.question.type === 'matching' ? props.question : null)

const pairs = computed(() => matching.value ? matchingRows(matching.value) : [])
const expanded = ref(props.initiallyExpanded)
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
function removeOption(id: string): void {
  if (choice.value) removeChoiceOption(choice.value, id)
}
function orderOption(index: number, direction: -1 | 1): void {
  if (choice.value) choice.value.options = move(choice.value.options, index, direction)
}
function addPair(): void {
  if (matching.value) addMatchingPair(matching.value)
}
function removePair(row: MatchingRow): void {
  if (matching.value) removeMatchingPair(matching.value, row.left?.id ?? null, row.right?.id ?? null)
}
function confirmPair(row: MatchingRow): void {
  if (matching.value) confirmMatchingRow(matching.value, row)
}
function updateContent(item: ContentItem, content: ContentItem['content']): void {
  item.content = content
}
</script>

<template>
  <section class="card question-card my-3" :aria-label="t('editorQuestionNumber', { index: index + 1 })">
    <div class="question-header d-flex gap-2 align-items-center p-3">
      <button type="button" class="question-toggle btn p-0 text-start flex-grow-1"
        :aria-expanded="expanded" :aria-controls="'question-body-' + question.id" @click="expanded = !expanded">
        <span class="d-flex flex-wrap align-items-center gap-2">
          <span class="h5 mb-0">{{ t('editorQuestionNumber', { index: index + 1 }) }}</span>
          <span class="small text-secondary">{{ question.type === 'choice' ? t('editorChoice') : t('editorMatching') }}</span>
          <span class="badge rounded-pill" :class="complete ? 'text-bg-success' : 'text-bg-light text-secondary border'">
            {{ complete ? t('editorComplete') : t('editorIncomplete') }}
          </span>
        </span>
        <span v-if="!expanded" class="question-summary d-block text-secondary small mt-2">{{ summary }}</span>
      </button>
      <EditorMenu :label="t('editorQuestionActions', { index: index + 1 })">
        <button type="button" class="btn btn-sm" :disabled="index === 0" @click="emit('move', -1)">{{ t('editorMoveUp') }}</button>
        <button type="button" class="btn btn-sm" :disabled="index === total - 1" @click="emit('move', 1)">{{ t('editorMoveDown') }}</button>
        <button type="button" class="btn btn-sm" @click="emit('duplicate')">{{ t('editorDuplicateQuestion') }}</button>
        <button type="button" class="btn btn-sm text-danger" @click="emit('remove')">{{ t('editorRemoveQuestion') }}</button>
      </EditorMenu>
      <button type="button" class="btn btn-sm" :aria-label="expanded ? t('editorCollapseQuestion') : t('editorExpandQuestion')"
        :aria-expanded="expanded" :aria-controls="'question-body-' + question.id" @click="expanded = !expanded">
        <span aria-hidden="true">{{ expanded ? '⌃' : '⌄' }}</span>
      </button>
    </div>

    <div v-if="expanded" :id="'question-body-' + question.id" class="px-3 pb-3">
      <ContentBlocksEditor v-model="question.prompt" :csrf-token="csrfToken" :label="t('editorPrompt')" />
      <template v-if="choice">
        <div class="d-flex flex-wrap align-items-center justify-content-between gap-2 mt-4 mb-2">
          <h4 class="h6 mb-0">{{ t('editorAnswers') }}</h4>
          <div class="d-flex flex-wrap align-items-center gap-2">
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
        <div v-for="(option, optionIndex) in choice.options" :key="option.id" class="answer-editor rounded p-2 p-md-3 mb-2"
          :class="{ 'answer-correct': choice.correctOptionIds.includes(option.id) }">
          <div class="d-flex align-items-center flex-wrap gap-2 mb-1">
            <input :id="'correct-' + option.id" class="form-check-input m-0"
              :type="choice.mode === 'single' ? 'radio' : 'checkbox'" :name="'correct-' + choice.id"
              :checked="choice.correctOptionIds.includes(option.id)" :aria-label="t('editorMarkOptionCorrect', { index: optionIndex + 1 })"
              @change="toggleCorrect(option.id, ($event.target as HTMLInputElement).checked)" />
            <label :for="'correct-' + option.id" class="fw-semibold">{{ t('editorOptionNumber', { index: optionIndex + 1 }) }}</label>
            <span v-if="choice.correctOptionIds.includes(option.id)" class="badge bg-success-subtle text-success-emphasis">✓ {{ t('editorCorrectBadge') }}</span>
            <EditorMenu class="ms-auto" :label="t('editorAnswerActions', { index: optionIndex + 1 })">
              <button type="button" class="btn btn-sm" :disabled="optionIndex === 0" @click="orderOption(optionIndex, -1)">{{ t('editorMoveUp') }}</button>
              <button type="button" class="btn btn-sm" :disabled="optionIndex === choice.options.length - 1" @click="orderOption(optionIndex, 1)">{{ t('editorMoveDown') }}</button>
              <button type="button" class="btn btn-sm text-danger" @click="removeOption(option.id)">{{ t('editorRemoveOption') }}</button>
            </EditorMenu>
          </div>
          <ContentBlocksEditor :model-value="option.content" :csrf-token="csrfToken"
            :label="t('editorOptionNumber', { index: optionIndex + 1 })" hide-label @update:model-value="updateContent(option, $event)" />
        </div>
        <button class="btn btn-outline-primary btn-sm mt-2" type="button" @click="addOption">+ {{ t('editorAddOption') }}</button>
      </template>

      <template v-if="matching">
        <h4 class="h6 mt-4 mb-1">{{ t('editorCorrectPairs') }}</h4>
        <p class="text-secondary small mb-3">{{ t('editorDirectPairsHelp') }}</p>
        <div class="row mb-2 small fw-semibold text-secondary d-none d-md-flex" aria-hidden="true">
          <div class="col-md-6">{{ t('editorLeftItem') }}</div>
          <div class="col-md-6">{{ t('editorRightItem') }}</div>
        </div>
        <section v-for="(pair, pairIndex) in pairs" :key="pair.id" class="matching-pair border rounded mb-3"
          :aria-label="t('editorPairNumber', { index: pairIndex + 1 })">
          <div class="pair-header d-flex align-items-center justify-content-between gap-2 px-2 py-2 border-bottom">
            <h5 class="h6 mb-0">{{ t('editorPairNumber', { index: pairIndex + 1 }) }}</h5>
            <button type="button" class="btn btn-outline-danger btn-sm" @click="removePair(pair)">{{ t('editorRemovePair') }}</button>
          </div>
          <div class="row g-3 p-2">
            <div class="col-md-6">
              <p class="small text-secondary mb-1 d-md-none">{{ t('editorLeftItem') }}</p>
              <ContentBlocksEditor v-if="pair.left" :model-value="pair.left.content" :csrf-token="csrfToken"
                :label="t('editorPairNumber', { index: pairIndex + 1 }) + ': ' + t('editorLeftItem')" hide-label
                @update:model-value="updateContent(pair.left!, $event)" />
              <button v-else type="button" class="btn btn-outline-primary btn-sm" @click="confirmPair(pair)">
                + {{ t('editorCompleteLeft') }}
              </button>
            </div>
            <div class="col-md-6">
              <p class="small text-secondary mb-1 d-md-none">{{ t('editorRightItem') }}</p>
              <ContentBlocksEditor v-if="pair.right" :model-value="pair.right.content" :csrf-token="csrfToken"
                :label="t('editorPairNumber', { index: pairIndex + 1 }) + ': ' + t('editorRightItem')" hide-label
                @update:model-value="updateContent(pair.right!, $event)" />
              <button v-else type="button" class="btn btn-outline-primary btn-sm" @click="confirmPair(pair)">
                + {{ t('editorCompleteRight') }}
              </button>
            </div>
          </div>
          <div v-if="!pair.confirmed && pair.left && pair.right"
            class="d-flex flex-wrap align-items-center justify-content-between gap-2 border-top p-2 bg-warning-subtle">
            <span class="small">{{ t('editorUnconfirmedPair') }}</span>
            <button type="button" class="btn btn-outline-primary btn-sm" @click="confirmPair(pair)">{{ t('editorConfirmPair') }}</button>
          </div>
        </section>
        <button class="btn btn-outline-primary btn-sm" type="button" @click="addPair">+ {{ t('editorAddPair') }}</button>
        <p class="small text-secondary mt-2 mb-0">{{ t('editorMatchingShuffle') }}</p>
      </template>
    </div>
  </section>
</template>

<style scoped>
.question-card { border-color: var(--bs-border-color); box-shadow: 0 .1rem .3rem rgb(0 0 0 / .025); }
.question-toggle { min-width: 0; border: 0; }
.question-toggle:focus-visible { box-shadow: 0 0 0 .2rem rgb(13 110 253 / .25); }
.question-summary { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 65ch; }
.choice-mode { width: auto; max-width: 100%; }
.answer-editor { border: 1px solid var(--bs-border-color); border-left-width: 3px; }
.pair-header { background: var(--bs-tertiary-bg); }
.answer-correct { border-left-color: var(--bs-primary); background: rgb(13 110 253 / .025); }
</style>
