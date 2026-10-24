<script setup lang="ts">
import AppIcon from '../components/AppIcon.vue'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import { localizeSiteText, siteIdentity } from '../site-identity'
import {
  fetchPublicCatalog, publicLessonAnchor, publicLessonForHash, publicLessonHash,
  PUBLIC_CATALOG_ANCHOR, type PublicLesson,
} from '../public-catalog'

const { t, locale } = useI18n()
const route = useRoute()
const introduction = computed(() => localizeSiteText(siteIdentity.value.description, locale.value))
const groups = ref<PublicLesson[]>([])
const loading = ref(true)
const error = ref('')
let activeRequest: AbortController | undefined

async function loadCatalog(): Promise<void> {
  activeRequest?.abort()
  const request = new AbortController()
  activeRequest = request
  loading.value = true
  error.value = ''
  try {
    const loaded = await fetchPublicCatalog(import.meta.env.BASE_URL, request.signal)
    if (!request.signal.aborted) groups.value = loaded
  } catch {
    if (request.signal.aborted) return
    error.value = t('publicCatalogUnavailable')
    groups.value = []
  } finally {
    if (!request.signal.aborted) loading.value = false
  }
}

watch([loading, () => route.hash], async ([pending]) => {
  const hash = route.hash
  if (pending || !hash) return
  const lesson = publicLessonForHash(groups.value, hash)
  // The destination does not exist until the asynchronous catalog is rendered.
  await nextTick()
  if (activeRequest?.signal.aborted || route.hash !== hash) return
  const heading = document.getElementById(lesson ? publicLessonAnchor(lesson.id) : PUBLIC_CATALOG_ANCHOR)
  heading?.scrollIntoView({ block: 'start' })
  heading?.focus({ preventScroll: true })
}, { flush: 'post' })

onMounted(() => void loadCatalog())
onBeforeUnmount(() => activeRequest?.abort())
</script>

<template>
  <section aria-labelledby="public-catalog-heading">
    <p v-if="introduction" class="lead text-secondary mb-4">{{ introduction }}</p>
    <h1 :id="PUBLIC_CATALOG_ANCHOR" class="h2 public-catalog-heading" tabindex="-1">{{ t('publicCatalogHeading') }}</h1>
    <p v-if="loading" role="status">{{ t('publicCatalogLoading') }}</p>
    <div v-else-if="error" class="alert alert-warning" role="alert">
      <p class="mb-2">{{ error }}</p>
      <button type="button" class="btn btn-outline-primary btn-sm" @click="loadCatalog">
        <AppIcon name="arrow-counterclockwise" />{{ t('publicCatalogRetry') }}
      </button>
    </div>
    <p v-else-if="groups.length === 0" class="text-secondary" role="status">
      {{ t('publicCatalogEmpty') }}
    </p>
    <div v-else class="d-grid gap-4">
      <section v-for="group in groups" :key="group.id" class="card public-lesson"
        :class="{ 'public-lesson-current': route.hash === publicLessonHash(group.id) }"
        :aria-labelledby="publicLessonAnchor(group.id)">
        <div class="card-body">
          <h2 :id="publicLessonAnchor(group.id)" class="h4 public-lesson-heading" tabindex="-1">{{ group.name }}</h2>
          <ul class="list-group list-group-flush">
            <li v-for="test in group.tests" :key="test.id"
              class="list-group-item d-flex flex-wrap justify-content-between align-items-center gap-2 px-0">
              <div>
                <RouterLink :to="{ name: 'test', params: { id: test.id } }"
                  class="fw-semibold" :lang="test.language">
                  {{ test.title }}
                </RouterLink>
                <span class="ms-2 small text-secondary">({{ test.language }})</span>
              </div>
              <RouterLink class="btn btn-outline-primary btn-sm"
                :to="{ name: 'test', params: { id: test.id } }">
                <AppIcon name="play-btn" />{{ t('publicCatalogStart') }}
              </RouterLink>
            </li>
          </ul>
        </div>
      </section>
    </div>
  </section>
</template>

<style scoped>
.public-lesson-current { border-color: var(--bs-primary-border-subtle); }
.public-lesson-heading, .public-catalog-heading { scroll-margin-block-start: 1.5rem; }
</style>
