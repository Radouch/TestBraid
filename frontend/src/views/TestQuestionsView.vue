<script setup lang="ts">
import { appBaseUrl } from '../deployment-base'
import AppIcon from '../components/AppIcon.vue'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { onBeforeRouteLeave, onBeforeRouteUpdate, useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import QuestionEditor from '../components/QuestionEditor.vue'
import PublishedQuestionView from '../components/PublishedQuestionView.vue'
import TestSettingsFields from '../components/TestSettingsFields.vue'
import { testEdits, type EditorLesson, type TestEdits } from '../editor/test-settings'
import { explicitUiLocale } from '../ui-locale'
import {
  createChoice, createMatching, duplicateQuestion, invalidMediaReference, move, publicationProblems,
  type DraftTest, type Question,
} from '../editor/model'

const route = useRoute()
const router = useRouter()
const { t } = useI18n()
const page = ref<HTMLElement | null>(null)
const toolbar = ref<HTMLElement | null>(null)
const form = ref<HTMLFormElement | null>(null)
const test = ref<DraftTest | null>(null)
const draft = ref<TestEdits | null>(null)
const originalEdits = ref('')
const lessons = ref<EditorLesson[]>([])
const lessonsLoading = ref(false)
const lessonsUnavailable = ref(false)
const csrfToken = ref('')
const loading = ref(true)
const busy = ref(false)
const error = ref('')
const success = ref('')
const publicationError = ref('')
const publicationAction = ref<'publish' | 'unpublish' | ''>('')
const activeQuestionId = ref('')
const scrollOffset = ref(100)
const questionEditors = new Map<string, { expand: () => void }>()
const questions = computed(() => draft.value?.questions ?? [])
const editable = computed(() => test.value?.status === 'draft')
const dirty = computed(() => editable.value && JSON.stringify(draft.value) !== originalEdits.value)
const problems = computed(() => publicationProblems(questions.value))
const publicationIncomplete = computed(() => problems.value.length > 0 || Boolean(invalidMediaReference(questions.value)))
const activeTab = computed(() => route.query.tab === 'settings' ? 'settings' : 'questions')
const languageQuery = computed(() => {
  const lang = explicitUiLocale(route.query.lang)
  return lang ? { lang } : {}
})
const lessonName = computed(() => lessons.value.find(lesson => lesson.id === draft.value?.groupId)?.name ?? t('editorCurrentLesson'))
const catalogLocation = computed(() => ({ name: 'admin', query: { ...languageQuery.value, lesson: draft.value?.groupId || undefined } }))
const previewLocation = computed(() => ({ name: 'test-preview', params: { id: test.value?.id },
  query: { ...languageQuery.value, editorTab: activeTab.value } }))
const saveState = computed(() => t(publicationAction.value ? 'editorChangingPublication'
  : busy.value ? 'editorSaving' : dirty.value ? 'editorUnsaved' : 'editorAllSaved'))
const api = (path: string) => appBaseUrl() + 'api/' + path
let request: AbortController | undefined
let observer: ResizeObserver | undefined
let frame = 0

function prepareExit(): boolean {
  return !busy.value && (!dirty.value || window.confirm(t('editorUnsavedConfirm')))
}
function beforeUnload(event: BeforeUnloadEvent): void {
  if (dirty.value || busy.value) { event.preventDefault(); event.returnValue = '' }
}
onBeforeRouteLeave(prepareExit)
onBeforeRouteUpdate(to => String(to.params.id) === String(route.params.id) || prepareExit())

async function loadLessons(signal: AbortSignal): Promise<void> {
  lessonsLoading.value = true
  try {
    const response = await fetch(api('admin/groups'), { credentials: 'same-origin', cache: 'no-store', signal })
    if (!response.ok) throw new Error('HTTP')
    const payload = await response.json() as { groups: EditorLesson[] }
    if (!signal.aborted) lessons.value = payload.groups
  } catch {
    if (!signal.aborted) lessonsUnavailable.value = true
  } finally {
    if (!signal.aborted) lessonsLoading.value = false
  }
}
function applySaved(saved: DraftTest): void {
  test.value = saved
  draft.value = testEdits(saved)
  originalEdits.value = JSON.stringify(draft.value)
}
async function load(id: string): Promise<void> {
  request?.abort()
  const controller = new AbortController()
  request = controller
  const { signal } = controller
  loading.value = true
  error.value = ''
  success.value = ''
  publicationError.value = ''
  test.value = null
  draft.value = null
  originalEdits.value = ''
  csrfToken.value = ''
  lessons.value = []
  lessonsUnavailable.value = false
  lessonsLoading.value = false
  activeQuestionId.value = ''
  try {
    const sessionResponse = await fetch(api('auth/session'), { credentials: 'same-origin', cache: 'no-store', signal })
    if (!sessionResponse.ok) throw new Error(t('editorSessionUnavailable'))
    const session = await sessionResponse.json() as { authenticated: boolean; csrfToken: string }
    if (signal.aborted) return
    if (!session.authenticated) throw new Error(t('editorSignInRequired'))
    csrfToken.value = session.csrfToken
    // Lesson names are optional context. A slow/failed list may not block the
    // test or replace edits made while that list is still loading.
    void loadLessons(signal)
    const response = await fetch(api('admin/tests/' + encodeURIComponent(id)), { credentials: 'same-origin', cache: 'no-store', signal })
    if (!response.ok) throw new Error(t('editorLoadFailed'))
    const fetched = await response.json() as DraftTest
    if (signal.aborted) return
    applySaved(fetched)
    activeQuestionId.value = fetched.questions[0]?.id ?? ''
  } catch (cause) {
    if (!signal.aborted) error.value = cause instanceof Error ? cause.message : t('editorLoadFailed')
  } finally {
    if (!signal.aborted) loading.value = false
  }
}
async function switchTab(tab: 'questions' | 'settings'): Promise<void> {
  await router.replace({ query: { ...route.query, tab: tab === 'settings' ? 'settings' : undefined } })
}
async function tabKeys(event: KeyboardEvent): Promise<void> {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
  event.preventDefault()
  const target = event.key === 'Home' ? 'questions' : event.key === 'End' ? 'settings'
    : activeTab.value === 'questions' ? 'settings' : 'questions'
  await switchTab(target)
  page.value?.querySelector<HTMLButtonElement>('#editor-tab-' + target)?.focus()
}
function registerEditor(id: string, instance: unknown): void {
  if (instance) questionEditors.set(id, instance as { expand: () => void })
  else questionEditors.delete(id)
}
async function jumpToQuestion(id: string): Promise<void> {
  if (!questions.value.some(question => question.id === id)) return
  activeQuestionId.value = id
  await nextTick()
  questionEditors.get(id)?.expand()
  await nextTick()
  const section = questionSection(id)
  section?.scrollIntoView({ block: 'start', behavior: 'instant' })
  section?.querySelector<HTMLButtonElement>('.question-toggle')?.focus({ preventScroll: true })
}
function questionSection(id: string): HTMLElement | undefined {
  return Array.from(page.value?.querySelectorAll<HTMLElement>('[data-editor-question]') ?? [])
    .find(section => section.dataset.editorQuestion === id)
}
function complete(question: Question): boolean {
  return !publicationProblems([question]).length && !invalidMediaReference([question])
}
function questionSummary(question: Question): string {
  return question.prompt.filter(block => block.type === 'text').map(block => block.text.trim()).filter(Boolean).join(' ')
    || t(question.type === 'choice' ? 'editorChoice' : 'editorMatching')
}
function addQuestion(type: 'choice' | 'matching'): void {
  if (!editable.value || busy.value) return
  const question = type === 'choice' ? createChoice() : createMatching()
  questions.value.push(question)
  void jumpToQuestion(question.id)
}
function copyQuestion(index: number): void {
  if (!editable.value || busy.value) return
  const source = questions.value[index]
  if (!source) return
  const copy = duplicateQuestion(source)
  questions.value.splice(index + 1, 0, copy)
  void jumpToQuestion(copy.id)
}
function moveQuestion(index: number, direction: -1 | 1): void {
  if (draft.value && editable.value && !busy.value) draft.value.questions = move(questions.value, index, direction)
}
function removeQuestion(index: number): void {
  if (!editable.value || busy.value || !window.confirm(t('editorRemoveConfirm'))) return
  questions.value.splice(index, 1)
}
async function save(): Promise<void> {
  if (busy.value || !test.value || !draft.value || !editable.value || !dirty.value) return
  // A composer's native media dialog lives inside the shared form. Enter in
  // that dialog must not submit/save the test behind the modal.
  if (page.value?.querySelector('dialog[open]')) return
  error.value = ''
  success.value = ''
  publicationError.value = ''
  const titleInput = form.value?.querySelector<HTMLInputElement>('#test-settings-title')
  titleInput?.setCustomValidity(draft.value.title.trim() ? '' : t('editorTitleRequired'))
  // The invalid setting may be in the hidden tab. Reveal it before invoking
  // native validation so the browser can focus the offending control.
  if (form.value && !form.value.checkValidity()) {
    await switchTab('settings')
    await nextTick()
    form.value?.reportValidity()
    return
  }
  if (invalidMediaReference(questions.value)) {
    error.value = t('editorIncompleteMedia')
    await switchTab('questions')
    const incomplete = questions.value.find(question => invalidMediaReference([question]))
    if (incomplete) await jumpToQuestion(incomplete.id)
    return
  }
  const payload = JSON.parse(JSON.stringify(draft.value)) as TestEdits
  payload.title = payload.title.trim()
  busy.value = true
  try {
    // Retain the existing best-effort stale-document check, now covering both
    // metadata and questions. This is not atomic optimistic concurrency control.
    const current = await fetch(api('admin/tests/' + encodeURIComponent(test.value.id)), {
      credentials: 'same-origin', cache: 'no-store',
    })
    if (!current.ok) throw new Error(t('editorLoadFailed'))
    const server = await current.json() as DraftTest
    if (server.status !== 'draft' || server.updatedAt !== test.value.updatedAt) throw new Error(t('editorStaleTest'))
    const response = await fetch(api('admin/tests/' + encodeURIComponent(test.value.id)), {
      method: 'PUT', credentials: 'same-origin', cache: 'no-store',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken.value },
      body: JSON.stringify(payload),
    })
    if (!response.ok) {
      const result = await response.json().catch(() => ({})) as { error?: { code?: string } }
      throw new Error(t('editorSaveFailed') + ' (' + (result.error?.code ?? response.status) + ')')
    }
    applySaved(await response.json() as DraftTest)
    success.value = t('editorTestSaved')
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : t('editorSaveFailed')
  } finally {
    busy.value = false
  }
}
async function changePublication(action: 'publish' | 'unpublish'): Promise<void> {
  if (!test.value || busy.value || (action === 'publish' ? !editable.value || dirty.value || publicationIncomplete.value : editable.value)
    || page.value?.querySelector('dialog[open]')) return
  if (!window.confirm(t(action === 'publish' ? 'publicationConfirmPublish' : 'publicationConfirmUnpublish', { title: test.value.title }))) return
  const currentTest = test.value
  busy.value = true
  publicationAction.value = action
  error.value = ''
  success.value = ''
  publicationError.value = ''
  try {
    // Publish only the saved version the author reviewed. As with saves, this
    // preflight detects intervening edits but is not an atomic server condition.
    const current = await fetch(api('admin/tests/' + encodeURIComponent(currentTest.id)), {
      credentials: 'same-origin', cache: 'no-store',
    })
    if (!current.ok) throw new Error(t('editorLoadFailed'))
    const server = await current.json() as DraftTest
    if (server.status !== currentTest.status || server.updatedAt !== currentTest.updatedAt) throw new Error(t('editorStaleTest'))
    const response = await fetch(api('admin/tests/' + encodeURIComponent(currentTest.id) + '/' + action), {
      method: 'POST', credentials: 'same-origin', cache: 'no-store', headers: { 'X-CSRF-Token': csrfToken.value },
    })
    if (!response.ok) {
      const result = await response.json().catch(() => ({})) as { error?: { code?: string } }
      const code = result.error?.code
      if (['NOT_PUBLISHABLE', 'VALIDATION_FAILED', 'MEDIA_MISSING'].includes(code ?? '')) throw new Error(t('publicationNotReady'))
      if (code === 'ALREADY_PUBLISHED' || code === 'NOT_PUBLISHED') throw new Error(t('editorStaleTest'))
      throw new Error(t('publicationOperationFailed') + ' (' + (code ?? response.status) + ')')
    }
    const saved = await response.json() as DraftTest
    if (saved.id !== currentTest.id || saved.status !== (action === 'publish' ? 'published' : 'draft')) {
      throw new Error(t('publicationUnexpectedResponse'))
    }
    applySaved(saved)
    success.value = t(action === 'publish' ? 'publicationPublished' : 'publicationUnpublished')
  } catch (cause) {
    publicationError.value = cause instanceof Error ? cause.message : t('publicationOperationFailed')
  } finally {
    publicationAction.value = ''
    busy.value = false
  }
}
function measureToolbar(): void { scrollOffset.value = (toolbar.value?.getBoundingClientRect().height ?? 76) + 24 }
function trackQuestion(): void {
  frame = 0
  if (activeTab.value !== 'questions') return
  const sections = Array.from(page.value?.querySelectorAll<HTMLElement>('[data-editor-question]') ?? [])
  const current = sections.find(section => section.getBoundingClientRect().bottom > scrollOffset.value + 24) ?? sections.at(-1)
  if (current?.dataset.editorQuestion) activeQuestionId.value = current.dataset.editorQuestion
}
function scroll(): void { if (!frame) frame = window.requestAnimationFrame(trackQuestion) }
watch(() => String(route.params.id ?? ''), id => void load(id), { immediate: true })
watch(() => questions.value.map(question => question.id), ids => {
  if (!ids.includes(activeQuestionId.value)) activeQuestionId.value = ids[0] ?? ''
})
watch(dirty, value => { if (value) success.value = '' })
watch(activeQuestionId, async () => {
  await nextTick()
  if (activeTab.value !== 'questions') return
  const map = page.value?.querySelector<HTMLElement>('.editor-question-map')
  const current = map?.querySelector<HTMLElement>('[aria-current]')
  if (!map || !current) return
  // Keep long overviews useful without scrolling the surrounding page.
  const bounds = map.getBoundingClientRect()
  const item = current.getBoundingClientRect()
  if (item.top < bounds.top) map.scrollTop += item.top - bounds.top
  else if (item.bottom > bounds.bottom) map.scrollTop += item.bottom - bounds.bottom
})
watch(toolbar, element => {
  observer?.disconnect()
  if (element) observer?.observe(element)
  measureToolbar()
}, { flush: 'post' })
onMounted(() => {
  window.addEventListener('beforeunload', beforeUnload)
  window.addEventListener('scroll', scroll, { passive: true })
  window.addEventListener('resize', measureToolbar)
  observer = new window.ResizeObserver(measureToolbar)
  if (toolbar.value) observer.observe(toolbar.value)
})
onBeforeUnmount(() => {
  request?.abort()
  observer?.disconnect()
  window.removeEventListener('beforeunload', beforeUnload)
  window.removeEventListener('scroll', scroll)
  window.removeEventListener('resize', measureToolbar)
  if (frame) window.cancelAnimationFrame(frame)
})
</script>

<template>
  <section ref="page" class="test-editor" :style="{ '--editor-scroll-offset': scrollOffset + 'px' }">
    <p v-if="loading" role="status">{{ t('loading') }}</p>
    <p v-if="error" class="alert alert-danger" role="alert">{{ error }}</p>
    <p v-if="publicationError && activeTab !== 'settings'" class="alert alert-danger" role="alert">{{ publicationError }}</p>
    <p v-if="success" class="alert alert-success" role="status">{{ success }}</p>
    <template v-if="test && draft && !loading">
      <nav class="editor-breadcrumbs mb-3" :aria-label="t('editorBreadcrumbs')">
        <RouterLink :to="{ name: 'admin', query: languageQuery }">{{ t('author') }}</RouterLink>
        <span aria-hidden="true">/</span><RouterLink :to="catalogLocation">{{ lessonName }}</RouterLink>
        <span aria-hidden="true">/</span><span aria-current="page">{{ draft.title || t('catalogUntitled') }}</span>
      </nav>
      <header class="card mb-3">
        <div class="card-body d-flex flex-wrap align-items-center gap-2">
          <h1 class="h3 mb-0">{{ draft.title || t('catalogUntitled') }}</h1>
          <span class="badge border" :class="editable ? 'text-body-secondary bg-body-tertiary' : 'text-success-emphasis bg-success-subtle'">
            {{ t(editable ? 'editorDraftStatus' : 'catalogPublished') }}
          </span>
          <RouterLink :to="catalogLocation" class="editor-back ms-md-auto"><AppIcon name="arrow-left" /> {{ t('editorBackToLesson') }}</RouterLink>
        </div>
      </header>
      <div v-if="!editable" class="alert alert-warning d-flex flex-wrap gap-3 justify-content-between align-items-center">
        <span>{{ t('adminPublishedReadonly') }}</span>
        <button type="button" class="btn btn-outline-warning" :disabled="busy" @click="changePublication('unpublish')">
          <AppIcon name="pencil-square" />{{ t('adminUnpublishEdit') }}
        </button>
      </div>
      <div class="nav nav-tabs mb-3" role="tablist" :aria-label="t('editorTabs')" @keydown="tabKeys">
        <button id="editor-tab-questions" type="button" class="nav-link" role="tab" aria-controls="editor-panel-questions"
          :class="{ active: activeTab === 'questions' }" :aria-selected="activeTab === 'questions'"
          :tabindex="activeTab === 'questions' ? 0 : -1" @click="switchTab('questions')">
          {{ t('editorQuestionsTab', { count: questions.length }) }}
        </button>
        <button id="editor-tab-settings" type="button" class="nav-link" role="tab" aria-controls="editor-panel-settings"
          :class="{ active: activeTab === 'settings' }" :aria-selected="activeTab === 'settings'"
          :tabindex="activeTab === 'settings' ? 0 : -1" @click="switchTab('settings')">{{ t('editorSettingsTab') }}</button>
      </div>
      <div ref="toolbar" class="editor-toolbar card mb-3" :aria-label="t('editorActions')">
        <div class="card-body p-2 p-sm-3 d-flex flex-wrap align-items-center justify-content-between gap-2">
          <span class="editor-save-state small text-secondary" role="status">{{ editable ? saveState : t('adminPublishedReadonly') }}</span>
          <div class="editor-primary-actions d-flex gap-2">
            <RouterLink class="btn btn-outline-secondary btn-sm" :class="{ disabled: busy }" :aria-disabled="busy" :to="previewLocation" :aria-label="t('editorPreviewSaved')">
              <AppIcon name="eye" />{{ t('editorPreview') }}
            </RouterLink>
            <button v-if="editable" type="submit" form="test-editor-form" class="btn btn-primary btn-sm" :disabled="busy || !dirty">
              <AppIcon name="floppy" />{{ t('editorSaveChanges') }}
            </button>
          </div>
        </div>
        <p v-if="editable && dirty" class="small text-secondary px-3 pb-2 mb-0">{{ t('runnerSavedVersion') }}</p>
      </div>
      <form id="test-editor-form" ref="form" novalidate @submit.prevent="save">
        <!-- Keep both tabs mounted: switching tabs must not destroy media,
             composer dialogs or in-progress question expansion state. -->
        <div v-show="activeTab === 'settings'" id="editor-panel-settings" role="tabpanel" aria-labelledby="editor-tab-settings">
          <fieldset :disabled="busy || !editable" class="editor-fields">
            <p v-if="lessonsUnavailable" class="small text-secondary" role="status">{{ t('editorLessonsUnavailable') }}</p>
            <TestSettingsFields :settings="draft" :lessons="lessons" :lessons-unavailable="lessonsUnavailable || lessonsLoading" />
          </fieldset>
          <!-- Publication stays operable while published settings are locked. -->
          <section class="editor-publication card mt-3" aria-labelledby="test-settings-publication" :aria-busy="Boolean(publicationAction)">
            <div class="card-header d-flex flex-wrap align-items-center justify-content-between gap-2">
              <h2 id="test-settings-publication" class="h6 mb-0">{{ t('editorPublication') }}</h2>
              <span class="badge border" :class="editable ? 'text-body-secondary bg-body-tertiary' : 'text-success-emphasis bg-success-subtle'">
                {{ t(editable ? 'editorDraftStatus' : 'catalogPublished') }}
              </span>
            </div>
            <div class="card-body">
              <p id="editor-publication-description">{{ t(editable ? 'editorPublicationDraftHint' : 'editorPublicationPublishedHint') }}</p>
              <p v-if="editable && dirty" id="editor-publication-unsaved" class="small text-secondary">{{ t('editorPublicationSaveFirst') }}</p>
              <div v-if="editable && publicationIncomplete" id="editor-publication-incomplete" class="small mb-3">
                <p class="mb-1">{{ t('publicationReadinessHint') }}</p>
                <ul v-if="problems.length" class="mb-1"><li v-for="code in problems" :key="code">{{ t('editorProblem_' + code) }}</li></ul>
                <p v-if="invalidMediaReference(questions)" class="mb-1">{{ t('editorIncompleteMedia') }}</p>
                <button type="button" class="btn btn-link btn-sm p-0" @click="switchTab('questions')">{{ t('editorQuestionsTab', { count: questions.length }) }}</button>
              </div>
              <p v-if="publicationError" class="alert alert-danger" role="alert">{{ publicationError }}</p>
              <div class="d-flex flex-wrap gap-2">
                <button id="editor-publication-action" type="button" class="btn" :class="editable ? 'btn-outline-primary' : 'btn-outline-warning'"
                  :disabled="busy || (editable && (dirty || publicationIncomplete))"
                  :aria-describedby="['editor-publication-description', editable && dirty ? 'editor-publication-unsaved' : '', editable && publicationIncomplete ? 'editor-publication-incomplete' : ''].filter(Boolean).join(' ')"
                  @click="changePublication(editable ? 'publish' : 'unpublish')">
                  <AppIcon :name="editable ? 'upload' : 'arrow-counterclockwise'" />{{ t(publicationAction ? 'editorChangingPublication' : editable ? 'publicationPublish' : 'publicationUnpublish') }}
                </button>
                <RouterLink v-if="!editable" class="btn btn-outline-secondary" target="_blank" rel="noopener"
                  :to="{ name: 'test', params: { id: test.id }, query: languageQuery }"><AppIcon name="box-arrow-up-right" />{{ t('publicationOpenPublic') }}</RouterLink>
              </div>
            </div>
          </section>
        </div>
        <div v-show="activeTab === 'questions'" id="editor-panel-questions" role="tabpanel" aria-labelledby="editor-tab-questions">
          <fieldset :disabled="busy || !editable" class="editor-fields">
            <div v-if="editable" class="editor-questions-layout">
              <aside v-if="questions.length" class="editor-question-map card" :aria-label="t('runnerOverview')">
                <h2 class="h6 card-header mb-0">{{ t('runnerOverview') }}</h2>
                <nav class="p-2">
                  <button v-for="(question, index) in questions" :key="question.id" type="button" class="editor-map-entry"
                    :aria-current="question.id === activeQuestionId ? 'location' : undefined" :aria-controls="'editor-question-' + question.id"
                    @click="jumpToQuestion(question.id)">
                    <strong class="d-block">{{ t('editorQuestionNumber', { index: index + 1 }) }}</strong>
                    <span class="editor-map-summary small">{{ questionSummary(question) }}</span>
                    <span class="d-block small text-secondary"><AppIcon :name="complete(question) ? 'check-lg' : 'circle-half'" /> {{ t(complete(question) ? 'editorComplete' : 'editorIncomplete') }}</span>
                  </button>
                </nav>
              </aside>
              <div class="editor-question-content">
                <div v-if="questions.length" class="editor-mobile-map mb-3">
                  <label class="form-label" for="editor-question-select">{{ t('editorCurrentQuestion') }}</label>
                  <select id="editor-question-select" class="form-select" :value="activeQuestionId" @change="jumpToQuestion(($event.target as HTMLSelectElement).value)">
                    <option v-for="(question, index) in questions" :key="question.id" :value="question.id">
                      {{ t('editorQuestionNumber', { index: index + 1 }) }} · {{ t(complete(question) ? 'editorComplete' : 'editorIncomplete') }}
                    </option>
                  </select>
                </div>
                <div class="d-flex flex-wrap gap-2 mb-3">
                  <button type="button" class="btn btn-outline-primary btn-sm" @click="addQuestion('choice')"><AppIcon name="list-check" />{{ t('editorAddChoice') }}</button>
                  <button type="button" class="btn btn-outline-primary btn-sm" @click="addQuestion('matching')"><AppIcon name="arrow-left-right" />{{ t('editorAddMatching') }}</button>
                </div>
                <p v-if="!questions.length" class="card p-3 text-secondary">{{ t('editorNoQuestions') }}</p>
                <div v-for="(question, index) in questions" :id="'editor-question-' + question.id" :key="question.id"
                  :data-editor-question="question.id" class="editor-question-anchor" @focusin="activeQuestionId = question.id">
                  <QuestionEditor :ref="instance => registerEditor(question.id, instance)" :question="question" :index="index" :csrf-token="csrfToken"
                    :group-id="draft.groupId" :total="questions.length" :initially-expanded="index === 0"
                    @remove="removeQuestion(index)" @move="moveQuestion(index, $event)" @duplicate="copyQuestion(index)" />
                </div>
                <div class="card p-3 mt-3">
                  <h2 class="h6">{{ t('editorReadiness') }}</h2>
                  <p v-if="!problems.length" class="text-secondary mb-1">{{ t('editorLooksComplete') }}</p>
                  <ul v-else class="small mb-1"><li v-for="code in problems" :key="code">{{ t('editorProblem_' + code) }}</li></ul>
                  <p class="text-secondary small mb-0">{{ t('editorServerValidates') }}</p>
                </div>
              </div>
            </div>
            <div v-else>
              <PublishedQuestionView v-for="(question, index) in questions" :key="question.id" :question="question" :index="index" />
            </div>
          </fieldset>
        </div>
      </form>
    </template>
    <RouterLink v-else-if="!loading" :to="catalogLocation">{{ t('editorBack') }}</RouterLink>
  </section>
</template>

<style scoped>
.test-editor { min-width: 0; }
.editor-breadcrumbs { display: flex; flex-wrap: wrap; align-items: center; gap: .35rem .6rem; font-size: .875rem; }
.editor-breadcrumbs > :last-child { overflow-wrap: anywhere; }
.editor-toolbar { position: sticky; top: .5rem; z-index: 30; box-shadow: 0 .2rem .5rem rgb(0 0 0 / .06); }
.editor-toolbar .btn { min-height: 2.75rem; display: inline-flex; align-items: center; justify-content: center; }
.editor-primary-actions { flex-wrap: wrap; }
.editor-fields { min-width: 0; border: 0; padding: 0; margin: 0; }
.editor-publication { max-width: 48rem; }
.editor-publication .btn { min-height: 2.75rem; }
.editor-questions-layout { display: grid; grid-template-columns: 12.5rem minmax(0, 1fr); gap: 1.25rem; align-items: start; }
.editor-questions-layout:not(:has(.editor-question-map)) { grid-template-columns: minmax(0, 1fr); }
.editor-question-content { min-width: 0; }
.editor-question-map { position: sticky; top: var(--editor-scroll-offset); max-height: calc(100dvh - var(--editor-scroll-offset) - 1rem); overflow-y: auto; }
.editor-map-entry { display: block; width: 100%; padding: .6rem; border: 2px solid transparent; border-radius: var(--bs-border-radius); background: transparent; color: var(--bs-body-color); text-align: start; }
.editor-map-entry:hover { background: var(--bs-tertiary-bg); }
.editor-map-entry[aria-current] { border-color: var(--bs-primary); background: var(--bs-primary-bg-subtle); }
.editor-map-summary { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden; overflow-wrap: anywhere; }
.editor-question-anchor { scroll-margin-top: var(--editor-scroll-offset); }
.editor-question-anchor :deep(.question-card) { margin-top: 0 !important; }
.editor-mobile-map { display: none; }
@media (max-width: 991.98px) {
  .editor-questions-layout { display: block; }
  .editor-question-map { display: none; }
  .editor-mobile-map { display: block; }
}
@media (max-width: 575.98px) {
  .editor-save-state { flex-basis: 100%; }
  .editor-primary-actions { width: 100%; }
  .editor-primary-actions .btn { flex: 1; }
  .editor-back { width: 100%; }
}
</style>
