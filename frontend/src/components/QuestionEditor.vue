<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import ContentBlocksEditor from './ContentBlocksEditor.vue'
import EditorMenu from './EditorMenu.vue'
import {
  blankItem, addMatchingPair, removeMatchingPair, assignMatch,
  move, removeChoiceOption, switchChoiceMode, toggleChoiceCorrect, publicationProblems, invalidMediaReference,
  type ContentItem, type Question, type ChoiceQuestion, type MatchingQuestion,
} from '../editor/model'

const props = defineProps<{ question: Question; csrfToken: string; index: number; total: number; initiallyExpanded: boolean }>()
const emit = defineEmits<{ remove: []; move: [direction: -1 | 1]; duplicate: [] }>()
const { t } = useI18n()
const choice = computed<ChoiceQuestion | null>(() => props.question.type === 'choice' ? props.question : null)
const matching = computed<MatchingQuestion | null>(() => props.question.type === 'matching' ? props.question : null)

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
function removePair(leftId: string): void {
  if (matching.value) removeMatchingPair(matching.value, leftId)
}
function currentMatch(leftId: string): string {
  return matching.value?.matches.find((item) => item.leftId === leftId)?.rightId ?? ''
}
function setMatch(leftId: string, rightId: string): void {
  if (!matching.value) return
  if (!rightId) {
    matching.value.matches = matching.value.matches.filter((item) => item.leftId !== leftId)
  } else {
    assignMatch(matching.value, leftId, rightId)
  }
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
        <p class="text-secondary small mt-4">{{ t('editorMatchingHelp') }}</p>
        <div v-for="(left, pairIndex) in matching.leftItems" :key="left.id" class="matching-pair border-top pt-3 mt-3">
          <div class="d-flex align-items-center justify-content-between gap-2 mb-2">
            <h4 class="h6 mb-0">{{ t('editorPairNumber', { index: pairIndex + 1 }) }}</h4>
            <EditorMenu :label="t('editorPairNumber', { index: pairIndex + 1 })">
              <button type="button" class="btn btn-sm text-danger" @click="removePair(left.id)">{{ t('editorRemovePair') }}</button>
            </EditorMenu>
          </div>
          <div class="row g-3 mb-2">
            <div class="col-md-6">
              <ContentBlocksEditor :model-value="left.content" :csrf-token="csrfToken" :label="t('editorLeftItem')"
                @update:model-value="updateContent(left, $event)" />
            </div>
            <div v-if="matching.rightItems[pairIndex]" class="col-md-6">
              <ContentBlocksEditor :model-value="matching.rightItems[pairIndex]!.content"
                :csrf-token="csrfToken" :label="t('editorRightItem')"
                @update:model-value="updateContent(matching!.rightItems[pairIndex]!, $event)" />
            </div>
          </div>
          <label class="form-label small fw-semibold" :for="'matching-' + left.id">{{ t('editorCorrectMatch') }}</label>
          <select :id="'matching-' + left.id" class="form-select form-select-sm"
            :value="currentMatch(left.id)" @change="setMatch(left.id, ($event.target as HTMLSelectElement).value)">
            <option value="">{{ t('editorNoMatch') }}</option>
            <option v-for="(right, rightIndex) in matching.rightItems" :key="right.id" :value="right.id">{{ t('editorRightNumber', { index: rightIndex + 1 }) }}</option>
          </select>
        </div>
        <button class="btn btn-outline-primary btn-sm mt-3" type="button" @click="addPair">+ {{ t('editorAddPair') }}</button>
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
.answer-correct { border-left-color: var(--bs-primary); background: rgb(13 110 253 / .025); }
</style>
