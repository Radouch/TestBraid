<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter, RouterLink, RouterView } from 'vue-router'
import { authorSession, sessionChecked, refreshAuthorSession } from './auth'
import { resolveUiLocale, saveUiLocale, type UiLocale } from './ui-locale'
import { navigationSection } from './navigation'

const route = useRoute()
const router = useRouter()
const { locale, t } = useI18n()
const signingOut = ref(false)
const authError = ref('')
const activeSection = computed(() => navigationSection(route.path))

watch(() => route.query.lang, (value) => {
  locale.value = resolveUiLocale(value)
}, { immediate: true })
watch(locale, (value) => {
  document.documentElement.lang = value
}, { immediate: true })

function selectLocale(event: Event): void {
  const value = (event.target as HTMLSelectElement).value
  if (value !== 'en' && value !== 'cs') return
  const chosen = value as UiLocale
  saveUiLocale(chosen)
  locale.value = chosen
  void router.replace({ query: { ...route.query, lang: chosen } })
}

async function signOut(): Promise<void> {
  if (signingOut.value || !authorSession.value?.csrfToken) return
  signingOut.value = true
  authError.value = ''
  try {
    const response = await fetch(import.meta.env.BASE_URL + 'api/auth/logout', {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { 'X-CSRF-Token': authorSession.value.csrfToken },
    })
    if (!response.ok) throw new Error('Logout failed')
    authorSession.value = await response.json()
  } catch {
    authError.value = t('sessionUnavailable')
    await refreshAuthorSession()
  } finally {
    signingOut.value = false
  }
}

onMounted(() => void refreshAuthorSession())
watch(() => route.path, () => void refreshAuthorSession())
</script>

<template>
  <div class="container py-4 d-flex flex-column min-vh-100">
    <header class="d-flex justify-content-between align-items-center flex-wrap gap-3 border-bottom pb-3 mb-4">
      <RouterLink to="/" class="fs-4 text-decoration-none text-body fw-semibold">{{ t('title') }}</RouterLink>
      <div class="d-flex align-items-center gap-3 flex-wrap">
        <nav class="d-flex gap-3" aria-label="Main navigation">
          <RouterLink to="/" class="text-decoration-none pb-1"
            :class="{ 'fw-semibold border-bottom border-2 border-primary': activeSection === 'home' }"
            :aria-current="activeSection === 'home' ? 'location' : undefined">{{ t('home') }}</RouterLink>
          <RouterLink v-if="authorSession?.authenticated" to="/admin" class="text-decoration-none pb-1"
            :class="{ 'fw-semibold border-bottom border-2 border-primary': activeSection === 'admin' }"
            :aria-current="activeSection === 'admin' ? 'location' : undefined">{{ t('author') }}</RouterLink>
          <RouterLink v-if="authorSession?.authenticated" to="/admin/media" class="text-decoration-none pb-1"
            :class="{ 'fw-semibold border-bottom border-2 border-primary': activeSection === 'media' }"
            :aria-current="activeSection === 'media' ? 'location' : undefined">{{ t('mediaLibraryTitle') }}</RouterLink>
        </nav>
        <select class="form-select form-select-sm" style="width: auto" :value="locale"
          :aria-label="t('languageControl')" @change="selectLocale">
          <option value="en">English</option>
          <option value="cs">Čeština</option>
        </select>
        <div v-if="authorSession?.authenticated && authorSession.user" class="d-flex align-items-center gap-2">
          <span class="small">{{ authorSession.user.username }}</span>
          <button type="button" class="btn btn-outline-secondary btn-sm" :disabled="signingOut" @click="signOut">
            {{ t('signOut') }}
          </button>
        </div>
      </div>
    </header>
    <p v-if="authError" class="alert alert-danger" role="alert">{{ authError }}</p>
    <main class="flex-grow-1"><RouterView /></main>
    <footer class="border-top mt-4 pt-3 text-end">
      <RouterLink v-if="sessionChecked && !authorSession?.authenticated" to="/admin">
        {{ t('signIn') }}
      </RouterLink>
    </footer>
  </div>
</template>
