export type UiLocale = 'en' | 'cs'

const STORAGE_KEY = 'testbraid.uiLocale'

export function explicitUiLocale(value: unknown): UiLocale | null {
  return value === 'cs' || value === 'en' ? value : null
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
    const base = language.toLowerCase().split('-')[0]
    if (base === 'cs' || base === 'en') return base
  }
  return 'en'
}

export function resolveUiLocale(queryLanguage: unknown): UiLocale {
  return explicitUiLocale(queryLanguage) ?? preferredUiLocale()
}

export function saveUiLocale(value: UiLocale): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, value)
  } catch {
    // Browsers may disable storage; the URL still preserves the selected locale.
  }
}
