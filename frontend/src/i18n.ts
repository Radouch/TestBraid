import { ref } from 'vue'
import { createI18n } from 'vue-i18n'
import { setAvailableUiLanguages, type UiLocale } from './ui-locale'

export interface LanguageOption {
  code: UiLocale
  label: string
}

/** Locale files live in public/locales/, outside the JavaScript bundle. */
export const i18n = createI18n({
  legacy: false,
  locale: 'en',
  fallbackLocale: 'en',
  messages: {},
  missingWarn: false,
  fallbackWarn: false,
})

export const languageOptions = ref<LanguageOption[]>([])
const CODE_PATTERN = /^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/

export function isValidUiLanguageCode(code: unknown): code is string {
  return typeof code === 'string' && CODE_PATTERN.test(code)
}

function nativeLanguageName(code: string): string {
  try {
    return new Intl.DisplayNames([code], { type: 'language' }).of(code) || code
  } catch {
    return code
  }
}

async function fetchMessages(code: string, basePath: string): Promise<Record<string, string> | null> {
  if (!isValidUiLanguageCode(code)) return null
  try {
    const response = await fetch(basePath + 'locales/' + encodeURIComponent(code) + '.json', {
      credentials: 'omit',
      cache: 'no-store',
    })
    if (!response.ok) return null
    const data: unknown = await response.json()
    if (data === null || typeof data !== 'object' || Array.isArray(data)) return null
    if (!Object.values(data).every(value => typeof value === 'string')) return null
    return data as Record<string, string>
  } catch {
    return null
  }
}

/**
 * Load English fallback even when an installation only offers Czech.
 * Disabled languages are never added to the interface language selector.
 * Adding a locales/<code>.json and enabling it in app.json needs no rebuild.
 */
export async function loadInterfaceTranslations(configured: string[], basePath: string): Promise<void> {
  const codes = [...new Set(configured.filter(isValidUiLanguageCode))]
  const toFetch = [...new Set(['en', ...codes])]
  const results = await Promise.all(toFetch.map(async code => [code, await fetchMessages(code, basePath)] as const))
  const messages = new Map(results)
  for (const [code, translations] of results) {
    if (translations) i18n.global.setLocaleMessage(code, translations)
  }

  let offered = codes.filter(code => messages.get(code) !== null)
  // Keep an English recovery path if all configured translation files fail.
  if (offered.length === 0 && messages.get('en')) offered = ['en']
  setAvailableUiLanguages(offered)
  i18n.global.fallbackLocale.value = messages.get('en') ? 'en' : (offered[0] ?? 'en')
  languageOptions.value = offered.map(code => ({
    code,
    label: messages.get(code)?.languageName || nativeLanguageName(code),
  }))
}
