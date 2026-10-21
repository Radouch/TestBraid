<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import MediaUploader, { type UploadedMedia } from '../components/MediaUploader.vue'
import AdminCatalog from '../components/AdminCatalog.vue'

interface Author {
  id: string
  username: string
}
interface Session {
  authenticated: boolean
  csrfToken: string
  setupState?: 'ready' | 'needs-key' | 'complete'
  user?: Author
}
interface ApiError {
  error?: { code?: string; message?: string }
}

const { t } = useI18n()
const session = ref<Session | null>(null)
const username = ref('')
const password = ref('')
const setupKey = ref('')
const loading = ref(true)
const busy = ref(false)
const error = ref('')
const uploadedMedia = ref<UploadedMedia[]>([])

function recordUpload(media: UploadedMedia): void {
  uploadedMedia.value.unshift(media)
}

const api = (route: string): string => `${import.meta.env.BASE_URL}api/${route}`

async function readSession(): Promise<void> {
  loading.value = true
  error.value = ''
  try {
    const response = await fetch(api('auth/session'), {
      credentials: 'same-origin',
      cache: 'no-store',
    })
    if (!response.ok) throw new Error('HTTP')
    session.value = await response.json() as Session
  } catch {
    error.value = t('sessionUnavailable')
  } finally {
    loading.value = false
  }
}

async function mutate(route: string, body?: unknown): Promise<Session | null> {
  const token = session.value?.csrfToken
  if (!token) {
    error.value = t('sessionUnavailable')
    return null
  }
  try {
    const response = await fetch(api(route), {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: {
        'X-CSRF-Token': token,
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
    const data = await response.json() as Session & ApiError
    if (!response.ok) {
      const code = data.error?.code
      error.value = code === 'RATE_LIMITED' ? t('tooManyAttempts')
        : code === 'INVALID_SETUP_KEY' ? t('invalidSetupKey')
        : code === 'SETUP_COMPLETE' ? t('setupAlreadyCompleted')
        : code === 'SETUP_NOT_ENABLED' ? t('setupNotEnabled')
        : t('authFailed')
      return null
    }
    return data
  } catch {
    error.value = t('sessionUnavailable')
    return null
  }
}

async function signIn(): Promise<void> {
  if (busy.value) return
  busy.value = true
  error.value = ''
  try {
    const data = await mutate('auth/login', { username: username.value, password: password.value })
    if (data) {
      session.value = data
      // Do not retain the entered password after a successful login.
      password.value = ''
    }
  } finally {
    busy.value = false
  }
}

async function createFirstAuthor(): Promise<void> {
  if (busy.value) return
  busy.value = true
  error.value = ''
  try {
    const data = await mutate('auth/setup', {
      username: username.value,
      password: password.value,
      setupKey: setupKey.value,
    })
    if (data) {
      session.value = data
      password.value = ''
      setupKey.value = ''
    }
  } finally {
    busy.value = false
  }
}

async function signOut(): Promise<void> {
  if (busy.value) return
  busy.value = true
  error.value = ''
  try {
    const data = await mutate('auth/logout')
    if (data) {
      session.value = data
      uploadedMedia.value = []
    }
  } finally {
    busy.value = false
  }
}

onMounted(() => void readSession())
</script>

<template>
  <section class="col-lg-6">
    <h1 class="h2">{{ t('author') }}</h1>
    <p v-if="loading" role="status">{{ t('loading') }}</p>
    <p v-if="error" class="alert alert-danger" role="alert">{{ error }}</p>

    <template v-if="!loading && session">
      <template v-if="session.authenticated && session.user">
        <p>{{ t('signedInAs', { username: session.user.username }) }}</p>
        <p>{{ t('adminPlaceholder') }}</p>
        <AdminCatalog :csrf-token="session.csrfToken" />
        <section class="my-4" aria-labelledby="media-heading">
          <h2 id="media-heading" class="h4">{{ t('mediaUploadTitle') }}</h2>
          <MediaUploader :csrf-token="session.csrfToken" @uploaded="recordUpload" />
          <div v-for="media in uploadedMedia" :key="media.mediaId" class="card my-3 p-3">
            <strong>{{ media.originalName }}</strong>
            <code class="d-block mb-2">{{ media.mediaId }}</code>
            <img v-if="media.kind === 'image'" class="img-fluid" style="max-height: 320px; object-fit: contain"
              :src="api(`admin/media/${media.mediaId}/preview`)" :alt="media.originalName" />
            <video v-else controls preload="metadata" class="w-100" style="max-height: 320px"
              :src="api(`admin/media/${media.mediaId}/preview`)">
              {{ t('videoUnsupported') }}
            </video>
          </div>
        </section>
        <button class="btn btn-outline-secondary" type="button" :disabled="busy" @click="signOut">
          {{ t('signOut') }}
        </button>
      </template>
      <form v-else-if="session.setupState === 'ready'" class="d-grid gap-3" @submit.prevent="createFirstAuthor">
        <p>{{ t('setupIntroduction') }}</p>
        <div>
          <label class="form-label" for="setup-username">{{ t('username') }}</label>
          <input id="setup-username" v-model="username" class="form-control" autocomplete="username"
            required maxlength="64" />
        </div>
        <div>
          <label class="form-label" for="setup-password">{{ t('password') }}</label>
          <input id="setup-password" v-model="password" class="form-control" type="password"
            autocomplete="new-password" required minlength="12" />
        </div>
        <div>
          <label class="form-label" for="setup-key">{{ t('setupKey') }}</label>
          <input id="setup-key" v-model="setupKey" class="form-control" type="password"
            autocomplete="off" required minlength="32" maxlength="256" />
        </div>
        <button class="btn btn-primary" type="submit" :disabled="busy">{{ t('createFirstAuthor') }}</button>
      </form>
      <div v-else-if="session.setupState === 'needs-key'">
        <p>{{ t('setupNeedsKey') }}</p>
        <button type="button" class="btn btn-outline-secondary" @click="readSession">
          {{ t('refreshSetup') }}
        </button>
      </div>
      <form v-else class="d-grid gap-3" @submit.prevent="signIn">
        <div>
          <label class="form-label" for="username">{{ t('username') }}</label>
          <input id="username" v-model="username" class="form-control" name="username"
            autocomplete="username" required maxlength="64" />
        </div>
        <div>
          <label class="form-label" for="password">{{ t('password') }}</label>
          <input id="password" v-model="password" class="form-control" type="password"
            name="password" autocomplete="current-password" required />
        </div>
        <button class="btn btn-primary" type="submit" :disabled="busy">{{ t('signIn') }}</button>
      </form>
    </template>
  </section>
</template>
