/** One deployment-relative URL prefix for Vue, API, locale files and previews.
 * PHP injects a validated base element into the prebuilt HTML before any assets.
 * Vite development does not use that PHP shell and falls back to root.
 */
export function appBaseUrl(): string {
  if (typeof document !== 'undefined') {
    const runtimeBase = document.querySelector('base[data-testbraid-base]')?.getAttribute('href')
    if (runtimeBase && /^\/(?:[A-Za-z0-9._~-]+\/)*$/.test(runtimeBase)) return runtimeBase
  }
  return '/'
}
