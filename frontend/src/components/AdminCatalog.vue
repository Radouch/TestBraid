<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'

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
  questions: unknown[]
}
interface ErrorPayload {
  error?: { code?: string; message?: string }
}

const props = defineProps<{ csrfToken: string }>()
const { t } = useI18n()

const groups = ref<Group[]>([])
const tests = ref<TestRecord[]>([])
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
  const [groupResponse, testResponse] = await Promise.all([
    request<{ groups: Group[] }>('GET', 'groups'),
    request<{ tests: TestRecord[] }>('GET', 'tests'),
  ])
  groups.value = groupResponse.groups
  tests.value = testResponse.tests
  if (!groups.value.some((group) => group.id === draftGroupId.value)) {
    draftGroupId.value = groups.value[0]?.id ?? ''
  }
  if (groupFilter.value && !groups.value.some((group) => group.id === groupFilter.value)) {
    groupFilter.value = ''
  }
  if (selectedTestId.value && !tests.value.some((test) => test.id === selectedTestId.value)) {
    resetForm()
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

onMounted(() => void load())
</script>

<template>
  <section aria-labelledby="catalog-heading" class="mt-4">
    <h2 id="catalog-heading" class="h4">{{ t('catalogHeading') }}</h2>
    <p class="text-secondary">{{ t('catalogIntroduction') }}</p>

    <p v-if="error" class="alert alert-danger" role="alert">{{ error }}</p>
    <p v-if="notice" class="alert alert-success" role="status">{{ notice }}</p>
    <p v-if="loading" role="status">{{ t('loading') }}</p>

    <template v-else>
      <section aria-labelledby="groups-heading" class="card p-3 mb-4">
        <h3 id="groups-heading" class="h5">{{ t('catalogGroups') }}</h3>
        <form class="d-flex gap-2 mb-3" @submit.prevent="createGroup">
          <label class="visually-hidden" for="catalog-new-group">{{ t('catalogNewGroup') }}</label>
          <input id="catalog-new-group" v-model="groupName" class="form-control"
            :placeholder="t('catalogNewGroup')" maxlength="250" required />
          <button class="btn btn-primary" type="submit" :disabled="busy || !groupName.trim()">
            {{ t('catalogAddGroup') }}
          </button>
        </form>
        <p v-if="groups.length === 0" class="text-secondary">{{ t('catalogNoGroups') }}</p>
        <ul v-else class="list-group">
          <li v-for="group in groups" :key="group.id" class="list-group-item">
            <form v-if="renamingId === group.id" class="d-flex gap-2" @submit.prevent="renameGroup">
              <label class="visually-hidden" :for="'rename-' + group.id">{{ t('catalogRenameGroup') }}</label>
              <input :id="'rename-' + group.id" v-model="renameValue" class="form-control"
                maxlength="250" required />
              <button class="btn btn-primary btn-sm" type="submit" :disabled="busy || !renameValue.trim()">
                {{ t('catalogSave') }}
              </button>
              <button type="button" class="btn btn-outline-secondary btn-sm" :disabled="busy"
                @click="renamingId = ''">{{ t('catalogCancel') }}</button>
            </form>
            <div v-else class="d-flex justify-content-between align-items-center gap-2">
              <span>{{ group.name }}</span>
              <div class="d-flex gap-2">
                <button type="button" class="btn btn-outline-secondary btn-sm" :disabled="busy"
                  @click="beginRename(group)">{{ t('catalogRenameGroup') }}</button>
                <button type="button" class="btn btn-outline-danger btn-sm" :disabled="busy"
                  @click="deleteGroup(group)">{{ t('catalogDelete') }}</button>
              </div>
            </div>
          </li>
        </ul>
      </section>

      <section aria-labelledby="tests-heading" class="card p-3 mb-4">
        <h3 id="tests-heading" class="h5">{{ t('catalogTests') }}</h3>
        <label for="catalog-filter" class="form-label">{{ t('catalogFilterGroup') }}</label>
        <select id="catalog-filter" v-model="groupFilter" class="form-select mb-3">
          <option value="">{{ t('catalogAllGroups') }}</option>
          <option v-for="group in groups" :key="group.id" :value="group.id">{{ group.name }}</option>
        </select>
        <p v-if="filteredTests.length === 0" class="text-secondary">{{ t('catalogNoTests') }}</p>
        <ul v-else class="list-group">
          <li v-for="test in filteredTests" :key="test.id"
            class="list-group-item d-flex gap-3 justify-content-between align-items-center">
            <div>
              <strong>{{ test.title || t('catalogUntitled') }}</strong>
              <div class="small text-secondary">
                {{ groupLabel(test.groupId) }} · {{ test.language }} ·
                {{ test.status === 'published' ? t('catalogPublished') : t('catalogDraft') }}
              </div>
            </div>
            <div class="d-flex gap-2 flex-wrap">
              <button type="button" class="btn btn-outline-primary btn-sm"
                :disabled="busy || test.status !== 'draft'" @click="editTest(test)">
                {{ test.status === 'published' ? t('catalogPublishedLocked') : t('catalogEditMetadata') }}
              </button>
              <button type="button" class="btn btn-outline-danger btn-sm"
                :title="test.status === 'published' ? t('catalogPublishedDeleteBlocked') : undefined"
                :disabled="busy || test.status !== 'draft'" @click="deleteDraft(test)">
                {{ t('catalogDelete') }}
              </button>
            </div>
          </li>
        </ul>
      </section>

      <section aria-labelledby="draft-heading" class="card p-3 mb-4">
        <h3 id="draft-heading" class="h5">
          {{ selectedDraft ? t('catalogEditDraft') : t('catalogCreateDraft') }}
        </h3>
        <p class="small text-secondary">{{ t('catalogMetadataOnly') }}</p>
        <form class="d-grid gap-3" @submit.prevent="saveDraft">
          <div>
            <label for="draft-group" class="form-label">{{ t('catalogGroup') }}</label>
            <select id="draft-group" v-model="draftGroupId" class="form-select"
              :disabled="groups.length === 0 || busy" required>
              <option v-for="group in groups" :key="group.id" :value="group.id">{{ group.name }}</option>
            </select>
          </div>
          <div>
            <label for="draft-title" class="form-label">{{ t('catalogTitle') }}</label>
            <input id="draft-title" v-model="draftTitle" class="form-control" maxlength="250"
              :disabled="busy" required />
          </div>
          <div>
            <label for="draft-description" class="form-label">{{ t('catalogDescription') }}</label>
            <textarea id="draft-description" v-model="draftDescription"
              class="form-control" rows="3" maxlength="50000" :disabled="busy" />
          </div>
          <div>
            <label for="draft-language" class="form-label">{{ t('catalogContentLanguage') }}</label>
            <select id="draft-language" v-model="draftLanguage" class="form-select" :disabled="busy">
              <option value="cs">{{ t('catalogCzech') }}</option>
              <option value="en">{{ t('catalogEnglish') }}</option>
            </select>
          </div>
          <div class="d-flex gap-2">
            <button type="submit" class="btn btn-primary"
              :disabled="busy || groups.length === 0 || !draftTitle.trim()">
              {{ t('catalogSaveDraft') }}
            </button>
            <button type="button" class="btn btn-outline-secondary" :disabled="busy"
              @click="resetForm">{{ t('catalogNewDraft') }}</button>
          </div>
        </form>
        <div v-if="selectedDraft" class="d-flex flex-wrap gap-2 mt-3">
          <RouterLink class="btn btn-outline-primary"
            :to="{ name: 'test-questions', params: { id: selectedDraft.id } }">
            {{ t('editorOpen') }}
          </RouterLink>
          <RouterLink class="btn btn-outline-secondary"
            :to="{ name: 'test-preview', params: { id: selectedDraft.id } }">
            {{ t('runnerPreviewButton') }}
          </RouterLink>
        </div>
      </section>
    </template>
  </section>
</template>
