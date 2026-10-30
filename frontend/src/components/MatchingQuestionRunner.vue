<script setup lang="ts">
import AppIcon from './AppIcon.vue'
import { computed, nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import ContentBlocksViewer from './ContentBlocksViewer.vue'
import type { MatchingQuestion } from '../editor/model'
import { matchingPresentation } from '../learner/matching'
import { hasValidAnswerKey } from '../learner/scoring'

const props = defineProps<{
  question: MatchingQuestion
  responses: Record<string, string>
  rightOrder: string[]
  submitted: boolean
  privatePreview?: boolean
  mediaUrls?: Record<string, string>
}>()
const emit = defineEmits<{ match: [leftId: string, rightId: string] }>()
const { t } = useI18n()
const working = ref<HTMLElement | null>(null)
const rightPanel = ref<HTMLElement | null>(null)
const activeLeft = ref('')
const announcement = ref('')
const state = computed(() => matchingPresentation(props.question, props.responses, props.rightOrder))
const activeItem = computed(() => state.value.left.find(item => item.id === activeLeft.value))
const validKey = computed(() => hasValidAnswerKey(props.question))
const expected = computed(() => new Map(props.question.matches.map(pair => [pair.leftId, pair.rightId])))
function correctItem(leftId: string) {
  return props.question.rightItems.find(item => item.id === expected.value.get(leftId))
}
function mobile(): boolean { return window.matchMedia('(max-width: 767.98px)').matches }
function focusWithoutScroll(element?: HTMLElement | null): void { element?.focus({ preventScroll: true }) }
function focusWorking(): void {
  const target = activeLeft.value
    ? rightPanel.value?.querySelector<HTMLButtonElement>('button[data-assign]:not(:disabled)')
    : working.value?.querySelector<HTMLButtonElement>('button[data-select]')
  focusWithoutScroll(target ?? working.value)
}
async function selectLeft(id: string): Promise<void> {
  if (props.submitted || !state.value.left.some(item => item.id === id)) return
  activeLeft.value = id
  await nextTick()
  // On a phone, take the learner directly to the candidates and keep the
  // selected content visible there; do not require scrolling between lists.
  if (mobile()) {
    rightPanel.value?.scrollIntoView({ block: 'start', behavior: 'instant' })
    focusWorking()
  }
}
function cardClick(event: MouseEvent, action: () => void): void {
  // Playback, links and explicit controls retain their native behavior. The
  // card background is a pointer shortcut; named buttons provide keyboard use.
  if ((event.target as Element).closest('button, video, audio, a, input, select, textarea, summary, label')) return
  action()
}
async function changePair(leftId: string, rightId: string): Promise<void> {
  if (props.submitted) return
  const before = working.value?.getBoundingClientRect().top
  const visible = before !== undefined && before >= 0 && before < window.innerHeight
  emit('match', leftId, rightId)
  activeLeft.value = rightId ? '' : leftId
  await nextTick()
  announcement.value = t(rightId ? 'runnerPairAdded' : 'runnerPairReleased', { count: state.value.pairs.length })
  if (props.submitted) return
  // Adding a pair above the work area must not push the remaining candidates
  // down out of view. Measure the same anchor after Vue has moved the cards.
  const after = working.value?.getBoundingClientRect().top
  if (before !== undefined && after !== undefined) window.scrollBy({ top: after - before, behavior: 'instant' })
  if (mobile() && state.value.left.length) {
    const panel = activeLeft.value ? rightPanel.value : working.value
    panel?.scrollIntoView({ block: 'start', behavior: 'instant' })
  } else if (!rightId && !visible) {
    working.value?.scrollIntoView({ block: 'start', behavior: 'instant' })
  }
  focusWorking()
}
function assign(rightId: string): void {
  if (!activeItem.value || !state.value.right.some(item => item.id === rightId)) return
  void changePair(activeLeft.value, rightId)
}
function unpair(leftId: string): void {
  if (!state.value.pairs.some(pair => pair.left.id === leftId)) return
  void changePair(leftId, '')
}
function changeSelection(): void {
  working.value?.scrollIntoView({ block: 'start', behavior: 'instant' })
  focusWithoutScroll(working.value?.querySelector<HTMLElement>('button[data-select]'))
}
watch(() => props.rightOrder, () => { activeLeft.value = ''; announcement.value = '' })
watch(() => props.submitted, value => { if (value) activeLeft.value = '' })
</script>

<template>
  <div class="matching-runner mt-3">
    <div class="d-flex flex-wrap align-items-start justify-content-between gap-2 mb-2">
      <h3 :id="'your-pairs-' + question.id" class="h6 mb-0">{{ t('runnerYourPairs') }}</h3>
      <span class="badge bg-body-tertiary text-body border">{{ t('runnerPairProgress', { count: state.pairs.length, total: question.leftItems.length }) }}</span>
    </div>
    <p v-if="!submitted" class="small text-secondary">{{ t('runnerPairsEditable') }}</p>
    <p class="visually-hidden" role="status" aria-live="polite">{{ announcement }}</p>
    <section class="paired-items" :aria-labelledby="'your-pairs-' + question.id">
      <div v-for="(pair, pairIndex) in state.pairs" :key="pair.left.id" class="learner-pair border rounded p-2 mb-2"
        :class="submitted && validKey ? (expected.get(pair.left.id) === pair.right.id ? 'pair-correct' : 'pair-incorrect') : ''"
        role="group" :aria-label="t('runnerPairNumber', { index: pairIndex + 1 })">
        <div v-if="!submitted || validKey" class="pair-toolbar d-flex justify-content-center mb-2">
          <button v-if="!submitted" type="button" class="btn btn-outline-primary btn-sm unpair-button"
            :aria-label="t('runnerUnpairNumber', { index: pairIndex + 1 })" @click="unpair(pair.left.id)"><AppIcon name="x-lg" />{{ t('runnerUnpair') }}</button>
          <span v-else class="fw-semibold small pair-status"
            :class="expected.get(pair.left.id) === pair.right.id ? 'text-success' : 'text-danger'">
            <AppIcon :name="expected.get(pair.left.id) === pair.right.id ? 'check2-circle' : 'x-lg'" />
            {{ expected.get(pair.left.id) === pair.right.id ? t('runnerPairCorrect') : t('runnerPairIncorrect') }}
          </span>
        </div>
        <div class="paired-row">
          <div class="matching-item paired-content">
            <ContentBlocksViewer :blocks="pair.left.content" :private-preview="privatePreview" :media-urls="mediaUrls" />
          </div>
          <span class="pair-link text-secondary" aria-hidden="true"><AppIcon name="arrow-left-right" /></span>
          <div class="matching-item pair-counterparts">
            <div class="paired-content">
              <ContentBlocksViewer :blocks="pair.right.content" :private-preview="privatePreview" :media-urls="mediaUrls" />
            </div>
            <div v-if="submitted && validKey && expected.get(pair.left.id) !== pair.right.id"
              class="pair-correction rounded mt-2 p-2">
              <p class="small fw-semibold text-success-emphasis mb-2"><AppIcon name="check2-circle" /> {{ t('runnerCorrectCounterpart') }}</p>
              <ContentBlocksViewer v-if="correctItem(pair.left.id)" :blocks="correctItem(pair.left.id)!.content"
                :private-preview="privatePreview" :media-urls="mediaUrls" />
            </div>
          </div>
        </div>
      </div>
    </section>

    <section v-if="!submitted" ref="working" tabindex="-1" class="working-area border-top pt-3 mt-3"
      :aria-labelledby="'remaining-' + question.id">
      <h3 :id="'remaining-' + question.id" class="h6">{{ t('runnerRemainingPairs') }}</h3>
      <p v-if="!state.left.length" class="small text-secondary mb-0">{{ t('runnerAllPaired') }}</p>
      <template v-else>
        <p class="small text-secondary">{{ t('runnerCardInstruction') }}</p>
        <div class="row g-3">
          <div class="col-md-6 left-pool">
            <h4 class="h6 text-secondary">{{ t('runnerChooseSource') }}</h4>
            <div v-for="item in state.left" :key="item.id" class="matching-item selection-card rounded p-2 mb-2"
              :class="{ 'item-active': activeLeft === item.id }" @click="cardClick($event, () => selectLeft(item.id))">
              <ContentBlocksViewer :blocks="item.content" :private-preview="privatePreview" :media-urls="mediaUrls" />
              <div class="text-end mt-2">
                <button type="button" data-select class="btn btn-sm" :class="activeLeft === item.id ? 'btn-primary' : 'btn-outline-primary'"
                  :aria-pressed="activeLeft === item.id" :aria-controls="'right-pool-' + question.id"
                  :aria-label="t('runnerSelectLeftNumber', { index: question.leftItems.findIndex(left => left.id === item.id) + 1 })"
                  @click="selectLeft(item.id)"><AppIcon :name="activeLeft === item.id ? 'check-lg' : 'plus-lg'" />{{ activeLeft === item.id ? t('runnerItemSelected') : t('runnerSelectItem') }}</button>
              </div>
            </div>
          </div>
          <div :id="'right-pool-' + question.id" ref="rightPanel" class="col-md-6 right-pool">
            <h4 class="h6 text-secondary">{{ t('runnerChooseCounterpart') }}</h4>
            <div v-if="activeItem" class="mobile-source d-md-none border rounded bg-primary-subtle p-2 mb-3">
              <p class="small fw-semibold mb-2">{{ t('runnerSelectedSource') }}</p>
              <ContentBlocksViewer :blocks="activeItem.content" :private-preview="privatePreview" :media-urls="mediaUrls" />
              <button type="button" class="btn btn-link btn-sm px-0" @click="changeSelection"><AppIcon name="arrow-counterclockwise" />{{ t('runnerChangeSource') }}</button>
            </div>
            <div v-for="item in state.right" :key="item.id" class="matching-item selection-card rounded p-2 mb-2"
              :class="{ 'candidate-ready': activeItem }" @click="cardClick($event, () => assign(item.id))">
              <ContentBlocksViewer :blocks="item.content" :private-preview="privatePreview" :media-urls="mediaUrls" />
              <div class="text-end mt-2">
                <button type="button" data-assign class="btn btn-outline-primary btn-sm" :disabled="!activeItem"
                  :aria-label="t('runnerAssignRightNumber', { index: rightOrder.indexOf(item.id) + 1 })"
                  @click="assign(item.id)"><AppIcon name="link-45deg" />{{ t('runnerAssign') }}</button>
              </div>
            </div>
            <p v-if="!state.right.length" class="small text-secondary">{{ t('runnerNoFreeCounterparts') }}</p>
          </div>
        </div>
        <p class="small text-secondary mt-2 mb-0">{{ t('runnerPairsRemainingCount', { count: state.left.length }) }}</p>
      </template>
    </section>

    <section v-else-if="state.left.length" class="unanswered-pairs border-top pt-3 mt-3">
      <h3 class="h6">{{ t('runnerUnansweredPairs') }}</h3>
      <div v-for="item in state.left" :key="item.id" class="learner-pair border rounded p-2 mb-2 pair-unanswered">
        <p class="small fw-semibold text-secondary"><AppIcon name="dash-lg" /> {{ t('runnerNotPaired') }}</p>
        <div class="paired-row unanswered-row">
          <div class="matching-item paired-content">
            <ContentBlocksViewer :blocks="item.content" :private-preview="privatePreview" :media-urls="mediaUrls" />
          </div>
          <span v-if="validKey" class="pair-link text-secondary" aria-hidden="true"><AppIcon name="arrow-left-right" /></span>
          <div v-if="validKey && correctItem(item.id)" class="matching-item paired-content pair-correction">
            <p class="small fw-semibold text-success-emphasis mb-2"><AppIcon name="check2-circle" /> {{ t('runnerCorrectCounterpart') }}</p>
            <ContentBlocksViewer :blocks="correctItem(item.id)!.content" :private-preview="privatePreview" :media-urls="mediaUrls" />
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.matching-runner { overflow-anchor: none; --content-media-landscape-height: 180px; --content-media-portrait-height: 420px; }
.paired-row { display: grid; grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr); gap: .75rem; align-items: start; }
.paired-content { padding: .5rem; border: 2px solid var(--bs-border-color); border-radius: var(--bs-border-radius); background: var(--bs-body-bg); }
.pair-link { align-self: start; margin-top: .5rem; min-width: 2rem; font-size: 1.5rem; text-align: center; }
.matching-item { min-width: 0; overflow-wrap: anywhere; }
.paired-content, .pair-correction, .mobile-source { --content-media-landscape-height: 140px; --content-media-portrait-height: 360px; }
.selection-card { border: 2px solid var(--bs-border-color); }
.left-pool .selection-card, .candidate-ready { cursor: pointer; }
.item-active { border-color: var(--bs-primary); background: rgba(var(--bs-primary-rgb), .04); }
.pair-correct { border-color: var(--bs-success) !important; background: rgba(var(--bs-success-rgb), .06); }
.pair-incorrect { border-color: var(--bs-danger) !important; background: rgba(var(--bs-danger-rgb), .06); }
.pair-unanswered { background: var(--bs-tertiary-bg); }
.pair-correction { border: 1px solid var(--bs-success-border-subtle); background: var(--bs-success-bg-subtle); }
.working-area, .right-pool { scroll-margin-top: var(--runner-scroll-offset, 1rem); }
.matching-runner .btn { min-height: 2.75rem; }
@media (max-width: 767.98px) {
  .paired-row { grid-template-columns: minmax(0, 1fr); gap: .5rem; }
  .pair-link { justify-self: center; margin-top: 0; transform: rotate(90deg); }
  .matching-runner, .paired-content, .pair-correction, .mobile-source { --content-media-landscape-height: 320px; --content-media-portrait-height: 520px; }
}
</style>
