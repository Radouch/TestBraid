<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter, RouterLink, RouterView } from 'vue-router'
import { authorSession, sessionChecked, refreshAuthorSession } from './auth'
import { availableUiLanguages, explicitUiLocale, resolveUiLocale, saveUiLocale } from './ui-locale'
import { languageOptions } from './i18n'
import { navigationSection } from './navigation'
import { APP_VERSION } from './version'
import { localizeSiteText, siteIdentity } from './site-identity'

const route = useRoute()
const router = useRouter()
const { locale, t } = useI18n()
const signingOut = ref(false)
const authError = ref('')
// No navigation item should appear active on an unknown route.
const activeSection = computed(() => route.name === 'not-found' ? null : navigationSection(route.path))
const siteName = computed(() => localizeSiteText(siteIdentity.value.name, locale.value) || 'TestBraid')
const appVersion = APP_VERSION

watch([siteName, locale, () => route.name], ([name, , page]) => {
  document.title = page === 'not-found' ? `${t('notFoundTitle')} | ${name}` : name
}, { immediate: true })

watch(() => route.query.lang, (value) => {
  locale.value = resolveUiLocale(value)
}, { immediate: true })
watch(locale, (value) => {
  document.documentElement.lang = value
}, { immediate: true })

function selectLocale(event: Event): void {
  const value = (event.target as HTMLSelectElement).value
  const chosen = explicitUiLocale(value)
  if (!chosen) return
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
      <RouterLink to="/" class="fs-4 text-decoration-none text-body fw-semibold">{{ siteName }}</RouterLink>
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
        <select v-if="availableUiLanguages.length > 1" class="form-select form-select-sm" style="width: auto" :value="locale"
          :aria-label="t('languageControl')" @change="selectLocale">
          <option v-for="language in languageOptions" :key="language.code"
            :value="language.code">{{ language.label }}</option>
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
    <footer class="border-top mt-4 pt-3 d-flex justify-content-between align-items-center flex-wrap gap-2 small text-secondary">
      <span><a href="https://github.com/Radouch/TestBraid" target="_blank" rel="noopener noreferrer">Powered by TestBraid</a> · {{ t('version') }} {{ appVersion }}</span>
      <RouterLink v-if="sessionChecked" to="/admin">
        {{ authorSession?.authenticated ? t('author') : t('signIn') }}
      </RouterLink>
    </footer>
  </div>
</template>
