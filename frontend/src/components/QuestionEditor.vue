<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import ContentBlocksEditor from './ContentBlocksEditor.vue'
import {
  blankItem, addMatchingPair, removeMatchingPair, assignMatch,
  move, removeChoiceOption, switchChoiceMode, toggleChoiceCorrect,
  type ContentItem, type Question, type ChoiceQuestion, type MatchingQuestion,
} from '../editor/model'

const props = defineProps<{ question: Question; csrfToken: string; index: number }>()
const emit = defineEmits<{ remove: []; move: [direction: -1 | 1] }>()
const { t } = useI18n()
const choice = computed<ChoiceQuestion | null>(() => props.question.type === 'choice' ? props.question : null)
const matching = computed<MatchingQuestion | null>(() => props.question.type === 'matching' ? props.question : null)

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
  <section class="card p-3 my-3" :aria-label="t('editorQuestionNumber', { index: index + 1 })">
    <div class="d-flex gap-2 flex-wrap align-items-center">
      <h3 class="h5 mb-0">
        {{ t('editorQuestionNumber', { index: index + 1 }) }}:
        {{ question.type === 'choice' ? t('editorChoice') : t('editorMatching') }}
      </h3>
      <div class="ms-auto d-flex gap-1">
        <button type="button" class="btn btn-outline-secondary btn-sm" :aria-label="t('editorMoveUp')"
          @click="emit('move', -1)">↑</button>
        <button type="button" class="btn btn-outline-secondary btn-sm" :aria-label="t('editorMoveDown')"
          @click="emit('move', 1)">↓</button>
        <button type="button" class="btn btn-outline-danger btn-sm" @click="emit('remove')">
          {{ t('editorRemoveQuestion') }}
        </button>
      </div>
    </div>

    <ContentBlocksEditor v-model="question.prompt" :csrf-token="csrfToken"
      :label="t('editorPrompt')" />

    <template v-if="choice">
      <div class="mb-3">
        <label class="form-label" :for="'mode-' + question.id">{{ t('editorChoiceMode') }}</label>
        <select :id="'mode-' + question.id" class="form-select"
          :value="choice.mode" @change="changeMode(($event.target as HTMLSelectElement).value)">
          <option value="single">{{ t('editorSingle') }}</option>
          <option value="multiple">{{ t('editorMultiple') }}</option>
        </select>
      </div>
      <div v-for="(option, optionIndex) in choice.options" :key="option.id" class="border rounded p-2 mb-3">
        <div class="d-flex align-items-center flex-wrap gap-2">
          <h4 class="h6 mb-0">{{ t('editorOptionNumber', { index: optionIndex + 1 }) }}</h4>
          <div class="ms-auto d-flex gap-1">
            <button type="button" class="btn btn-outline-secondary btn-sm" :aria-label="t('editorMoveUp')"
              :disabled="optionIndex === 0" @click="orderOption(optionIndex, -1)">↑</button>
            <button type="button" class="btn btn-outline-secondary btn-sm" :aria-label="t('editorMoveDown')"
              :disabled="optionIndex === choice.options.length - 1" @click="orderOption(optionIndex, 1)">↓</button>
            <button type="button" class="btn btn-outline-danger btn-sm" @click="removeOption(option.id)">
              {{ t('editorRemove') }}
            </button>
          </div>
        </div>
        <ContentBlocksEditor :model-value="option.content" :csrf-token="csrfToken"
          :label="t('editorAnswerContent')"
          @update:model-value="updateContent(option, $event)" />
        <div class="form-check">
          <input :id="'correct-' + option.id" class="form-check-input"
            :type="choice.mode === 'single' ? 'radio' : 'checkbox'"
            :name="'correct-' + choice.id"
            :checked="choice.correctOptionIds.includes(option.id)"
            @change="toggleCorrect(option.id, ($event.target as HTMLInputElement).checked)" />
          <label :for="'correct-' + option.id" class="form-check-label">{{ t('editorCorrectAnswer') }}</label>
        </div>
      </div>
      <button class="btn btn-outline-primary btn-sm align-self-start" type="button" @click="addOption">
        {{ t('editorAddOption') }}
      </button>
    </template>

    <template v-if="matching">
      <p class="text-secondary small">{{ t('editorMatchingHelp') }}</p>
      <div v-for="(left, pairIndex) in matching.leftItems" :key="left.id" class="border rounded p-2 mb-3">
        <div class="d-flex align-items-center justify-content-between gap-2">
          <h4 class="h6 mb-0">{{ t('editorPairNumber', { index: pairIndex + 1 }) }}</h4>
          <button type="button" class="btn btn-outline-danger btn-sm"
            @click="removePair(left.id)">{{ t('editorRemovePair') }}</button>
        </div>
        <div class="row">
          <div class="col-md-6">
            <ContentBlocksEditor :model-value="left.content" :csrf-token="csrfToken"
              :label="t('editorLeftItem')"
              @update:model-value="updateContent(left, $event)" />
          </div>
          <div v-if="matching.rightItems[pairIndex]" class="col-md-6">
            <ContentBlocksEditor :model-value="matching.rightItems[pairIndex]!.content"
              :csrf-token="csrfToken" :label="t('editorRightItem')"
              @update:model-value="updateContent(matching!.rightItems[pairIndex]!, $event)" />
          </div>
        </div>
        <label class="form-label" :for="'matching-' + left.id">{{ t('editorCorrectMatch') }}</label>
        <select :id="'matching-' + left.id" class="form-select"
          :value="currentMatch(left.id)" @change="setMatch(left.id, ($event.target as HTMLSelectElement).value)">
          <option value="">{{ t('editorNoMatch') }}</option>
          <option v-for="(right, rightIndex) in matching.rightItems" :key="right.id"
            :value="right.id">{{ t('editorRightNumber', { index: rightIndex + 1 }) }}</option>
        </select>
      </div>
      <button class="btn btn-outline-primary btn-sm align-self-start" type="button" @click="addPair">
        {{ t('editorAddPair') }}
      </button>
    </template>
  </section>
</template>
