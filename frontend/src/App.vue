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
const brandMarkUrl = `${import.meta.env.BASE_URL}testbraid-mark.svg`

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
  <div class="app-shell">
    <header class="app-header">
      <div class="container app-header-inner">
        <RouterLink to="/" class="app-brand text-decoration-none text-body fw-semibold">{{ siteName }}</RouterLink>
        <nav class="app-nav" aria-label="Main navigation">
          <RouterLink to="/" class="app-nav-link"
            :class="{ 'app-nav-link-active': activeSection === 'home' }"
            :aria-current="activeSection === 'home' ? 'location' : undefined">{{ t('home') }}</RouterLink>
          <RouterLink v-if="authorSession?.authenticated" to="/admin" class="app-nav-link"
            :class="{ 'app-nav-link-active': activeSection === 'admin' }"
            :aria-current="activeSection === 'admin' ? 'location' : undefined">{{ t('author') }}</RouterLink>
          <RouterLink v-if="authorSession?.authenticated" to="/admin/media" class="app-nav-link"
            :class="{ 'app-nav-link-active': activeSection === 'media' }"
            :aria-current="activeSection === 'media' ? 'location' : undefined">{{ t('mediaLibraryTitle') }}</RouterLink>
        </nav>
        <div v-if="availableUiLanguages.length > 1 || (authorSession?.authenticated && authorSession.user)"
          class="app-header-controls">
          <select v-if="availableUiLanguages.length > 1" class="form-select form-select-sm app-language-select" :value="locale"
            :aria-label="t('languageControl')" @change="selectLocale">
            <option v-for="language in languageOptions" :key="language.code"
              :value="language.code">{{ language.label }}</option>
          </select>
          <div v-if="authorSession?.authenticated && authorSession.user" class="app-account">
            <span class="small">{{ authorSession.user.username }}</span>
            <button type="button" class="btn btn-outline-secondary btn-sm" :disabled="signingOut" @click="signOut">
              {{ t('signOut') }}
            </button>
          </div>
        </div>
      </div>
    </header>
    <main class="container app-main">
      <p v-if="authError" class="alert alert-danger" role="alert">{{ authError }}</p>
      <RouterView />
    </main>
    <footer class="app-footer">
      <div class="container app-footer-inner">
        <span class="app-footer-branding">
          <a href="https://github.com/Radouch/TestBraid" target="_blank" rel="noopener noreferrer"
            class="d-inline-flex align-items-center gap-1">
            <img :src="brandMarkUrl" alt="" aria-hidden="true" width="16" height="16" />
            Powered by TestBraid
          </a>
          <span>{{ t('version') }} {{ appVersion }}</span>
        </span>
        <RouterLink v-if="sessionChecked" to="/admin">
          {{ authorSession?.authenticated ? t('author') : t('signIn') }}
        </RouterLink>
      </div>
    </footer>
  </div>
</template>
