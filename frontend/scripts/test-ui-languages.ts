import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { loadInterfaceTranslations, i18n, languageOptions } from '../src/i18n'
import { availableUiLanguages, explicitUiLocale, resolveUiLocale, setAvailableUiLanguages } from '../src/ui-locale'

const english = JSON.parse(readFileSync(new URL('../public/locales/en.json', import.meta.url), 'utf8')) as Record<string, string>
const czech = JSON.parse(readFileSync(new URL('../public/locales/cs.json', import.meta.url), 'utf8')) as Record<string, string>
assert.deepEqual(Object.keys(english).sort(), Object.keys(czech).sort(), 'Built-in translation keys must match.')

const responses: Record<string, Record<string, string>> = { en: english, cs: czech, de: { languageName: 'Deutsch', home: 'Startseite' } }
const previousFetch = globalThis.fetch
globalThis.fetch = (async (url: string) => {
  const match = url.match(/\/locales\/([a-z-]+)\.json$/)
  const data = match && responses[match[1]]
  return { ok: Boolean(data), json: async () => data } as Response
}) as typeof fetch
try {
  await loadInterfaceTranslations(['cs'], '/')
  assert.deepEqual(availableUiLanguages.value, ['cs'])
  assert.equal(languageOptions.value[0]?.label, 'Čeština')
  assert.equal(explicitUiLocale('en'), null)
  assert.equal(explicitUiLocale('cs'), 'cs')
  assert.equal(resolveUiLocale('cs'), 'cs')
  assert.equal((i18n.global.getLocaleMessage('en') as Record<string, unknown>).home, 'Tests', 'Hidden English remains fallback.')

  await loadInterfaceTranslations(['cs', 'de', 'missing'], '/')
  assert.deepEqual(availableUiLanguages.value, ['cs', 'de'])
  assert.equal(explicitUiLocale('de'), 'de')
  assert.equal(languageOptions.value[1]?.label, 'Deutsch')
  assert.equal((i18n.global.getLocaleMessage('de') as Record<string, unknown>).home, 'Startseite')
  assert.equal((i18n.global.getLocaleMessage('en') as Record<string, unknown>).home, 'Tests')
  setAvailableUiLanguages(['cs'])
  assert.equal(explicitUiLocale('de'), null)
} finally {
  globalThis.fetch = previousFetch
}
console.log('PASS: external JSON translations, installed-language allowlist and English fallback')
