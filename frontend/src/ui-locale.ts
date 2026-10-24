import { ref } from 'vue'

export type UiLocale = string

const STORAGE_KEY = 'testbraid.uiLocale'

/** Only loaded languages enabled by this installation are selectable. */
export const availableUiLanguages = ref<UiLocale[]>(['en', 'cs'])

export function setAvailableUiLanguages(languages: UiLocale[]): void {
  availableUiLanguages.value = [...new Set(languages)]
}

export function explicitUiLocale(value: unknown): UiLocale | null {
  return typeof value === 'string' && availableUiLanguages.value.includes(value) ? value : null
}

function storedLocale(): UiLocale | null {
  try {
    return explicitUiLocale(window.localStorage.getItem(STORAGE_KEY))
  } catch {
    return null
  }
}

export function preferredUiLocale(): UiLocale {
  const saved = storedLocale()
  if (saved) return saved
  const preferred = navigator.languages?.length ? navigator.languages : [navigator.language]
  for (const language of preferred) {
    const lower = language.toLowerCase()
    const matching = availableUiLanguages.value.find(code => code.toLowerCase() === lower)
      ?? availableUiLanguages.value.find(code => code.toLowerCase() === lower.split('-')[0])
    if (matching) return matching
  }
  return availableUiLanguages.value[0] ?? 'en'
}

export function resolveUiLocale(queryLanguage: unknown): UiLocale {
  return explicitUiLocale(queryLanguage) ?? preferredUiLocale()
}

export function saveUiLocale(value: UiLocale): void {
  if (!explicitUiLocale(value)) return
  try {
    window.localStorage.setItem(STORAGE_KEY, value)
  } catch {
    // Browsers may disable storage; the URL still preserves the selected locale.
  }
}
