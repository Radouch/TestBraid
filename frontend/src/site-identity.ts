import { ref } from 'vue'

/**
 * Public installation identity as returned by /api/public/config.
 * String values are language-neutral; locale maps follow the interface language.
 */
export type LocalizedText = string | Record<string, string>
export interface SiteIdentity {
  name: LocalizedText
  description: LocalizedText
}

export const siteIdentity = ref<SiteIdentity>({ name: 'TestBraid', description: '' })

export function localizeSiteText(value: LocalizedText, language: string): string {
  if (typeof value === 'string') return value.trim()

  // The exact requested locale wins. English is the preferred fallback,
  // followed by Czech and then the first supplied translation.
  const candidates = [language, language.split('-')[0], 'en', 'cs']
  for (const candidate of candidates) {
    if (Object.prototype.hasOwnProperty.call(value, candidate) && typeof value[candidate] === 'string') {
      return value[candidate].trim()
    }
  }
  return Object.values(value).find((text) => typeof text === 'string')?.trim() ?? ''
}

function isLocalizedText(value: unknown): value is LocalizedText {
  if (typeof value === 'string') return true
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length > 0
    && Object.values(value).every((translation) => typeof translation === 'string')
}

export async function loadSiteIdentity(): Promise<void> {
  try {
    const response = await fetch(import.meta.env.BASE_URL + 'api/public/config', {
      credentials: 'omit',
      cache: 'no-store',
    })
    if (!response.ok) return
    const payload = await response.json() as { site?: { name?: unknown; description?: unknown } }
    if (isLocalizedText(payload.site?.name) && isLocalizedText(payload.site?.description)) {
      siteIdentity.value = { name: payload.site.name, description: payload.site.description }
    }
  } catch {
    // Default branding remains available if the backend cannot be reached.
  }
}
