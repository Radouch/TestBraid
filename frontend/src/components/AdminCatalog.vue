<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { publicationProblems } from '../editor/model'
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

const groups = ref<Group[]>([])
const tests = ref<TestRecord[]>([])
const readiness = ref<Record<string, { ready: boolean; issues: Array<{path: string; code: string; message: string}> }>>({})
const showDraftForm = ref(false)
const loading = ref(true)
const busy = ref(false)
const error = ref('')
const notice = ref('')
const groupName = ref('')
const renamingId = ref('')
const renameValue = ref('')
const groupFilter = ref('')
const selectedTestId = ref('')
const draftGroupId = ref('')
const draftTitle = ref('')
const draftDescription = ref('')
const draftLanguage = ref('cs')

const filteredTests = computed(() =>
  groupFilter.value ? tests.value.filter((test) => test.groupId === groupFilter.value) : tests.value,
)
const selectedDraft = computed(() =>
  tests.value.find((test) => test.id === selectedTestId.value && test.status === 'draft') ?? null,
)

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

function resetForm(): void {
  showDraftForm.value = true
  selectedTestId.value = ''
  draftTitle.value = ''
  draftDescription.value = ''
  draftLanguage.value = 'cs'
  draftGroupId.value = groups.value[0]?.id ?? ''
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
  if (!groups.value.some((group) => group.id === draftGroupId.value)) {
    draftGroupId.value = groups.value[0]?.id ?? ''
  }
  if (groupFilter.value && !groups.value.some((group) => group.id === groupFilter.value)) {
    groupFilter.value = ''
  }
  if (selectedTestId.value && !tests.value.some((test) =>
    test.id === selectedTestId.value && test.status === 'draft')) {
    resetForm()
  }
}

async function publicationChanged(): Promise<void> {
  error.value = ''
  try {
    await refresh()
  } catch (cause) {
    showError(cause)
  }
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

async function createGroup(): Promise<void> {
  const name = groupName.value.trim()
  if (!name || busy.value) return
  busy.value = true
  error.value = ''
  notice.value = ''
  try {
    const group = await request<Group>('POST', 'groups', { name })
    groupName.value = ''
    await refresh()
    draftGroupId.value = group.id
    notice.value = t('catalogGroupCreated')
  } catch (cause) {
    showError(cause)
  } finally {
    busy.value = false
  }
}

function beginRename(group: Group): void {
  renamingId.value = group.id
  renameValue.value = group.name
  error.value = ''
}

async function renameGroup(): Promise<void> {
  const name = renameValue.value.trim()
  if (!renamingId.value || !name || busy.value) return
  busy.value = true
  error.value = ''
  notice.value = ''
  try {
    await request<Group>('PATCH', 'groups/' + encodeURIComponent(renamingId.value), { name })
    renamingId.value = ''
    renameValue.value = ''
    await refresh()
    notice.value = t('catalogGroupRenamed')
  } catch (cause) {
    showError(cause)
  } finally {
    busy.value = false
  }
}


async function deleteGroup(group: Group): Promise<void> {
  if (busy.value || !window.confirm(t('catalogDeleteGroupConfirm', { name: group.name }))) return
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
    if (selectedTestId.value === test.id) resetForm()
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

function editTest(test: TestRecord): void {
  if (test.status !== 'draft') return
  selectedTestId.value = test.id
  draftGroupId.value = test.groupId
  draftTitle.value = test.title
  draftDescription.value = test.description
  draftLanguage.value = test.language
  error.value = ''
  notice.value = ''
  showDraftForm.value = true
}

async function saveDraft(): Promise<void> {
  if (busy.value || !draftGroupId.value || !draftTitle.value.trim()) return
  // Another author/tab may publish the selected draft while this form stays
  // open. Do not silently turn a stale edit into a newly created test.
  if (selectedTestId.value && !selectedDraft.value) {
    error.value = t('catalogStaleDraft')
    return
  }
  busy.value = true
  error.value = ''
  notice.value = ''
  try {
    const body = {
      groupId: draftGroupId.value,
      language: draftLanguage.value,
      title: draftTitle.value.trim(),
      description: draftDescription.value,
      // Re-submit the existing question array unchanged during metadata edits.
      // Only the future question editor is allowed to change this payload.
      ...(selectedDraft.value ? { questions: selectedDraft.value.questions } : {}),
    }
    const saved = selectedDraft.value
      ? await request<TestRecord>('PUT', 'tests/' + encodeURIComponent(selectedDraft.value.id), body)
      : await request<TestRecord>('POST', 'tests', body)
    await refresh()
    editTest(saved)
    notice.value = t('catalogDraftSaved')
  } catch (cause) {
    showError(cause)
  } finally {
    busy.value = false
  }
}

function groupLabel(id: string): string {
  return groups.value.find((group) => group.id === id)?.name ?? id
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
    groupFilter.value = copy.groupId
    editTest(copy)
    notice.value = t('adminDuplicated')
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
    error.value = t('publicationCopyManually')
  }
}

onMounted(() => void load())
</script>

<template>
  <section aria-labelledby="catalog-heading" class="mt-4">
    <h2 id="catalog-heading" class="h4 visually-hidden">{{ t('catalogHeading') }}</h2>
    <p v-if="error" class="alert alert-danger" role="alert">{{ error }}</p>
    <p v-if="notice" class="alert alert-success" role="status">{{ notice }}</p>
    <p v-if="loading" role="status">{{ t('loading') }}</p>

    <div v-else class="row g-4">
      <aside class="col-12 col-lg-4" aria-labelledby="lessons-heading">
        <div class="card p-3">
          <h3 id="lessons-heading" class="h5">{{ t('adminLessons') }}</h3>
          <ul class="list-group mb-3">
            <li class="list-group-item">
              <button type="button" class="btn btn-link text-start w-100 text-decoration-none"
                :class="{ 'fw-bold': !groupFilter }" @click="groupFilter = ''">
                {{ t('adminAllTests') }} <span class="text-secondary">({{ tests.length }})</span>
              </button>
            </li>
            <li v-for="group in groups" :key="group.id" class="list-group-item">
              <form v-if="renamingId === group.id" class="d-flex gap-2" @submit.prevent="renameGroup">
                <label class="visually-hidden" :for="'rename-' + group.id">{{ t('catalogRenameGroup') }}</label>
                <input :id="'rename-' + group.id" v-model="renameValue" class="form-control"
                  maxlength="250" required />
                <button class="btn btn-primary btn-sm" type="submit" :disabled="busy || !renameValue.trim()">
                  {{ t('catalogSave') }}
                </button>
                <button class="btn btn-outline-secondary btn-sm" type="button" @click="renamingId = ''">
                  {{ t('catalogCancel') }}
                </button>
              </form>
              <div v-else class="d-flex align-items-center gap-1">
                <button type="button" class="btn btn-link text-start text-decoration-none flex-grow-1"
                  :class="{ 'fw-bold': groupFilter === group.id }"
                  @click="groupFilter = group.id">
                  {{ group.name }} <span class="text-secondary">({{ tests.filter(test => test.groupId === group.id).length }})</span>
                </button>
                <details class="dropdown">
                  <summary class="btn btn-outline-secondary btn-sm" :aria-label="t('adminLessonActions')">⋮</summary>
                  <div class="dropdown-menu show position-absolute">
                    <button class="dropdown-item" type="button" @click="beginRename(group)">
                      {{ t('catalogRenameGroup') }}
                    </button>
                    <button class="dropdown-item text-danger" type="button" :disabled="busy"
                      @click="deleteGroup(group)">{{ t('catalogDelete') }}</button>
                  </div>
                </details>
              </div>
            </li>
          </ul>
          <form class="d-flex flex-wrap gap-2" @submit.prevent="createGroup">
            <label class="visually-hidden" for="catalog-new-group">{{ t('catalogNewGroup') }}</label>
            <input id="catalog-new-group" v-model="groupName" class="form-control flex-grow-1"
              :placeholder="t('catalogNewGroup')" maxlength="250" required />
            <button class="btn btn-outline-primary btn-sm" type="submit" :disabled="busy || !groupName.trim()">
              {{ t('catalogAddGroup') }}
            </button>
          </form>
        </div>
      </aside>

      <section class="col-12 col-lg-8" aria-labelledby="tests-heading">
        <div class="card p-3">
          <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
            <h3 id="tests-heading" class="h5 mb-0">{{ t('adminTests') }}</h3>
            <button type="button" class="btn btn-primary btn-sm" :disabled="busy || groups.length === 0"
              @click="resetForm(); draftGroupId = groupFilter || (groups[0]?.id ?? '')">
              {{ t('adminNewTest') }}
            </button>
          </div>
          <p v-if="filteredTests.length === 0" class="text-secondary">{{ t('catalogNoTests') }}</p>
          <ul v-else class="list-group list-group-flush">
            <li v-for="test in filteredTests" :key="test.id"
              class="list-group-item d-flex justify-content-between align-items-start gap-2 px-0">
              <div class="flex-grow-1">
                <RouterLink :to="{ name: 'test-questions', params: { id: test.id } }" class="fw-semibold">
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
                      {{ issue.path }}: {{ issue.message }}
                    </li>
                  </ul>
                  <p v-else class="text-secondary">{{ t('adminReadinessUnknown') }}</p>
                </details>
              </div>
              <details class="dropdown">
                <summary class="btn btn-outline-secondary btn-sm" :aria-label="t('adminTestActions')">⋮</summary>
                <div class="dropdown-menu dropdown-menu-end show position-absolute">
                  <RouterLink class="dropdown-item" :to="{ name: 'test-questions', params: { id: test.id } }">
                    {{ t('adminOpenEditor') }}
                  </RouterLink>
                  <button v-if="test.status === 'draft'" class="dropdown-item" type="button"
                    @click="editTest(test)">{{ t('catalogEditMetadata') }}</button>
                  <RouterLink class="dropdown-item" :to="{ name: 'test-preview', params: { id: test.id } }">
                    {{ t('runnerPreviewButton') }}
                  </RouterLink>
                  <button v-if="test.status === 'draft' && readiness[test.id]?.ready" type="button"
                    class="dropdown-item" :disabled="busy" @click="changePublication(test, 'publish')">
                    {{ t('publicationPublish') }}
                  </button>
                  <template v-if="test.status === 'published'">
                    <RouterLink class="dropdown-item" target="_blank" rel="noopener"
                      :to="{ name: 'test', params: { id: test.id } }">{{ t('publicationOpenPublic') }}</RouterLink>
                    <button type="button" class="dropdown-item" @click="copyPublicLink(test)">
                      {{ t('publicationCopyLink') }}
                    </button>
                    <button type="button" class="dropdown-item" :disabled="busy"
                      @click="changePublication(test, 'unpublish')">{{ t('publicationUnpublish') }}</button>
                  </template>
                  <button class="dropdown-item" type="button" :disabled="busy"
                    @click="duplicateTest(test)">{{ t('adminDuplicate') }}</button>
                  <button v-if="test.status === 'draft'" class="dropdown-item text-danger" type="button"
                    :disabled="busy" @click="deleteDraft(test)">{{ t('catalogDelete') }}</button>
                </div>
              </details>
            </li>
          </ul>
        </div>

        <section v-if="showDraftForm" aria-labelledby="draft-heading" class="card p-3 mt-3">
          <div class="d-flex justify-content-between align-items-center gap-2">
            <h3 id="draft-heading" class="h5">{{ selectedDraft ? t('catalogEditDraft') : t('catalogCreateDraft') }}</h3>
            <button type="button" class="btn-close" :aria-label="t('catalogCancel')" @click="showDraftForm = false" />
          </div>
          <form class="d-grid gap-3" @submit.prevent="saveDraft">
            <div>
              <label for="draft-group" class="form-label">{{ t('adminLessons') }}</label>
              <select id="draft-group" v-model="draftGroupId" class="form-select" required :disabled="busy">
                <option v-for="group in groups" :key="group.id" :value="group.id">{{ group.name }}</option>
              </select>
            </div>
            <div>
              <label for="draft-title" class="form-label">{{ t('catalogTitle') }}</label>
              <input id="draft-title" v-model="draftTitle" class="form-control" maxlength="250" required :disabled="busy" />
            </div>
            <div>
              <label for="draft-description" class="form-label">{{ t('catalogDescription') }}</label>
              <textarea id="draft-description" v-model="draftDescription" class="form-control" rows="3" maxlength="50000" />
            </div>
            <div>
              <label for="draft-language" class="form-label">{{ t('catalogContentLanguage') }}</label>
              <input id="draft-language" v-model="draftLanguage" class="form-control" maxlength="35"
                pattern="[A-Za-z]{2,8}(-[A-Za-z0-9]{1,8})*" required />
            </div>
            <div class="d-flex flex-wrap gap-2">
              <button type="submit" class="btn btn-primary" :disabled="busy || !draftTitle.trim()">
                {{ t('catalogSaveDraft') }}
              </button>
              <RouterLink v-if="selectedDraft" class="btn btn-outline-secondary"
                :to="{ name: 'test-questions', params: { id: selectedDraft.id } }">{{ t('editorOpen') }}</RouterLink>
            </div>
          </form>
        </section>
      </section>
    </div>
  </section>
</template>
