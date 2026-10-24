import type { RouteLocationNormalized, RouteLocationRaw } from 'vue-router'
import { explicitUiLocale } from './ui-locale'

export type NavigationSection = 'home' | 'admin' | 'media'

/** Vue Router catch-all for unknown URLs, including nested paths. */
export const NOT_FOUND_PATH = '/:pathMatch(.*)*'

/** Keep author pages together under Administration; the media library has its own link. */
export function navigationSection(path: string): NavigationSection {
  if (path === '/admin/media' || path.startsWith('/admin/media/')) return 'media'
  if (path === '/admin' || path.startsWith('/admin/')) return 'admin'
  return 'home'
}

/**
 * A language explicitly specified in the URL remains in the URL during internal
 * navigation. It overrides, but never modifies, the stored manual preference.
 * A destination explicitly specifying its own language always takes priority.
 */
export function retainExplicitLanguage(
  to: RouteLocationNormalized,
  from: RouteLocationNormalized,
): RouteLocationRaw | undefined {
  const language = explicitUiLocale(from.query.lang)
  if (!language || Object.prototype.hasOwnProperty.call(to.query, 'lang')) return undefined
  return {
    path: to.path,
    query: { ...to.query, lang: language },
    hash: to.hash,
    replace: true,
  }
}
