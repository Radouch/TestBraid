<script setup lang="ts">
import AppIcon from './AppIcon.vue'
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import TestSettingsFields from './TestSettingsFields.vue'
import { explicitUiLocale } from '../ui-locale'
import type { TestSettings } from '../editor/test-settings'
import type { Question } from '../editor/model'

interface Group {
  id: string
  name: string
}
interface TestRecord {
  id: string
  groupId: string
  title: string
  description: string
  showOverallScore?: boolean
  language: string
  status: 'draft' | 'published'
  questions: Question[]
}
interface ErrorPayload {
  error?: { code?: string; message?: string }
}

const props = defineProps<{ csrfToken: string }>()
const { t } = useI18n()
const router = useRouter()
const route = useRoute()

const groups = ref<Group[]>([])
const tests = ref<TestRecord[]>([])
const readiness = ref<Record<string, { ready: boolean; issues: Array<{path: string; code: string; message: string}> }>>({})
const createDialog = ref<HTMLDialogElement | null>(null)
const lessonDialog = ref<HTMLDialogElement | null>(null)
const lessonInput = ref<HTMLInputElement | null>(null)
const dialogError = ref('')
let dialogOrigin: HTMLElement | null = null
const fallbackLink = ref('')
const dragLessonId = ref('')
const dragTestId = ref('')
const loading = ref(true)
const busy = ref(false)
const error = ref('')
const notice = ref('')

const renamingId = ref('')
const renameValue = ref('')
const groupFilter = ref('')
const newTest = ref<TestSettings>({ groupId: '', title: '', description: '', language: 'cs', showOverallScore: true })
const filteredTests = computed(() => groupFilter.value ? tests.value.filter(test => test.groupId === groupFilter.value) : tests.value)
const selectedGroup = computed(() => groups.value.find(group => group.id === groupFilter.value))
const languageQuery = computed(() => {
  const lang = explicitUiLocale(route.query.lang)
  return lang ? { lang } : {}
})
watch(() => route.query.lesson, value => { groupFilter.value = typeof value === 'string' ? value : '' }, { immediate: true })
async function selectGroup(id: string): Promise<void> {
  await router.replace({ name: 'admin', query: { ...route.query, lesson: id || undefined } })
}
function editorLocation(test: TestRecord, settings = false) {
  return { name: 'test-questions', params: { id: test.id }, query: { ...languageQuery.value, tab: settings ? 'settings' : undefined } }
}
function rememberOrigin(event?: MouseEvent): void {
  const target = event?.currentTarget
  dialogOrigin = target instanceof HTMLElement ? target.closest('details')?.querySelector<HTMLElement>('summary') ?? target : null
}
function restoreDialogFocus(): void {
  // Successful requests can close a dialog while its trigger is still
  // disabled. The busy watcher restores focus once that control is enabled.
  if (busy.value) return
  if (dialogOrigin?.isConnected) dialogOrigin.focus({ preventScroll: true })
  dialogOrigin = null
}
watch(busy, value => {
  if (!value && !lessonDialog.value?.open && !createDialog.value?.open) void nextTick(restoreDialogFocus)
})
function cancelDialog(event: Event, dialog: HTMLDialogElement | null): void {
  event.preventDefault()
  if (!busy.value) dialog?.close()
}
async function openCreate(event: MouseEvent): Promise<void> {
  if (busy.value || !groups.value.length) return
  rememberOrigin(event)
  dialogError.value = ''
  newTest.value = { groupId: groupFilter.value || groups.value[0]!.id, title: '', description: '', language: 'cs', showOverallScore: true }
  await nextTick()
  createDialog.value?.showModal()
  createDialog.value?.querySelector<HTMLInputElement>('#test-settings-title')?.focus()
}
async function openLessonDialog(group?: Group, event?: MouseEvent): Promise<void> {
  if (busy.value) return
  rememberOrigin(event)
  renamingId.value = group?.id ?? ''
  renameValue.value = group?.name ?? ''
  dialogError.value = ''
  await nextTick()
  lessonDialog.value?.showModal()
  lessonInput.value?.focus()
  lessonInput.value?.select()
}

function api(path: string): string {
  return import.meta.env.BASE_URL + 'api/admin/' + path
}

/** Shared typed admin request: only mutating operations carry CSRF tokens. */
async function request<T>(method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE', path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {}
  if (method !== 'GET') headers['X-CSRF-Token'] = props.csrfToken
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  const response = await fetch(api(path), {
    method,
    credentials: 'same-origin',
    cache: 'no-store',
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })

  let payload: T & ErrorPayload
  try {
    payload = await response.json() as T & ErrorPayload
  } catch {
    throw new Error(t('catalogNetworkError'))
  }
  if (!response.ok) {
    // Avoid showing arbitrary server/internal exception messages in the UI.
    throw new Error(t('catalogRequestFailed') + ': ' + (payload.error?.code ?? 'HTTP_' + response.status))
  }
  return payload
}

function showError(cause: unknown): void {
  error.value = cause instanceof Error ? cause.message : t('catalogNetworkError')
}

/** Reload canonical server state after every mutation, never guess assigned IDs. */
async function refresh(): Promise<void> {
  const [groupResponse, testResponse, readinessResponse] = await Promise.all([
    request<{ groups: Group[] }>('GET', 'groups'),
    request<{ tests: TestRecord[] }>('GET', 'tests'),
    request<{ tests: Record<string, { ready: boolean; issues: Array<{path: string; code: string; message: string}> }> }>('GET', 'tests/readiness'),
  ])
  groups.value = groupResponse.groups
  tests.value = testResponse.tests
  readiness.value = readinessResponse.tests
  if (groupFilter.value && !groups.value.some(group => group.id === groupFilter.value)) await selectGroup('')
}

async function load(): Promise<void> {
  loading.value = true
  error.value = ''
  try {
    await refresh()
  } catch (cause) {
    showError(cause)
  } finally {
    loading.value = false
  }
}

async function saveLesson(): Promise<void> {
  const name = renameValue.value.trim()
  if (!name || busy.value) return
  busy.value = true
  dialogError.value = ''
  notice.value = ''
  try {
    const editing = !!renamingId.value
    const group = await request<Group>(editing ? 'PATCH' : 'POST', editing ? 'groups/' + encodeURIComponent(renamingId.value) : 'groups', { name })
    lessonDialog.value?.close()
    await refresh()
    if (!editing) await selectGroup(group.id)
    notice.value = t(editing ? 'catalogGroupRenamed' : 'catalogGroupCreated')
  } catch (cause) {
    if (lessonDialog.value?.open) dialogError.value = cause instanceof Error ? cause.message : t('catalogNetworkError')
    else showError(cause)
  } finally {
    busy.value = false
  }
}

function lessonHasTests(groupId: string): boolean {
  return tests.value.some(test => test.groupId === groupId)
}

/** Let each menu action complete, then close its native <details> popup. */
function closeActionMenu(event: MouseEvent): void {
  const container = event.currentTarget
  if (!(container instanceof HTMLElement)) return
  const details = container.closest('details')
  if (details) details.open = false
}

async function deleteGroup(group: Group): Promise<void> {
  if (busy.value || lessonHasTests(group.id) || !window.confirm(t('catalogDeleteGroupConfirm', { name: group.name }))) return
  busy.value = true
  error.value = ''
  notice.value = ''
  try {
    await request<{ deleted: true }>('DELETE', 'groups/' + encodeURIComponent(group.id))
    await refresh()
    notice.value = t('catalogGroupDeleted')
  } catch (cause) {
    if (cause instanceof Error && cause.message.includes('GROUP_NOT_EMPTY')) {
      error.value = t('catalogGroupNotEmpty')
    } else {
      showError(cause)
    }
  } finally {
    busy.value = false
  }
}

async function deleteDraft(test: TestRecord): Promise<void> {
  if (busy.value || test.status !== 'draft' ||
    !window.confirm(t('catalogDeleteTestConfirm', { name: test.title }))) return
  busy.value = true
  error.value = ''
  notice.value = ''
  try {
    await request<{ deleted: true }>('DELETE', 'tests/' + encodeURIComponent(test.id))
    await refresh()
    notice.value = t('catalogTestDeleted')
  } catch (cause) {
    if (cause instanceof Error && cause.message.includes('TEST_PUBLISHED')) {
      error.value = t('catalogPublishedDeleteBlocked')
    } else {
      showError(cause)
    }
  } finally {
    busy.value = false
  }
}

async function createTest(): Promise<void> {
  if (busy.value || !newTest.value.groupId || !newTest.value.title.trim()) return
  busy.value = true
  dialogError.value = ''
  try {
    const saved = await request<TestRecord>('POST', 'tests', { ...newTest.value, title: newTest.value.title.trim() })
    // Close after successful creation, even if navigation later fails; leaving
    // a submit-ready dialog here would allow accidentally creating a second test.
    createDialog.value?.close()
    await router.push(editorLocation(saved))
  } catch (cause) {
    if (createDialog.value?.open) dialogError.value = cause instanceof Error ? cause.message : t('catalogNetworkError')
    else showError(cause)
  } finally {
    busy.value = false
  }
}

function groupLabel(id: string): string {
  return groups.value.find((group) => group.id === id)?.name ?? t('editorCurrentLesson')
}

async function changePublication(test: TestRecord, action: 'publish' | 'unpublish'): Promise<void> {
  if (busy.value || !window.confirm(t(action === 'publish' ? 'publicationConfirmPublish' : 'publicationConfirmUnpublish', { title: test.title }))) return
  busy.value = true
  error.value = ''
  try {
    await request('POST', 'tests/' + encodeURIComponent(test.id) + '/' + action)
    await refresh()
    notice.value = t(action === 'publish' ? 'publicationPublished' : 'publicationUnpublished')
  } catch (cause) {
    showError(cause)
  } finally {
    busy.value = false
  }
}

async function duplicateTest(test: TestRecord): Promise<void> {
  if (busy.value) return
  busy.value = true
  error.value = ''
  try {
    const copy = await request<TestRecord>('POST', 'tests/' + encodeURIComponent(test.id) + '/duplicate')
    await refresh()
    await router.push(editorLocation(copy, true))
  } catch (cause) {
    showError(cause)
  } finally {
    busy.value = false
  }
}

async function copyPublicLink(test: TestRecord): Promise<void> {
  try {
    const href = router.resolve({ name: 'test', params: { id: test.id } }).href
    await navigator.clipboard.writeText(new URL(href, window.location.href).href)
    notice.value = t('publicationCopied')
  } catch {
    const href = router.resolve({ name: 'test', params: { id: test.id } }).href
    fallbackLink.value = new URL(href, window.location.href).href
    notice.value = t('publicationCopyManually')
  }
}

async function saveLessonOrder(ids: string[]): Promise<void> {
  if (busy.value) return
  busy.value = true
  error.value = ''
  try {
    await request('PUT', 'groups/order', { ids })
    await refresh()
  } catch (cause) {
    showError(cause)
  } finally {
    busy.value = false
  }
}

async function saveTestOrder(groupId: string, ids: string[]): Promise<void> {
  if (busy.value) return
  busy.value = true
  error.value = ''
  try {
    await request('PUT', 'tests/order', { groupId, ids })
    await refresh()
  } catch (cause) {
    showError(cause)
  } finally {
    busy.value = false
  }
}

function moveLesson(id: string, direction: -1 | 1): void {
  const ids = groups.value.map(group => group.id)
  const index = ids.indexOf(id)
  const next = index + direction
  if (index < 0 || next < 0 || next >= ids.length) return
  ;[ids[index], ids[next]] = [ids[next], ids[index]]
  void saveLessonOrder(ids)
}

function dropLesson(targetId: string): void {
  const ids = groups.value.map(group => group.id)
  const source = ids.indexOf(dragLessonId.value)
  const target = ids.indexOf(targetId)
  dragLessonId.value = ''
  if (source < 0 || target < 0 || source === target) return
  const [id] = ids.splice(source, 1)
  ids.splice(target, 0, id)
  void saveLessonOrder(ids)
}

function moveTest(test: TestRecord, direction: -1 | 1): void {
  const ids = tests.value.filter(t => t.groupId === test.groupId).map(t => t.id)
  const index = ids.indexOf(test.id)
  const next = index + direction
  if (index < 0 || next < 0 || next >= ids.length) return
  ;[ids[index], ids[next]] = [ids[next], ids[index]]
  void saveTestOrder(test.groupId, ids)
}

function dropTest(target: TestRecord): void {
  const source = tests.value.find(t => t.id === dragTestId.value)
  dragTestId.value = ''
  if (!source || source.groupId !== target.groupId || source.id === target.id) return
  const ids = tests.value.filter(t => t.groupId === target.groupId).map(t => t.id)
  ids.splice(ids.indexOf(source.id), 1)
  ids.splice(ids.indexOf(target.id), 0, source.id)
  void saveTestOrder(target.groupId, ids)
}

onMounted(() => void load())
</script>

<template>
  <section aria-labelledby="catalog-heading" class="mt-4">
    <h2 id="catalog-heading" class="h4 visually-hidden">{{ t('catalogHeading') }}</h2>
    <p v-if="error" class="alert alert-danger" role="alert">{{ error }}</p>
    <p v-if="notice" class="alert alert-success" role="status">{{ notice }}</p>
    <p v-if="loading" role="status">{{ t('loading') }}</p>

    <div v-else>
      <div class="card card-body d-lg-none mb-3">
        <label class="form-label" for="catalog-lesson-select">{{ t('adminLessons') }}</label>
        <select id="catalog-lesson-select" class="form-select mb-2" :value="groupFilter" :disabled="busy" @change="selectGroup(($event.target as HTMLSelectElement).value)">
          <option value="">{{ t('adminAllTests') }} ({{ tests.length }})</option>
          <option v-for="group in groups" :key="group.id" :value="group.id">{{ group.name }}</option>
        </select>
        <div class="d-flex flex-wrap gap-2">
          <button type="button" class="btn btn-outline-primary btn-sm" :disabled="busy" @click="openLessonDialog(undefined, $event)"><AppIcon name="folder-plus" />{{ t('catalogAddGroup') }}</button>
          <details v-if="selectedGroup" class="dropdown">
            <summary class="btn btn-outline-secondary btn-sm icon-button" :aria-label="t('adminLessonActions')"><AppIcon name="three-dots-vertical" /></summary>
            <div class="dropdown-menu show position-absolute" @click="closeActionMenu">
              <button type="button" class="dropdown-item" :disabled="busy || groups[0]?.id === selectedGroup.id" @click="moveLesson(selectedGroup.id, -1)"><AppIcon name="arrow-up" />{{ t('adminMoveUp') }}</button>
              <button type="button" class="dropdown-item" :disabled="busy || groups.at(-1)?.id === selectedGroup.id" @click="moveLesson(selectedGroup.id, 1)"><AppIcon name="arrow-down" />{{ t('adminMoveDown') }}</button>
              <button type="button" class="dropdown-item text-danger" :disabled="busy || lessonHasTests(selectedGroup.id)" :title="lessonHasTests(selectedGroup.id) ? t('catalogGroupNotEmpty') : undefined" @click="deleteGroup(selectedGroup)"><AppIcon name="trash3" />{{ t('catalogDelete') }}</button>
            </div>
          </details>
        </div>
      </div>
      <div class="row g-4">
      <aside class="col-lg-4 d-none d-lg-block" aria-labelledby="lessons-heading">
        <div class="card p-3">
          <h3 id="lessons-heading" class="h5">{{ t('adminLessons') }}</h3>
          <ul class="list-group mb-3">
            <li class="list-group-item" :class="{ 'catalog-lesson-current': !groupFilter }">
              <button type="button" class="btn btn-link text-start w-100 text-decoration-none"
                :class="{ 'fw-bold': !groupFilter }" :aria-pressed="!groupFilter" :disabled="busy" @click="selectGroup('')">
                {{ t('adminAllTests') }} <span class="text-secondary">({{ tests.length }})</span>
              </button>
            </li>
            <li v-for="group in groups" :key="group.id" class="list-group-item" :class="{ 'catalog-lesson-current': groupFilter === group.id }"
              :draggable="!busy" @dragstart="dragLessonId = group.id"
              @dragover.prevent @drop.prevent="dropLesson(group.id)">
              <div class="d-flex align-items-center gap-1">
                <button type="button" class="btn btn-link text-start text-decoration-none flex-grow-1"
                  :class="{ 'fw-bold': groupFilter === group.id }" :aria-pressed="groupFilter === group.id" :disabled="busy"
                  @click="selectGroup(group.id)">
                  {{ group.name }} <span class="text-secondary">({{ tests.filter(test => test.groupId === group.id).length }})</span>
                </button>
                <details class="dropdown">
                  <summary class="btn btn-outline-secondary btn-sm icon-button" :aria-label="t('adminLessonActions')" :title="t('adminLessonActions')"><AppIcon name="three-dots-vertical" /></summary>
                  <div class="dropdown-menu show position-absolute" @click="closeActionMenu">
                    <button class="dropdown-item" type="button" :disabled="busy || groups[0]?.id === group.id"
                      @click="moveLesson(group.id, -1)"><AppIcon name="arrow-up" />{{ t('adminMoveUp') }}</button>
                    <button class="dropdown-item" type="button" :disabled="busy || groups[groups.length - 1]?.id === group.id"
                      @click="moveLesson(group.id, 1)"><AppIcon name="arrow-down" />{{ t('adminMoveDown') }}</button>
                    <button class="dropdown-item" type="button" :disabled="busy" @click="openLessonDialog(group, $event)">
                      <AppIcon name="pencil-square" />{{ t('catalogRenameGroup') }}
                    </button>
                    <button class="dropdown-item text-danger" type="button"
                      :disabled="busy || lessonHasTests(group.id)"
                      :title="lessonHasTests(group.id) ? t('catalogGroupNotEmpty') : undefined"
                      @click="deleteGroup(group)"><AppIcon name="trash3" />{{ t('catalogDelete') }}</button>
                  </div>
                </details>
              </div>
            </li>
          </ul>
          <button type="button" class="btn btn-outline-primary btn-sm" :disabled="busy" @click="openLessonDialog(undefined, $event)"><AppIcon name="folder-plus" />{{ t('catalogAddGroup') }}</button>
        </div>
      </aside>

      <section class="col-12 col-lg-8" aria-labelledby="tests-heading">
        <div class="card p-3">
          <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
            <h3 id="tests-heading" class="h5 mb-0">{{ selectedGroup?.name ?? t('adminAllTests') }} <span class="badge bg-body-secondary text-body-secondary">{{ filteredTests.length }}</span></h3>
            <button v-if="selectedGroup" type="button" class="btn btn-outline-secondary btn-sm ms-md-auto" :disabled="busy" @click="openLessonDialog(selectedGroup, $event)"><AppIcon name="pencil-square" />{{ t('catalogRenameGroup') }}</button>
            <button type="button" class="btn btn-primary btn-sm" :disabled="busy || groups.length === 0"
              @click="openCreate">
              <AppIcon name="file-earmark-plus" />{{ t('adminNewTest') }}
            </button>
          </div>
          <div v-if="fallbackLink" class="mb-3">
            <label for="public-test-link" class="form-label">{{ t('publicationLink') }}</label>
            <input id="public-test-link" class="form-control form-control-sm" readonly :value="fallbackLink"
              @focus="($event.target as HTMLInputElement).select()" />
          </div>
          <p v-if="filteredTests.length === 0" class="text-secondary">{{ t('catalogNoTests') }}</p>
          <ul v-else class="list-group list-group-flush">
            <li v-for="test in filteredTests" :key="test.id"
              class="list-group-item d-flex justify-content-between align-items-start gap-2 px-0"
              draggable="true" @dragstart="dragTestId = test.id"
              @dragover.prevent @drop.prevent="dropTest(test)">
              <div class="flex-grow-1">
                <RouterLink :to="editorLocation(test)" class="fw-semibold">
                  {{ test.title || t('catalogUntitled') }}
                </RouterLink>
                <p class="small text-secondary mb-1">{{ groupLabel(test.groupId) }} · {{ test.language }}</p>
                <div v-if="test.status === 'published'" class="small text-success">
                  {{ t('catalogPublished') }}
                </div>
                <div v-else-if="readiness[test.id]?.ready" class="small text-primary">
                  {{ t('adminReady') }}
                </div>
                <details v-else class="small">
                  <summary class="text-warning-emphasis">{{ t('adminIncomplete') }}</summary>
                  <ul v-if="readiness[test.id]?.issues.length" class="mb-1 mt-1 ps-3">
                    <li v-for="(issue, i) in readiness[test.id].issues" :key="i">
                      {{ issue.path }}: {{ t('readiness_' + issue.code) }}
                    </li>
                  </ul>
                  <p v-else class="text-secondary">{{ t('adminReadinessUnknown') }}</p>
                </details>
              </div>
              <details class="dropdown">
                <summary class="btn btn-outline-secondary btn-sm icon-button" :aria-label="t('adminTestActions')" :title="t('adminTestActions')"><AppIcon name="three-dots-vertical" /></summary>
                <div class="dropdown-menu dropdown-menu-end show position-absolute" @click="closeActionMenu">
                  <button class="dropdown-item" type="button" :disabled="busy || tests.filter(t => t.groupId === test.groupId)[0]?.id === test.id"
                    @click="moveTest(test, -1)"><AppIcon name="arrow-up" />{{ t('adminMoveUp') }}</button>
                  <button class="dropdown-item" type="button" :disabled="busy || tests.filter(t => t.groupId === test.groupId).slice(-1)[0]?.id === test.id"
                    @click="moveTest(test, 1)"><AppIcon name="arrow-down" />{{ t('adminMoveDown') }}</button>
                  <RouterLink class="dropdown-item" :to="editorLocation(test)">
                    <AppIcon name="pencil-square" />{{ t('adminOpenEditor') }}
                  </RouterLink>
                  <RouterLink v-if="test.status === 'draft'" class="dropdown-item" :to="editorLocation(test, true)"><AppIcon name="pencil-square" />{{ t('catalogEditMetadata') }}</RouterLink>
                  <RouterLink class="dropdown-item" :to="{ name: 'test-preview', params: { id: test.id }, query: languageQuery }">
                    <AppIcon name="eye" />{{ t('runnerPreviewButton') }}
                  </RouterLink>
                  <button v-if="test.status === 'draft' && readiness[test.id]?.ready" type="button"
                    class="dropdown-item" :disabled="busy" @click="changePublication(test, 'publish')">
                    <AppIcon name="upload" />{{ t('publicationPublish') }}
                  </button>
                  <template v-if="test.status === 'published'">
                    <RouterLink class="dropdown-item" target="_blank" rel="noopener"
                      :to="{ name: 'test', params: { id: test.id }, query: languageQuery }"><AppIcon name="box-arrow-up-right" />{{ t('publicationOpenPublic') }}</RouterLink>
                    <button type="button" class="dropdown-item" @click="copyPublicLink(test)">
                      <AppIcon name="link-45deg" />{{ t('publicationCopyLink') }}
                    </button>
                    <button type="button" class="dropdown-item" :disabled="busy"
                      @click="changePublication(test, 'unpublish')"><AppIcon name="arrow-counterclockwise" />{{ t('publicationUnpublish') }}</button>
                  </template>
                  <button class="dropdown-item" type="button" :disabled="busy"
                    @click="duplicateTest(test)"><AppIcon name="copy" />{{ t('adminDuplicate') }}</button>
                  <button v-if="test.status === 'draft'" class="dropdown-item text-danger" type="button"
                    :disabled="busy" @click="deleteDraft(test)"><AppIcon name="trash3" />{{ t('catalogDelete') }}</button>
                </div>
              </details>
            </li>
          </ul>
        </div>


      </section>
      </div>
    </div>
    <dialog ref="lessonDialog" class="catalog-dialog border rounded shadow" aria-labelledby="lesson-dialog-heading" @cancel="cancelDialog($event, lessonDialog)" @close="restoreDialogFocus">
      <form @submit.prevent="saveLesson">
        <h2 id="lesson-dialog-heading" class="h5 mb-3">{{ t(renamingId ? 'adminRenameLesson' : 'catalogAddGroup') }}</h2>
        <p v-if="dialogError" class="alert alert-danger" role="alert">{{ dialogError }}</p>
        <label for="lesson-dialog-name" class="form-label">{{ t('adminLessonName') }}</label>
        <input id="lesson-dialog-name" ref="lessonInput" v-model="renameValue" class="form-control" maxlength="250" required :disabled="busy" />
        <div class="d-flex gap-2 flex-wrap justify-content-end mt-3">
          <button type="button" class="btn btn-outline-secondary" :disabled="busy" @click="lessonDialog?.close()">{{ t('catalogCancel') }}</button>
          <button type="submit" class="btn btn-primary" :disabled="busy || !renameValue.trim()"><AppIcon name="floppy" />{{ t('catalogSave') }}</button>
        </div>
      </form>
    </dialog>
    <dialog ref="createDialog" class="catalog-dialog catalog-create-dialog border rounded shadow" aria-labelledby="create-test-heading" @cancel="cancelDialog($event, createDialog)" @close="restoreDialogFocus">
      <form @submit.prevent="createTest">
        <h2 id="create-test-heading" class="h5 mb-3">{{ t('adminNewTest') }}</h2>
        <p v-if="dialogError" class="alert alert-danger" role="alert">{{ dialogError }}</p>
        <fieldset :disabled="busy" class="border-0 p-0 m-0"><TestSettingsFields :settings="newTest" :lessons="groups" /></fieldset>
        <div class="d-flex gap-2 flex-wrap justify-content-end mt-3">
          <button type="button" class="btn btn-outline-secondary" :disabled="busy" @click="createDialog?.close()">{{ t('catalogCancel') }}</button>
          <button type="submit" class="btn btn-primary" :disabled="busy || !newTest.title.trim()"><AppIcon name="file-earmark-plus" />{{ t('adminCreateTest') }}</button>
        </div>
      </form>
    </dialog>
  </section>
</template>

<style scoped>
.catalog-lesson-current { background: var(--bs-primary-bg-subtle); }
.catalog-lesson-current .btn-link { color: var(--bs-primary-text-emphasis); }
.catalog-dialog { width: min(32rem, calc(100% - 2rem)); max-height: calc(100dvh - 2rem); padding: 1.25rem; background: var(--bs-body-bg); color: var(--bs-body-color); }
.catalog-create-dialog { width: min(52rem, calc(100% - 2rem)); }
.catalog-dialog::backdrop { background: rgb(0 0 0 / .35); }
@media (max-width: 575.98px) { .catalog-dialog { padding: 1rem; } }

/* Native disclosures do not use Bootstrap's Popper positioning. Keep the
   wider labelled icon menus inside the catalog at phone widths. */
.dropdown-menu { right: 0; left: auto; min-width: min(15rem, calc(100vw - 2rem)); max-width: calc(100vw - 2rem); }
.dropdown-item { display: flex; align-items: center; gap: .5rem; white-space: normal; }
.dropdown-item > .app-icon { margin: 0; }
.dropdown-item.text-danger:disabled { color: var(--bs-dropdown-link-disabled-color) !important; }
</style>
