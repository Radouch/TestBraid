import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createApp, h, nextTick } from 'vue'
import { createI18n } from 'vue-i18n'
import { createMemoryHistory, createRouter } from 'vue-router'

// The shared header and footer: anonymous visitors get no navigation (it would
// hold a single item) and a footer sign-in link; signed-in authors get the
// author navigation and no second link to the author area in the footer.
const cs = JSON.parse(readFileSync('public/locales/cs.json', 'utf8')) as Record<string, string>
const en = JSON.parse(readFileSync('public/locales/en.json', 'utf8')) as Record<string, string>
let authenticated = false
const previousFetch = globalThis.fetch
globalThis.fetch = (async (input: string | URL | Request) => {
  const path = String(input).replace('/training/api/', '')
  if (path === 'auth/session') {
    return Response.json(authenticated
      ? { authenticated: true, csrfToken: 'csrf', user: { id: 'u1', username: 'alice' } }
      : { authenticated: false, csrfToken: 'csrf' })
  }
  throw new Error('Unexpected request: ' + path)
}) as typeof fetch

// Vite defines the version at build time; the DOM test bundle does not, so set
// it before App.vue (and version.ts) is evaluated.
Object.assign(globalThis, { __TESTBRAID_VERSION__: '0.0.0-test' })
const { default: App } = await import('../src/App.vue')
const i18n = createI18n({ legacy: false, locale: 'cs', fallbackLocale: 'en', messages: { cs, en } })
const page = (name: string) => ({ render: () => h('p', name) })
const router = createRouter({ history: createMemoryHistory('/training/'), routes: [
  { path: '/', name: 'home', component: page('Home') },
  { path: '/admin', name: 'admin', component: page('Author area') },
  { path: '/admin/media', name: 'admin-media', component: page('Media') },
] })
// App.vue takes the interface language from the URL, as on a real site.
await router.push('/?lang=cs')
const host = document.createElement('div')
document.body.append(host)
const app = createApp(App).use(router).use(i18n)
const errors: unknown[] = []
app.config.errorHandler = error => { errors.push(error) }
app.mount(host)
const settle = async () => {
  for (let index = 0; index < 6; index++) {
    await new Promise<void>(resolve => setImmediate(resolve))
    await nextTick()
  }
}
const footerLinks = () => [...host.querySelectorAll<HTMLAnchorElement>('.app-footer a')]
  .filter(link => !link.href.startsWith('https://github.com/'))

try {
  await settle()
  assert.equal(host.querySelector('nav[aria-label="Main navigation"]'), null, 'No single-item navigation for visitors')
  assert.deepEqual(footerLinks().map(link => [link.textContent?.trim(), link.getAttribute('href')]), [[cs.signIn, '/training/admin']])
  console.log('PASS SHELL DOM: visitors get no navigation and a footer sign-in link')

  authenticated = true
  await router.push('/admin?lang=cs')
  await settle()
  const navigation = [...host.querySelectorAll<HTMLAnchorElement>('nav[aria-label="Main navigation"] a')]
  assert.deepEqual(navigation.map(link => link.textContent?.trim()), ['Veřejný web', 'Editace testů', 'Knihovna médií'])
  assert.equal(navigation[1]!.getAttribute('aria-current'), 'location')
  assert.deepEqual(footerLinks(), [], 'Signed-in authors have the author area in the header only')
  assert.deepEqual(errors, [])
  console.log('PASS SHELL DOM: signed-in authors get "Public site · Edit tests · Media library" and no footer author link')
} finally {
  app.unmount()
  host.remove()
  globalThis.fetch = previousFetch
}
