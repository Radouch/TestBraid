/**
 * Follow the visitor's light or dark system setting.
 *
 * Bootstrap 5.3 switches its colour variables with `data-bs-theme` on an
 * ancestor, and theme.css gives TestBraid's own tokens their dark values under
 * the same attribute. Setting it on <html> covers the whole page, including
 * dialogs. The attribute follows later changes of the setting without a reload.
 * Browsers without `matchMedia` get the light scheme.
 *
 * @returns a function that stops following the setting.
 */
export function followSystemColorScheme(
  root: HTMLElement = document.documentElement,
  query: MediaQueryList | undefined = typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-color-scheme: dark)')
    : undefined,
): () => void {
  const apply = () => { root.dataset.bsTheme = query?.matches ? 'dark' : 'light' }
  apply()
  query?.addEventListener('change', apply)
  return () => query?.removeEventListener('change', apply)
}
