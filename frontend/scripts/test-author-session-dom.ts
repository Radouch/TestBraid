import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createApp, h, nextTick } from 'vue'
import { createI18n } from 'vue-i18n'
import { createMemoryHistory, createRouter } from 'vue-router'

// Regression test for #106: signing in on a first visit must not fail with
// INVALID_CSRF. The mock server models PHP sessions and the browser's single
// session cookie: a request without a cookie starts a new session with its
// own token, the cookie follows the response that arrived last, and response
// bodies may finish in another order than their headers arrived.
const en = JSON.parse(readFileSync('public/locales/en.json', 'utf8')) as Record<string, string>
const tokens = new Map<number, string>()
let cookie: number | null = null
let nextSession = 1
let sessionRequests = 0
let loginRequests = 0
const previousFetch = globalThis.fetch

async function sessionResponse(): Promise<Response> {
  const order = ++sessionRequests
  // The cookie a request carries is the one the browser had when sending it.
  const id = cookie ?? nextSession++
  if (!tokens.has(id)) tokens.set(id, 'token-' + id)
  const body = { authenticated: false, csrfToken: tokens.get(id), setupState: 'complete' }
  // The response arrives a little later, so requests sent meanwhile still
  // carry no cookie; its Set-Cookie applies on arrival.
  await new Promise(resolve => setTimeout(resolve, 3))
  cookie = id
  // Earlier responses finish reading their body later than later ones.
  const delay = Math.max(1, 12 - order * 4)
  return { ok: true, status: 200, json: () => new Promise(resolve => setTimeout(() => resolve(body), delay)) } as Response
}

globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const path = String(input).replace('/training/api/', '')
  if (path === 'auth/session') return sessionResponse()
  if (path === 'auth/login') {
    loginRequests++
    const token = new Headers(init?.headers).get('X-CSRF-Token')
    if (cookie === null || token !== tokens.get(cookie)) {
      return Response.json({ error: { code: 'INVALID_CSRF', message: 'Invalid or missing CSRF token.' } }, { status: 403 })
    }
    tokens.set(cookie, 'signed-in-' + cookie)
    return Response.json({ authenticated: true, csrfToken: tokens.get(cookie), setupState: 'complete', user: { id: 'u1', username: 'alice' } })
  }
  if (path === 'admin/groups') return Response.json({ groups: [] })
  if (path === 'admin/tests') return Response.json({ tests: [] })
  if (path === 'admin/tests/readiness') return Response.json({ tests: {} })
  throw new Error('Unexpected request: ' + path)
}) as typeof fetch

// Vite defines the version at build time; the DOM test bundle does not.
Object.assign(globalThis, { __TESTBRAID_VERSION__: '0.0.0-test' })
const { default: App } = await import('../src/App.vue')
const { default: AdminView } = await import('../src/views/AdminView.vue')
const { authorSession } = await import('../src/auth')
const signedIn = () => authorSession.value?.authenticated === true
const i18n = createI18n({ legacy: false, locale: 'en', fallbackLocale: 'en', messages: { en } })
const settle = async () => {
  for (let index = 0; index < 8; index++) {
    await new Promise<void>(resolve => setTimeout(resolve, 5))
    await nextTick()
  }
}
const errors: unknown[] = []

/** A fresh page load of /admin: the router navigates only after mounting, as in the browser. */
async function openAuthorArea() {
  const router = createRouter({ history: createMemoryHistory('/training/'), routes: [
    { path: '/', name: 'home', component: { render: () => h('p', 'Home') } },
    { path: '/admin', name: 'admin', component: AdminView },
    { path: '/admin/media', name: 'admin-media', component: { render: () => h('p', 'Media') } },
  ] })
  const host = document.createElement('div')
  document.body.append(host)
  const app = createApp(App).use(router).use(i18n)
  app.config.errorHandler = error => { errors.push(error) }
  app.mount(host)
  void router.push('/admin?lang=en')
  await settle()
  return { host, app }
}
async function signIn(host: HTMLElement) {
  const fill = (selector: string, value: string) => {
    const input = host.querySelector<HTMLInputElement>(selector)
    assert.ok(input, 'Missing ' + selector)
    input.value = value
    input.dispatchEvent(new Event('input', { bubbles: true }))
  }
  fill('#username', 'alice')
  fill('#password', 'Correct-Password-123')
  host.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  await settle()
}

let page: Awaited<ReturnType<typeof openAuthorArea>> | undefined
try {
  // First visit, no cookie: the header, the route change and the author view
  // all want the session, but they share one request and so one session.
  page = await openAuthorArea()
  assert.equal(sessionRequests, 1, 'Concurrent session reads share one request')
  await signIn(page.host)
  assert.equal(loginRequests, 1, 'The first sign-in attempt succeeds')
  assert.equal(signedIn(), true)
  assert.equal(page.host.querySelector('.app-account')?.textContent?.includes('alice'), true)
  assert.equal(page.host.textContent?.includes(en.authFailed!), false)
  console.log('PASS SESSION DOM: a first visit makes one session request, and sign-in succeeds on the first try')

  // The session expires while the form is open: the server has rotated the
  // token, so the first attempt is refused, and the form re-reads the session
  // and retries once.
  page.app.unmount()
  page.host.remove()
  authorSession.value = null
  cookie = null
  sessionRequests = 0
  loginRequests = 0
  page = await openAuthorArea()
  tokens.set(cookie!, 'rotated-after-idle')
  await signIn(page.host)
  assert.equal(loginRequests, 2, 'One retry after INVALID_CSRF')
  assert.equal(sessionRequests, 2, 'The retry reads the session again first')
  assert.equal(signedIn(), true)
  assert.equal(page.host.textContent?.includes(en.authFailed!), false)
  assert.deepEqual(errors, [])
  console.log('PASS SESSION DOM: an expired token is refreshed and the sign-in is retried once')
} finally {
  page?.app.unmount()
  page?.host.remove()
  globalThis.fetch = previousFetch
}
