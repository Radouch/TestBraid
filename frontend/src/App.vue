<script setup lang="ts">
import { appBaseUrl } from './deployment-base'
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter, RouterLink, RouterView } from 'vue-router'
import { authorSession, sessionChecked, refreshAuthorSession } from './auth'
import { availableUiLanguages, explicitUiLocale, resolveUiLocale, saveUiLocale } from './ui-locale'
import { languageOptions } from './i18n'
import { navigationSection } from './navigation'
import { APP_VERSION } from './version'
import { localizeSiteText, siteIdentity } from './site-identity'
import { STATIC_DEMO } from './static-demo'

const route = useRoute()
const router = useRouter()
const { locale, t } = useI18n()
const signingOut = ref(false)
const authError = ref('')
// No navigation item should appear active on an unknown route.
const activeSection = computed(() => route.name === 'not-found' ? null : navigationSection(route.path))
// Public pages (catalog, tests, not found) use a narrower reading column, and
// so does the author preview, which must show the test as learners see it.
// Other author pages keep the full container for their side-by-side panels.
const readingWidth = computed(() => navigationSection(route.path) === 'home' || route.name === 'test-preview')
const siteName = computed(() => localizeSiteText(siteIdentity.value.name, locale.value) || 'TestBraid')
const appVersion = APP_VERSION
const brandMarkUrl = `${appBaseUrl()}testbraid-mark.svg`
// The demo banner links to the README in the visitor's interface language.
const installGuideUrl = computed(() => locale.value === 'cs'
  ? 'https://github.com/Radouch/TestBraid/blob/main/README.cs.md'
  : 'https://github.com/Radouch/TestBraid#readme')

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
    const response = await fetch(appBaseUrl() + 'api/auth/logout', {
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
        <RouterLink to="/" class="app-brand text-decoration-none text-body fw-semibold">
          <img :src="brandMarkUrl" alt="" aria-hidden="true" width="28" height="28" class="app-brand-mark" />
          <span>{{ siteName }}</span>
        </RouterLink>
        <!-- Anonymous visitors would get a single "Tests" item, which only repeats
             the site name link, so the navigation is shown to authors only. -->
        <nav v-if="authorSession?.authenticated" class="app-nav" aria-label="Main navigation">
          <RouterLink to="/" class="app-nav-link"
            :class="{ 'app-nav-link-active': activeSection === 'home' }"
            :aria-current="activeSection === 'home' ? 'location' : undefined">{{ t('home') }}</RouterLink>
          <RouterLink to="/admin" class="app-nav-link"
            :class="{ 'app-nav-link-active': activeSection === 'admin' }"
            :aria-current="activeSection === 'admin' ? 'location' : undefined">{{ t('author') }}</RouterLink>
          <RouterLink to="/admin/media" class="app-nav-link"
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
    <main class="container app-main" :class="{ 'app-main-reading': readingWidth }">
      <p v-if="STATIC_DEMO" class="demo-banner">
        {{ t('demoBanner') }}
        <a :href="installGuideUrl" target="_blank" rel="noopener noreferrer">{{ t('demoBannerLink') }}</a>
      </p>
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
        <RouterLink v-if="sessionChecked && !STATIC_DEMO" to="/admin">
          {{ authorSession?.authenticated ? t('author') : t('signIn') }}
        </RouterLink>
      </div>
    </footer>
  </div>
</template>
