<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'

interface Author {
  id: string
  username: string
}
interface Session {
  authenticated: boolean
  csrfToken: string
  user?: Author
}
interface ApiError {
  error?: { code?: string; message?: string }
}

const { t } = useI18n()
const session = ref<Session | null>(null)
const username = ref('')
const password = ref('')
const loading = ref(true)
const busy = ref(false)
const error = ref('')

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
      error.value = data.error?.code === 'RATE_LIMITED' ? t('tooManyAttempts') : t('authFailed')
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

async function signOut(): Promise<void> {
  if (busy.value) return
  busy.value = true
  error.value = ''
  try {
    const data = await mutate('auth/logout')
    if (data) session.value = data
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
        <button class="btn btn-outline-secondary" type="button" :disabled="busy" @click="signOut">
          {{ t('signOut') }}
        </button>
      </template>
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
