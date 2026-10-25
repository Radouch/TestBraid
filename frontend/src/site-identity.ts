import { appBaseUrl } from './deployment-base'
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

/** Public allowlist from the private app.json; translations are loaded separately. */
export const configuredUiLanguages = ref<string[]>(['en', 'cs'])

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
    const response = await fetch(appBaseUrl() + 'api/public/config', {
      credentials: 'omit',
      cache: 'no-store',
      // Avoid leaving the entire application unrendered on a stalled host.
      signal: AbortSignal.timeout(5000),
    })
    if (!response.ok) return
    const payload = await response.json() as { site?: { name?: unknown; description?: unknown }; uiLanguages?: unknown }
    if (isLocalizedText(payload.site?.name) && isLocalizedText(payload.site?.description)) {
      siteIdentity.value = { name: payload.site.name, description: payload.site.description }
    }
    if (Array.isArray(payload.uiLanguages) && payload.uiLanguages.length > 0
      && payload.uiLanguages.every((code: unknown) => typeof code === 'string'
        && /^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(code))) {
      configuredUiLanguages.value = payload.uiLanguages
    }
  } catch {
    // Default branding remains available if the backend cannot be reached.
  }
}
