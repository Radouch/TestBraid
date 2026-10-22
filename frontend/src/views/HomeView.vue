<script setup lang="ts">
import AppIcon from '../components/AppIcon.vue'
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'

interface PublicTestSummary {
  id: string
  title: string
  language: string
}
interface PublicLesson {
  id: string
  name: string
  tests: PublicTestSummary[]
}

const { t } = useI18n()
const groups = ref<PublicLesson[]>([])
const loading = ref(true)
const error = ref('')

async function loadCatalog(): Promise<void> {
  loading.value = true
  error.value = ''
  try {
    // Do not send author session cookies for the public catalog. The PHP
    // endpoint is solely responsible for hiding draft tests and lessons.
    const response = await fetch(import.meta.env.BASE_URL + 'api/public/catalog', {
      credentials: 'omit',
      cache: 'no-store',
    })
    if (!response.ok) throw new Error(t('publicCatalogUnavailable'))
    const payload = await response.json() as { groups?: PublicLesson[] }
    if (!Array.isArray(payload.groups)) throw new Error(t('publicCatalogUnavailable'))
    groups.value = payload.groups
  } catch {
    error.value = t('publicCatalogUnavailable')
    groups.value = []
  } finally {
    loading.value = false
  }
}

onMounted(() => void loadCatalog())
</script>

<template>
  <section aria-labelledby="public-catalog-heading">
    <h1 id="public-catalog-heading" class="h2">{{ t('publicCatalogHeading') }}</h1>
    <p class="text-secondary">{{ t('publicCatalogIntroduction') }}</p>
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
      <section v-for="group in groups" :key="group.id" class="card"
        :aria-labelledby="'lesson-' + group.id">
        <div class="card-body">
          <h2 :id="'lesson-' + group.id" class="h4">{{ group.name }}</h2>
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
