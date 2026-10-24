<script setup lang="ts">
import { onMounted, ref, computed, watch } from 'vue'
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
  groupId: string | null
  usedIn: Array<{ id: string; title: string; status: string }>
}
const { t } = useI18n()
const items = ref<MediaItem[]>([])
const lessons = ref<Array<{ id: string; name: string }>>([])
const loading = ref(true)
const error = ref('')
const deleteError = ref('')
const assignError = ref('')
const assigningId = ref<string | null>(null)
const lessonFilter = ref('__all__')
const uploadLesson = ref('__unassigned__')
const deletingId = ref<string | null>(null)
const filter = ref<'all' | 'image' | 'video'>('all')
const search = ref('')
const displayed = computed(() => items.value.filter(media =>
  (lessonFilter.value === '__all__' || (lessonFilter.value === '__unassigned__' ? !media.groupId : media.groupId === lessonFilter.value))
  && (filter.value === 'all' || media.kind === filter.value)
  && media.originalName.toLocaleLowerCase().includes(search.value.toLocaleLowerCase())
))
watch(lessonFilter, selected => {
  uploadLesson.value = selected === '__all__' ? '__unassigned__' : selected
})
function preview(id: string): string {
  return import.meta.env.BASE_URL + 'api/admin/media/' + encodeURIComponent(id) + '/preview'
}
async function load(): Promise<void> {
  loading.value = true
  error.value = ''
  try {
    const [response, groupsResponse] = await Promise.all([
      fetch(import.meta.env.BASE_URL + 'api/admin/media', { credentials: 'same-origin', cache: 'no-store' }),
      fetch(import.meta.env.BASE_URL + 'api/admin/groups', { credentials: 'same-origin', cache: 'no-store' }),
    ])
    if (!response.ok || !groupsResponse.ok) throw new Error(t('mediaLibraryUnavailable'))
    const data = await response.json() as { media: MediaItem[] }
    const groups = await groupsResponse.json() as { groups: Array<{ id: string; name: string }> }
    items.value = data.media
    lessons.value = groups.groups
  } catch {
    error.value = t('mediaLibraryUnavailable')
  } finally {
    loading.value = false
  }
}
async function setLesson(media: MediaItem, selected: string): Promise<void> {
  if (!authorSession.value?.authenticated || assigningId.value) return
  assigningId.value = media.id
  assignError.value = ''
  const previous = media.groupId
  // Keep the select controlled while the request is pending, then roll back on failure.
  media.groupId = selected === '__unassigned__' ? null : selected
  try {
    const response = await fetch(import.meta.env.BASE_URL + 'api/admin/media/' + encodeURIComponent(media.id), {
      method: 'PATCH',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': authorSession.value.csrfToken },
      body: JSON.stringify({ groupId: selected === '__unassigned__' ? null : selected }),
    })
    if (!response.ok) throw new Error(t('mediaAssignFailed'))
    const updated = await response.json() as MediaItem
    media.groupId = updated.groupId
  } catch {
    media.groupId = previous
    assignError.value = t('mediaAssignFailed')
  } finally {
    assigningId.value = null
  }
}
async function deleteMedia(media: MediaItem): Promise<void> {
  if (media.usedIn.length || !authorSession.value?.authenticated || deletingId.value) return
  if (!window.confirm(t('mediaDeleteConfirm', { name: media.originalName }))) return
  deletingId.value = media.id
  deleteError.value = ''
  try {
    const response = await fetch(import.meta.env.BASE_URL + 'api/admin/media/' + encodeURIComponent(media.id), {
      method: 'DELETE',
      credentials: 'same-origin',
      headers: { 'X-CSRF-Token': authorSession.value.csrfToken },
    })
    if (!response.ok) {
      const data = await response.json().catch(() => null) as { error?: { code?: string } } | null
      if (response.status === 409 || data?.error?.code === 'MEDIA_IN_USE') {
        throw new Error(t('mediaDeleteInUse'))
      }
      throw new Error(t('mediaDeleteFailed'))
    }
    await load()
  } catch (cause) {
    deleteError.value = cause instanceof Error ? cause.message : t('mediaDeleteFailed')
    // A concurrent author may have referenced or removed this file.
    await load()
  } finally {
    deletingId.value = null
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
        <div class="mb-3">
          <label for="media-upload-lesson" class="form-label">{{ t('mediaHomeLesson') }}</label>
          <select id="media-upload-lesson" v-model="uploadLesson" class="form-select" style="max-width: 23rem">
            <option value="__unassigned__">{{ t('mediaUnassigned') }}</option>
            <option v-for="lesson in lessons" :key="lesson.id" :value="lesson.id">{{ lesson.name }}</option>
          </select>
        </div>
        <MediaUploader :csrf-token="authorSession.csrfToken"
          :group-id="uploadLesson === '__unassigned__' ? null : uploadLesson" @uploaded="load" />
      </section>
      <div class="d-flex flex-wrap gap-2 mb-3">
        <label class="visually-hidden" for="media-lesson-filter">{{ t('mediaHomeLesson') }}</label>
        <select id="media-lesson-filter" v-model="lessonFilter" class="form-select" style="max-width: 20rem">
          <option value="__all__">{{ t('mediaAllLessons') }}</option>
          <option v-for="lesson in lessons" :key="lesson.id" :value="lesson.id">{{ lesson.name }}</option>
          <option value="__unassigned__">{{ t('mediaUnassigned') }}</option>
        </select>
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
      <p v-if="deleteError" role="alert" class="alert alert-danger">{{ deleteError }}</p>
      <p v-if="assignError" role="alert" class="alert alert-danger">{{ assignError }}</p>
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
              <label :for="'media-lesson-' + media.id" class="form-label small mb-1">{{ t('mediaHomeLesson') }}</label>
              <select :id="'media-lesson-' + media.id" class="form-select form-select-sm mb-2"
                :value="media.groupId ?? '__unassigned__'" :disabled="assigningId !== null"
                @change="setLesson(media, ($event.target as HTMLSelectElement).value)">
                <option value="__unassigned__">{{ t('mediaUnassigned') }}</option>
                <option v-for="lesson in lessons" :key="lesson.id" :value="lesson.id">{{ lesson.name }}</option>
              </select>
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
              <button v-if="media.usedIn.length === 0" type="button"
                class="btn btn-outline-danger btn-sm mt-3"
                :disabled="deletingId !== null"
                @click="deleteMedia(media)">
                {{ t('mediaDelete') }}
              </button>
            </div>
          </article>
        </div>
      </div>
    </template>
  </section>
</template>
