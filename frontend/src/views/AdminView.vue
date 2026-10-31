<script setup lang="ts">
import { appBaseUrl } from '../deployment-base'
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import AdminCatalog from '../components/AdminCatalog.vue'
import SecurityDiagnostics from '../components/SecurityDiagnostics.vue'
import { authorSession, refreshAuthorSession, USERNAME_PATTERN } from '../auth'

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
const session = authorSession
const username = ref('')
const password = ref('')
const setupKey = ref('')
const loading = ref(true)
const busy = ref(false)
const error = ref('')
const api = (route: string): string => `${appBaseUrl()}api/${route}`
// Flag a bad username as soon as something is typed, not while it is empty.
const usernameInvalid = computed(() => username.value !== '' && !USERNAME_PATTERN.test(username.value))

async function readSession(): Promise<void> {
  loading.value = true
  error.value = ''
  // Join the app-wide session read instead of starting a parallel one.
  await refreshAuthorSession()
  if (!session.value) error.value = t('sessionUnavailable')
  loading.value = false
}

async function mutate(route: string, body?: unknown, retry = true): Promise<Session | null> {
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
      // A token from another or an expired session: read the session again
      // (its cookie is settled by now) and send the request once more.
      if (code === 'INVALID_CSRF' && retry) {
        await refreshAuthorSession()
        return mutate(route, body, false)
      }
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
  if (usernameInvalid.value) {
    document.getElementById('setup-username')?.focus()
    return
  }
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

onMounted(() => void readSession())
</script>

<template>
  <section >
    <h1 class="h2">{{ t('author') }}</h1>
    <p v-if="loading" role="status">{{ t('loading') }}</p>
    <p v-if="error" class="alert alert-danger" role="alert">{{ error }}</p>

    <template v-if="!loading && session">
      <template v-if="session.authenticated && session.user">
        <AdminCatalog :csrf-token="session.csrfToken" />
        <SecurityDiagnostics />
</template>
      <form v-else-if="session.setupState === 'ready'" class="d-grid gap-3" @submit.prevent="createFirstAuthor">
        <p>{{ t('setupIntroduction') }}</p>
        <div>
          <label class="form-label" for="setup-username">{{ t('username') }}</label>
          <input id="setup-username" v-model="username" class="form-control" autocomplete="username"
            required maxlength="64" :class="{ 'is-invalid': usernameInvalid }" :aria-invalid="usernameInvalid"
            aria-describedby="setup-username-help" />
          <p v-if="usernameInvalid" id="setup-username-help" class="invalid-feedback mb-0">{{ t('usernameInvalid') }}</p>
          <p v-else id="setup-username-help" class="form-text mb-0">{{ t('usernameRules') }}</p>
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
