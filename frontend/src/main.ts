import { appBaseUrl } from './deployment-base'
import { followSystemColorScheme } from './color-scheme'
import { createApp } from 'vue'
import 'bootstrap/dist/css/bootstrap.min.css'
// The theme overrides Bootstrap's colours, so it must load after Bootstrap.
import './theme.css'
import './style.css'
import App from './App.vue'
import { router } from './router'
import { i18n, loadInterfaceTranslations } from './i18n'
import { mountAfterConfiguration } from './bootstrap'
import { configuredUiLanguages, loadSiteIdentity, localizeSiteText, siteIdentity } from './site-identity'
import { resolveUiLocale } from './ui-locale'

// Pick the colour scheme first, so the page is already dark (for visitors with
// a dark setting) while the configuration below is loading.
followSystemColorScheme()

// Resolve public installation branding before rendering the application.
// This prevents a transient default "TestBraid" header on customized hosts.
void mountAfterConfiguration(async () => {
  await loadSiteIdentity()
  await loadInterfaceTranslations(configuredUiLanguages.value, appBaseUrl())
}, () => {
  const requestedLanguage = new URLSearchParams(window.location.search).get('lang')
  const language = resolveUiLocale(requestedLanguage)
  i18n.global.locale.value = language
  document.title = localizeSiteText(siteIdentity.value.name, language) || 'TestBraid'
  document.documentElement.lang = language
  createApp(App).use(router).use(i18n).mount('#app')
})
