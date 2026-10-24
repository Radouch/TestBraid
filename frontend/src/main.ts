import { createApp } from 'vue'
import 'bootstrap/dist/css/bootstrap.min.css'
import './style.css'
import App from './App.vue'
import { router } from './router'
import { i18n } from './i18n'
import { mountAfterConfiguration } from './bootstrap'
import { loadSiteIdentity, localizeSiteText, siteIdentity } from './site-identity'
import { resolveUiLocale } from './ui-locale'

// Resolve public installation branding before rendering the application.
// This prevents a transient default "TestBraid" header on customized hosts.
void mountAfterConfiguration(loadSiteIdentity, () => {
  const requestedLanguage = new URLSearchParams(window.location.search).get('lang')
  const language = resolveUiLocale(requestedLanguage)
  document.title = localizeSiteText(siteIdentity.value.name, language) || 'TestBraid'
  document.documentElement.lang = language
  createApp(App).use(router).use(i18n).mount('#app')
})
