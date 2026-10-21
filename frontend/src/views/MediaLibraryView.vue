<script setup lang="ts">
import { onMounted, ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import MediaUploader from '../components/MediaUploader.vue'
import { authorSession, refreshAuthorSession } from '../auth'

interface MediaItem {
  id: string
  kind: 'image' | 'video'
  originalName: string
  mimeType: string
  sizeBytes: number
  createdAt: string
  usedIn: Array<{ id: string; title: string; status: string }>
}
const { t } = useI18n()
const items = ref<MediaItem[]>([])
const loading = ref(true)
const error = ref('')
const filter = ref<'all' | 'image' | 'video'>('all')
const search = ref('')
const displayed = computed(() => items.value.filter(media =>
  (filter.value === 'all' || media.kind === filter.value)
  && media.originalName.toLocaleLowerCase().includes(search.value.toLocaleLowerCase())
))
function preview(id: string): string {
  return import.meta.env.BASE_URL + 'api/admin/media/' + encodeURIComponent(id) + '/preview'
}
async function load(): Promise<void> {
  loading.value = true
  error.value = ''
  try {
    const response = await fetch(import.meta.env.BASE_URL + 'api/admin/media', {
      credentials: 'same-origin', cache: 'no-store',
    })
    if (!response.ok) throw new Error(t('mediaLibraryUnavailable'))
    const data = await response.json() as { media: MediaItem[] }
    items.value = data.media
  } catch {
    error.value = t('mediaLibraryUnavailable')
  } finally {
    loading.value = false
  }
}
onMounted(async () => {
  await refreshAuthorSession()
  if (authorSession.value?.authenticated) await load()
  else loading.value = false
})
</script>

<template>
  <section aria-labelledby="media-library-heading">
    <h1 id="media-library-heading" class="h2">{{ t('mediaLibraryTitle') }}</h1>
    <p class="text-secondary">{{ t('mediaLibraryIntro') }}</p>
    <template v-if="!authorSession?.authenticated">
      <p>{{ t('editorSignInRequired') }}</p>
      <RouterLink to="/admin">{{ t('signIn') }}</RouterLink>
    </template>
    <template v-else>
      <section class="card p-3 mb-4">
        <h2 class="h5">{{ t('mediaUploadTitle') }}</h2>
        <MediaUploader :csrf-token="authorSession.csrfToken" @uploaded="load" />
      </section>
      <div class="d-flex flex-wrap gap-2 mb-3">
        <label class="visually-hidden" for="media-search">{{ t('mediaSearch') }}</label>
        <input id="media-search" v-model="search" type="search" class="form-control flex-grow-1"
          style="max-width: 22rem" :placeholder="t('mediaSearch')" />
        <label class="visually-hidden" for="media-filter">{{ t('mediaFilter') }}</label>
        <select id="media-filter" v-model="filter" class="form-select" style="max-width: 12rem">
          <option value="all">{{ t('mediaAll') }}</option>
          <option value="image">{{ t('mediaImages') }}</option>
          <option value="video">{{ t('mediaVideos') }}</option>
        </select>
      </div>
      <p v-if="error" role="alert" class="alert alert-danger">{{ error }}</p>
      <p v-if="loading" role="status">{{ t('loading') }}</p>
      <p v-else-if="displayed.length === 0" class="text-secondary">{{ t('mediaNoItems') }}</p>
      <div v-else class="row g-3">
        <div v-for="media in displayed" :key="media.id" class="col-sm-6 col-xl-4">
          <article class="card h-100">
            <img v-if="media.kind === 'image'" :src="preview(media.id)" :alt="media.originalName"
              class="card-img-top object-fit-contain" style="height: 180px" />
            <video v-else :src="preview(media.id)" controls preload="metadata"
              class="w-100" style="height: 180px" />
            <div class="card-body">
              <h3 class="h6 text-break">{{ media.originalName }}</h3>
              <p class="small text-secondary mb-1">{{ media.kind }} · {{ Math.round(media.sizeBytes / 1024) }} KiB</p>
              <details>
                <summary class="small">{{ t('mediaUsedIn', { count: media.usedIn.length }) }}</summary>
                <ul class="small mt-2">
                  <li v-for="test in media.usedIn" :key="test.id">
                    <RouterLink :to="{ name: 'test-questions', params: { id: test.id } }">
                      {{ test.title }}
                    </RouterLink>
                  </li>
                </ul>
              </details>
            </div>
          </article>
        </div>
      </div>
    </template>
  </section>
</template>
