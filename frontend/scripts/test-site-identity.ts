import assert from 'node:assert/strict'
import { localizeSiteText, siteIdentity } from '../src/site-identity'

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

console.log('PASS: localized site title, home introduction and fallback behavior')
