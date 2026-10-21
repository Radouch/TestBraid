<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { onBeforeRouteLeave, useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import QuestionEditor from '../components/QuestionEditor.vue'
import {
  createChoice, createMatching, invalidMediaReference, move, publicationProblems,
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
  questions.value.push(createChoice())
  success.value = ''
}
function addMatching(): void {
  questions.value.push(createMatching())
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
onMounted(() => {
  window.addEventListener('beforeunload', beforeUnload)
  void load()
})
</script>

<template>
  <section class="container-fluid py-3">
    <RouterLink :to="{ name: 'admin' }" class="d-inline-block mb-3">{{ t('editorBack') }}</RouterLink>
    <h1 class="h3">{{ t('editorHeading') }}</h1>
    <p v-if="loading" role="status">{{ t('loading') }}</p>
    <p v-if="error" class="alert alert-danger" role="alert">{{ error }}</p>
    <p v-if="success" class="alert alert-success" role="status">{{ success }}</p>

    <template v-if="test && !loading">
      <h2 class="h4">{{ test.title }}</h2>
      <p class="small text-secondary">{{ t('editorTestId') }}: {{ test.id }}</p>
      <p v-if="test.status === 'published'" class="alert alert-warning">
        {{ t('editorPublishedLocked') }}
      </p>
      <template v-else>
        <div class="d-flex flex-wrap gap-2 align-items-center mb-3">
          <button type="button" class="btn btn-outline-primary" :disabled="busy"
            @click="addChoice">{{ t('editorAddChoice') }}</button>
          <button type="button" class="btn btn-outline-primary" :disabled="busy"
            @click="addMatching">{{ t('editorAddMatching') }}</button>
          <button type="button" class="btn btn-primary ms-auto" :disabled="busy || !dirty"
            @click="save">{{ busy ? t('editorSaving') : t('editorSave') }}</button>
        </div>
        <p v-if="dirty" class="text-warning-emphasis" role="status">{{ t('editorUnsaved') }}</p>
        <p v-if="questions.length === 0" class="text-secondary">{{ t('editorNoQuestions') }}</p>
        <QuestionEditor v-for="(question, index) in questions" :key="question.id"
          :question="question" :index="index" :csrf-token="csrfToken"
          @remove="removeQuestion(index)" @move="moveQuestion(index, $event)" />
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
            @click="save">{{ busy ? t('editorSaving') : t('editorSave') }}</button>
        </div>
      </template>
    </template>
  </section>
</template>
