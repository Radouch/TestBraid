<script setup lang="ts">
import { ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import TestRunner from '../components/TestRunner.vue'
import type { DraftTest } from '../editor/model'

const { t } = useI18n()
const route = useRoute()
const test = ref<DraftTest | null>(null)
const mediaUrls = ref<Record<string, string>>({})
const loading = ref(true)
const error = ref('')

async function load(id: string): Promise<void> {
  loading.value = true
  error.value = ''
  test.value = null
  mediaUrls.value = {}
  try {
    // No session or author cookies are required. Drafts are inaccessible
    // through this endpoint, even if the viewer is also an author.
    const response = await fetch(import.meta.env.BASE_URL + 'api/public/tests/' + encodeURIComponent(id), {
      credentials: 'omit', cache: 'no-store',
    })
    if (response.status === 404) throw new Error(t('runnerNotFound'))
    if (!response.ok) throw new Error(t('runnerPublicLoadError'))
    const payload = await response.json() as { test: DraftTest; mediaUrls: Record<string, string> }
    if (payload.test.status !== 'published') throw new Error(t('runnerNotFound'))
    test.value = payload.test
    mediaUrls.value = payload.mediaUrls
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : t('runnerPublicLoadError')
  } finally {
    loading.value = false
  }
}
watch(() => String(route.params.id ?? ''), id => void load(id), { immediate: true })
</script>

<template>
  <section>
    <p v-if="loading" role="status">{{ t('loading') }}</p>
    <p v-if="error" role="alert" class="alert alert-warning">{{ error }}</p>
    <TestRunner v-if="test && !loading" :key="test.id" :test="test"
      :media-urls="mediaUrls" />
  </section>
</template>
