<script setup lang="ts">
import { appBaseUrl } from '../deployment-base'
import AppIcon from '../components/AppIcon.vue'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import { localizeSiteText, siteIdentity } from '../site-identity'
import {
  fetchPublicCatalog, publicLessonAnchor, publicLessonForHash, publicLessonHash,
  PUBLIC_CATALOG_ANCHOR, publicLessonsForLanguage, type PublicLesson,
} from '../public-catalog'

const { t, te, locale } = useI18n()
const route = useRoute()
const introduction = computed(() => localizeSiteText(siteIdentity.value.description, locale.value))
const groups = ref<PublicLesson[]>([])
const visibleGroups = computed(() => publicLessonsForLanguage(groups.value, locale.value))
const loading = ref(true)
const error = ref('')
let activeRequest: AbortController | undefined

function questionCountLabel(count: number): string {
  const category = new Intl.PluralRules(locale.value).select(count)
  const key = `publicCatalogQuestionCount_${category}`
  // A newly installed locale may not have every plural category translated.
  return t(te(key) ? key : 'publicCatalogQuestionCount_other', { count })
}

async function loadCatalog(): Promise<void> {
  activeRequest?.abort()
  const request = new AbortController()
  activeRequest = request
  loading.value = true
  error.value = ''
  try {
    const loaded = await fetchPublicCatalog(appBaseUrl(), request.signal)
    if (!request.signal.aborted) groups.value = loaded
  } catch {
    if (request.signal.aborted) return
    error.value = t('publicCatalogUnavailable')
    groups.value = []
  } finally {
    if (!request.signal.aborted) loading.value = false
  }
}

watch([loading, () => route.hash, visibleGroups], async ([pending]) => {
  const hash = route.hash
  if (pending || !hash) return
  const lesson = publicLessonForHash(visibleGroups.value, hash)
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
    <p v-else-if="visibleGroups.length === 0" class="text-secondary" role="status">
      {{ t('publicCatalogEmpty') }}
    </p>
    <div v-else class="d-grid gap-4">
      <section v-for="group in visibleGroups" :key="group.id" class="card public-lesson"
        :class="{ 'public-lesson-current': route.hash === publicLessonHash(group.id) }"
        :aria-labelledby="publicLessonAnchor(group.id)">
        <div class="card-body">
          <h2 :id="publicLessonAnchor(group.id)" class="h4 public-lesson-heading" tabindex="-1">{{ group.name }}</h2>
          <ul class="list-group list-group-flush">
            <li v-for="test in group.tests" :key="test.id" class="list-group-item public-test px-0">
              <div class="public-test-text">
                <span class="public-test-title" :lang="test.language">{{ test.title }}</span>
                <span class="small text-secondary">{{ questionCountLabel(test.questionCount) }}</span>
              </div>
              <!-- The only link per test. Every row says "Start test", so the hidden
                   title tells screen reader users which test each link starts. -->
              <RouterLink class="btn btn-primary public-test-start" :to="{ name: 'test', params: { id: test.id } }">
                {{ t('publicCatalogStart') }}<span class="visually-hidden">: <span :lang="test.language">{{ test.title }}</span></span>
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
.public-test { display: flex; align-items: center; justify-content: space-between; gap: .75rem 1.5rem; padding-block: 1rem; }
.public-test-text { display: flex; flex-direction: column; gap: .125rem; min-width: 0; }
.public-test-title { font-size: 1.125rem; font-weight: 600; }
.public-test-start { display: inline-flex; flex-shrink: 0; align-items: center; justify-content: center; min-height: 2.75rem; }
/* On phones every row stacks the same way, whatever the title length. */
@media (max-width: 575.98px) {
  .public-test { flex-direction: column; align-items: stretch; }
}
.public-lesson-heading, .public-catalog-heading { scroll-margin-block-start: 1.5rem; }
</style>
