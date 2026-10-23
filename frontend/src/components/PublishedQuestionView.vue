<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import ContentBlocksViewer from './ContentBlocksViewer.vue'
import { matchingRows } from '../editor/matching'
import type { Question } from '../editor/model'

const props = defineProps<{ question: Question; index: number }>()
const { t } = useI18n()

// Project saved answer-key IDs, never array positions, into non-editable pairs.
// The projection does not modify the canonical question or guess missing links.
const pairs = computed(() => props.question.type === 'matching'
  ? matchingRows(props.question).filter(row => row.confirmed)
  : [])
</script>

<template>
  <section class="card p-3 mb-3" :aria-labelledby="'readonly-question-' + question.id">
    <h3 :id="'readonly-question-' + question.id" class="h5 mb-3">
      {{ t('editorQuestionNumber', { index: index + 1 }) }}
      <span class="small text-secondary ms-2">
        {{ t(question.type === 'choice' ? 'editorChoice' : 'editorMatching') }}
      </span>
    </h3>
    <ContentBlocksViewer :blocks="question.prompt" private-preview />

    <template v-if="question.type === 'choice'">
      <p class="small text-secondary mt-3 mb-2">
        {{ t(question.mode === 'single' ? 'editorSingle' : 'editorMultiple') }}
      </p>
      <div v-for="(option, optionIndex) in question.options" :key="option.id"
        class="border rounded p-2 mb-2">
        <div class="d-flex flex-wrap gap-2 align-items-center mb-2">
          <span class="fw-semibold">{{ t('editorOptionNumber', { index: optionIndex + 1 }) }}</span>
          <span v-if="question.correctOptionIds.includes(option.id)"
            class="badge bg-success-subtle text-success-emphasis">
            {{ t('editorCorrectBadge') }}
          </span>
        </div>
        <ContentBlocksViewer :blocks="option.content" private-preview />
      </div>
    </template>

    <template v-else>
      <h4 class="h6 mt-3 mb-2">{{ t('editorCorrectPairs') }}</h4>
      <div v-for="(pair, pairIndex) in pairs" :key="pair.id"
        class="border rounded mb-3" :aria-label="t('editorPairNumber', { index: pairIndex + 1 })">
        <h5 class="h6 border-bottom p-2 mb-0">{{ t('editorPairNumber', { index: pairIndex + 1 }) }}</h5>
        <div class="row g-3 p-2">
          <div class="col-md-6">
            <p class="small text-secondary mb-1">{{ t('editorLeftItem') }}</p>
            <ContentBlocksViewer v-if="pair.left" :blocks="pair.left.content" private-preview />
          </div>
          <div class="col-md-6">
            <p class="small text-secondary mb-1">{{ t('editorRightItem') }}</p>
            <ContentBlocksViewer v-if="pair.right" :blocks="pair.right.content" private-preview />
          </div>
        </div>
      </div>
    </template>
  </section>
</template>
