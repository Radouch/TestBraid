<script setup lang="ts">
import { ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import TestRunner from '../components/TestRunner.vue'
import type { DraftTest } from '../editor/model'
import { publicationProblems } from '../editor/model'

const route = useRoute()
const { t } = useI18n()
const test = ref<DraftTest | null>(null)
const loading = ref(true)
const error = ref('')
const warnings = ref<string[]>([])

async function loadTest(id: string): Promise<void> {
  loading.value = true
  error.value = ''
  test.value = null
  try {
    const sessionResponse = await fetch(import.meta.env.BASE_URL + 'api/auth/session', {
      credentials: 'same-origin', cache: 'no-store',
    })
    if (!sessionResponse.ok) throw new Error(t('runnerPreviewSignIn'))
    const session = await sessionResponse.json() as { authenticated?: boolean }
    if (!session.authenticated) throw new Error(t('runnerPreviewSignIn'))

    // The private draft JSON stays protected by the existing author middleware.
    // In particular, this route does not publish media or use the public API.
    const response = await fetch(import.meta.env.BASE_URL + 'api/admin/tests/' + encodeURIComponent(id), {
      credentials: 'same-origin', cache: 'no-store',
    })
    if (response.status === 404) throw new Error(t('runnerNotFound'))
    if (!response.ok) throw new Error(t('runnerPreviewLoadError'))
    const value = await response.json() as DraftTest
    test.value = value
    warnings.value = publicationProblems(value.questions)
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : t('runnerPreviewLoadError')
  } finally {
    loading.value = false
  }
}
watch(() => String(route.params.id ?? ''), id => void loadTest(id), { immediate: true })
</script>

<template>
  <section>
    <RouterLink :to="{ name: 'admin' }" class="d-inline-block mb-3">{{ t('editorBack') }}</RouterLink>
    <p v-if="loading" role="status">{{ t('loading') }}</p>
    <p v-if="error" class="alert alert-danger" role="alert">{{ error }}</p>
    <template v-if="test && !loading">
      <div class="d-flex flex-wrap gap-2 align-items-center mb-3">
        <h2 class="h4 mb-0">{{ t('runnerPreviewHeading') }}</h2>
        <RouterLink v-if="test.status === 'draft'" class="btn btn-outline-primary ms-auto"
          :to="{ name: 'test-questions', params: { id: test.id } }">
          {{ t('editorOpen') }}
        </RouterLink>
      </div>
      <p class="text-secondary small">{{ t('runnerSavedVersion') }}</p>
      <div v-if="warnings.length" class="alert alert-warning">
        <p class="mb-1">{{ t('runnerDraftIncomplete') }}</p>
        <ul class="mb-0">
          <li v-for="key in warnings" :key="key">{{ t('editorProblem_' + key) }}</li>
        </ul>
      </div>
      <TestRunner :key="test.id" :test="test" private-preview />
    </template>
  </section>
</template>
