import assert from 'node:assert/strict'
import { localizeSiteText, siteIdentity } from '../src/site-identity'
import { mountAfterConfiguration } from '../src/bootstrap'

// A localized name/title and introduction follow the selected UI language.
const name = { cs: 'Výuka znakového jazyka', en: 'Sign language lessons' }
const intro = { cs: 'Procvičování', en: 'Practice' }
assert.equal(localizeSiteText(name, 'cs'), 'Výuka znakového jazyka')
assert.equal(localizeSiteText(name, 'en'), 'Sign language lessons')
assert.equal(localizeSiteText(intro, 'cs'), 'Procvičování')
assert.equal(localizeSiteText(intro, 'en'), 'Practice')
assert.equal(localizeSiteText(name, 'en-GB'), 'Sign language lessons')

// Missing translation falls back to English, then Czech, then any first.
assert.equal(localizeSiteText({ en: 'English', pl: 'Polski' }, 'cs'), 'English')
assert.equal(localizeSiteText({ cs: 'Česky', pl: 'Polski' }, 'de'), 'Česky')
assert.equal(localizeSiteText({ de: 'Deutsch' }, 'fr'), 'Deutsch')

// Old installations can keep plain strings independent of the locale.
assert.equal(localizeSiteText('TestBraid', 'cs'), 'TestBraid')
assert.equal(localizeSiteText('TestBraid', 'en'), 'TestBraid')
assert.equal(localizeSiteText('', 'cs'), '')
assert.equal(localizeSiteText({ cs: '', en: 'Introduction' }, 'cs'), '')

// Reactive site identity is shared across App.vue and HomeView.vue.
siteIdentity.value = { name, description: intro }
assert.equal(localizeSiteText(siteIdentity.value.name, 'cs'), 'Výuka znakového jazyka')
assert.equal(localizeSiteText(siteIdentity.value.description, 'en'), 'Practice')

// Rendering must wait until the installation-specific name has loaded.
let releaseConfig: (() => void) | undefined
const pendingConfig = new Promise<void>((resolve) => { releaseConfig = resolve })
let rendered = false
const startup = mountAfterConfiguration(() => pendingConfig, () => { rendered = true })
assert.equal(rendered, false, 'App rendered before site configuration finished.')
releaseConfig?.()
await startup
assert.equal(rendered, true, 'App did not render after configuration loaded.')

// A failed configuration endpoint must not prevent the app from loading.
let fallbackRendered = false
await mountAfterConfiguration(
  async () => { throw new Error('Configuration endpoint unavailable') },
  () => { fallbackRendered = true },
)
assert.equal(fallbackRendered, true, 'App should render with defaults after a configuration failure.')

console.log('PASS: localized site branding, startup ordering and failure fallback')
