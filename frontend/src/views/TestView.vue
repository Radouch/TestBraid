<script setup lang="ts">
import { appBaseUrl } from '../deployment-base'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import AppIcon from '../components/AppIcon.vue'
import TestRunner from '../components/TestRunner.vue'
import type { DraftTest } from '../editor/model'
import { fetchPublicCatalog, publicCatalogLocation, publicLessonForTest, type PublicLesson } from '../public-catalog'
import { explicitUiLocale } from '../ui-locale'

const { t } = useI18n()
const route = useRoute()
const test = ref<DraftTest | null>(null)
const mediaUrls = ref<Record<string, string>>({})
const loading = ref(true)
const error = ref('')
const groups = ref<PublicLesson[]>([])
const lesson = computed(() => test.value ? publicLessonForTest(groups.value, test.value) : undefined)
const catalogLocation = computed(() => {
  const lang = explicitUiLocale(route.query.lang)
  return {
    ...publicCatalogLocation(test.value?.groupId),
    // Keep explicit language in the actual href as well as router navigation.
    ...(lang ? { query: { lang } } : {}),
  }
})
let activeRequest: AbortController | undefined

async function load(id: string): Promise<void> {
  activeRequest?.abort()
  const request = new AbortController()
  activeRequest = request
  loading.value = true
  error.value = ''
  test.value = null
  mediaUrls.value = {}
  groups.value = []
  // Lesson lookup is independent of test availability. A failed catalog must
  // not block a valid test or its return link, including on direct visits.
  void fetchPublicCatalog(appBaseUrl(), request.signal).then(loaded => {
    if (!request.signal.aborted) groups.value = loaded
  }).catch(() => { /* The test remains usable without optional lesson metadata. */ })
  try {
    // No session or author cookies are required. Drafts are inaccessible
    // through this endpoint, even if the viewer is also an author.
    const response = await fetch(appBaseUrl() + 'api/public/tests/' + encodeURIComponent(id), {
      credentials: 'omit', cache: 'no-store', signal: request.signal,
    })
    if (response.status === 404) throw new Error(t('runnerNotFound'))
    if (!response.ok) throw new Error(t('runnerPublicLoadError'))
    const payload = await response.json() as { test: DraftTest; mediaUrls: Record<string, string> }
    if (payload.test.status !== 'published') throw new Error(t('runnerNotFound'))
    if (request.signal.aborted) return
    test.value = payload.test
    mediaUrls.value = payload.mediaUrls
  } catch (reason) {
    if (request.signal.aborted) return
    error.value = reason instanceof Error ? reason.message : t('runnerPublicLoadError')
  } finally {
    if (!request.signal.aborted) loading.value = false
  }
}
watch(() => String(route.params.id ?? ''), id => void load(id), { immediate: true })
onBeforeUnmount(() => activeRequest?.abort())
</script>

<template>
  <section>
    <!-- The one way back sits above the test. It names the lesson once the
         catalog has loaded and falls back to a generic label otherwise. -->
    <nav :aria-label="t('runnerCatalogNavigation')" class="mb-3">
      <RouterLink :to="catalogLocation" class="d-inline-flex align-items-center gap-2">
        <AppIcon name="arrow-left" />{{ lesson ? lesson.name : t('runnerBackToCatalog') }}
      </RouterLink>
    </nav>
    <p v-if="loading" role="status">{{ t('loading') }}</p>
    <p v-if="error" role="alert" class="alert alert-warning">{{ error }}</p>
    <TestRunner v-if="test && !loading" :key="test.id" :test="test"
      :media-urls="mediaUrls">
      <template #results-actions>
        <RouterLink :to="catalogLocation" class="btn btn-outline-secondary">{{ t('runnerBackToCatalog') }}</RouterLink>
      </template>
    </TestRunner>
  </section>
</template>
