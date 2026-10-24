<script setup lang="ts">
import AppIcon from '../components/AppIcon.vue'
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { onBeforeRouteLeave, useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import QuestionEditor from '../components/QuestionEditor.vue'
import PublishedQuestionView from '../components/PublishedQuestionView.vue'
import {
  createChoice, createMatching, duplicateQuestion, invalidMediaReference, move, publicationProblems,
  type DraftTest, type Question,
} from '../editor/model'

const route = useRoute()
const { t } = useI18n()
const test = ref<DraftTest | null>(null)
const questions = ref<Question[]>([])
const originalQuestions = ref('[]')
const csrfToken = ref('')
const loading = ref(true)
const busy = ref(false)
const error = ref('')
const success = ref('')
const expandedQuestionId = ref('')
const dirty = computed(() => JSON.stringify(questions.value) !== originalQuestions.value)
const problems = computed(() => publicationProblems(questions.value))
const publicId = computed(() => String(route.params.id ?? ''))
const api = (path: string) => import.meta.env.BASE_URL + 'api/' + path

function prepareExit(): boolean {
  return !dirty.value || window.confirm(t('editorUnsavedConfirm'))
}
function beforeUnload(event: BeforeUnloadEvent): void {
  if (dirty.value) {
    event.preventDefault()
    event.returnValue = ''
  }
}
onBeforeRouteLeave(() => prepareExit())
onUnmounted(() => window.removeEventListener('beforeunload', beforeUnload))

async function load(): Promise<void> {
  loading.value = true
  error.value = ''
  test.value = null
  questions.value = []
  originalQuestions.value = '[]'
  try {
    const sessionResponse = await fetch(api('auth/session'), {
      credentials: 'same-origin', cache: 'no-store',
    })
    if (!sessionResponse.ok) throw new Error(t('editorSessionUnavailable'))
    const session = await sessionResponse.json() as {
      authenticated: boolean
      csrfToken: string
    }
    if (!session.authenticated) throw new Error(t('editorSignInRequired'))
    csrfToken.value = session.csrfToken
    const testResponse = await fetch(api('admin/tests/' + encodeURIComponent(publicId.value)), {
      credentials: 'same-origin', cache: 'no-store',
    })
    if (!testResponse.ok) throw new Error(t('editorLoadFailed'))
    const fetched = await testResponse.json() as DraftTest
    test.value = fetched
    if (fetched.status === 'draft') {
      // Make a detached editable copy; never mutate the loaded server
      // document until a successful authenticated PUT.
      questions.value = structuredClone(fetched.questions)
      originalQuestions.value = JSON.stringify(questions.value)
    }
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : t('editorLoadFailed')
  } finally {
    loading.value = false
  }
}

function addChoice(): void {
  const question = createChoice()
  expandedQuestionId.value = question.id
  questions.value.push(question)
  success.value = ''
}
function addMatching(): void {
  const question = createMatching()
  expandedQuestionId.value = question.id
  questions.value.push(question)
  success.value = ''
}
function copyQuestion(index: number): void {
  const source = questions.value[index]
  if (!source) return
  const copy = duplicateQuestion(source)
  expandedQuestionId.value = copy.id
  questions.value.splice(index + 1, 0, copy)
  success.value = ''
}
function moveQuestion(index: number, direction: -1 | 1): void {
  questions.value = move(questions.value, index, direction)
}
function removeQuestion(index: number): void {
  if (!window.confirm(t('editorRemoveConfirm'))) return
  questions.value.splice(index, 1)
  success.value = ''
}
async function save(): Promise<void> {
  if (busy.value || !test.value || test.value.status !== 'draft') return
  error.value = ''
  success.value = ''
  if (invalidMediaReference(questions.value)) {
    error.value = t('editorIncompleteMedia')
    return
  }
  busy.value = true
  try {
    // Detect another tab's already-committed edit before sending a whole
    // test-document PUT. This is a best-effort check, not true optimistic
    // concurrency control (explicitly outside the first PoC scope).
    const current = await fetch(api('admin/tests/' + encodeURIComponent(test.value.id)), {
      credentials: 'same-origin', cache: 'no-store',
    })
    if (!current.ok) throw new Error(t('editorLoadFailed'))
    const server = await current.json() as DraftTest
    if (server.status !== 'draft' || server.updatedAt !== test.value.updatedAt) {
      throw new Error(t('editorStaleTest'))
    }
    const response = await fetch(api('admin/tests/' + encodeURIComponent(test.value.id)), {
      method: 'PUT',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': csrfToken.value,
      },
      body: JSON.stringify({
        groupId: server.groupId,
        title: server.title,
        description: server.description,
        language: server.language,
        // The question editor must not overwrite this setting from the
        // metadata form while replacing the rest of the test document.
        showOverallScore: server.showOverallScore !== false,
        questions: questions.value,
      }),
    })
    if (!response.ok) {
      const result = await response.json().catch(() => ({})) as {
        error?: { code?: string }
      }
      throw new Error(t('editorSaveFailed') + ' (' + (result.error?.code ?? response.status) + ')')
    }
    const saved = await response.json() as DraftTest
    test.value = saved
    questions.value = structuredClone(saved.questions)
    originalQuestions.value = JSON.stringify(questions.value)
    success.value = t('editorSaved')
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : t('editorSaveFailed')
  } finally {
    busy.value = false
  }
}
async function unpublishAndEdit(): Promise<void> {
  if (!test.value || test.value.status !== 'published' || busy.value) return
  if (!window.confirm(t('publicationConfirmUnpublish', { title: test.value.title }))) return
  busy.value = true
  error.value = ''
  try {
    const response = await fetch(api('admin/tests/' + encodeURIComponent(test.value.id) + '/unpublish'), {
      method: 'POST', credentials: 'same-origin', cache: 'no-store',
      headers: { 'X-CSRF-Token': csrfToken.value },
    })
    if (!response.ok) throw new Error(t('publicationOperationFailed'))
    await load()
    success.value = t('publicationUnpublished')
  } catch {
    error.value = t('publicationOperationFailed')
  } finally {
    busy.value = false
  }
}
onMounted(() => {
  window.addEventListener('beforeunload', beforeUnload)
  void load()
})
</script>

<template>
  <section class="container-fluid py-3 questions-page">
    <RouterLink :to="{ name: 'admin' }" class="d-inline-block mb-3">{{ t('editorBack') }}</RouterLink>
    <h1 class="h3">{{ t('editorHeading') }}</h1>
    <p v-if="loading" role="status">{{ t('loading') }}</p>
    <p v-if="error" class="alert alert-danger" role="alert">{{ error }}</p>
    <p v-if="success" class="alert alert-success" role="status">{{ success }}</p>

    <template v-if="test && !loading">
      <h2 class="h4">{{ test.title }}</h2>
      <RouterLink v-if="test.status === 'published'" class="btn btn-outline-secondary mb-3"
        :to="{ name: 'test-preview', params: { id: test.id } }">
        <AppIcon name="eye" />{{ t('runnerPreviewButton') }}
      </RouterLink>
      <div v-if="test.status === 'published'" class="alert alert-warning d-flex flex-wrap gap-3 justify-content-between align-items-center">
        <span>{{ t('adminPublishedReadonly') }}</span>
        <button type="button" class="btn btn-outline-warning" :disabled="busy" @click="unpublishAndEdit">
          <AppIcon name="pencil-square" />{{ t('adminUnpublishEdit') }}
        </button>
      </div>
      <div v-if="test.status === 'published'" class="mt-3">
        <PublishedQuestionView v-for="(question, index) in test.questions" :key="question.id"
          :question="question" :index="index" />
      </div>
      <template v-else>
        <div class="editor-toolbar border rounded bg-body p-2 mb-3">
          <div class="d-flex flex-wrap gap-2 align-items-center">
            <button type="button" class="btn btn-outline-primary btn-sm" :disabled="busy"
              @click="addChoice"><AppIcon name="list-check" />{{ t('editorAddChoice') }}</button>
            <button type="button" class="btn btn-outline-primary btn-sm" :disabled="busy"
              @click="addMatching"><AppIcon name="arrow-left-right" />{{ t('editorAddMatching') }}</button>
            <div class="d-flex gap-2 ms-sm-auto">
              <RouterLink class="btn btn-outline-secondary btn-sm" :to="{ name: 'test-preview', params: { id: test.id } }"><AppIcon name="eye" />{{ t('runnerPreviewButton') }}</RouterLink>
              <button type="button" class="btn btn-primary btn-sm" :disabled="busy || !dirty"
                @click="save"><AppIcon name="floppy" />{{ busy ? t('editorSaving') : t('editorSave') }}</button>
            </div>
          </div>
          <p v-if="dirty" class="small text-warning-emphasis mt-2 mb-0" role="status">{{ t('editorUnsaved') }} {{ t('runnerSavedVersion') }}</p>
        </div>
        <p v-if="questions.length === 0" class="text-secondary">{{ t('editorNoQuestions') }}</p>
        <QuestionEditor v-for="(question, index) in questions" :key="question.id"
          :question="question" :index="index" :csrf-token="csrfToken" :group-id="test.groupId" :total="questions.length"
          :initially-expanded="index === 0 || question.id === expandedQuestionId"
          @remove="removeQuestion(index)" @move="moveQuestion(index, $event)" @duplicate="copyQuestion(index)" />
        <div class="card p-3 mt-3">
          <p class="fw-semibold mb-1">{{ t('editorReadiness') }}</p>
          <p v-if="problems.length === 0" class="text-success mb-1">{{ t('editorLooksComplete') }}</p>
          <ul v-else class="small mb-1">
            <li v-for="code in problems" :key="code">{{ t('editorProblem_' + code) }}</li>
          </ul>
          <p class="text-secondary small mb-0">{{ t('editorServerValidates') }}</p>
        </div>
        <div class="d-flex justify-content-end my-3">
          <button type="button" class="btn btn-primary" :disabled="busy || !dirty"
            @click="save"><AppIcon name="floppy" />{{ busy ? t('editorSaving') : t('editorSave') }}</button>
        </div>
      </template>
    </template>
  </section>
</template>

<style scoped>
.questions-page { max-width: 1100px; }
.editor-toolbar { position: sticky; top: .5rem; z-index: 25; box-shadow: 0 .2rem .5rem rgb(0 0 0 / .06); }
@media (max-width: 575px) {
  .editor-toolbar { position: static; }
}
</style>
