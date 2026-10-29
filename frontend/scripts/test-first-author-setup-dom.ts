import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createApp, h, nextTick } from 'vue'
import { createI18n } from 'vue-i18n'
import AdminView from '../src/views/AdminView.vue'
import { USERNAME_PATTERN } from '../src/auth'

const en = JSON.parse(readFileSync('public/locales/en.json', 'utf8')) as Record<string, string>
const i18n = createI18n({ legacy: false, locale: 'en', fallbackLocale: 'en', messages: { en } })

// The form rule must be the server rule, otherwise the form would either let
// through usernames the server rejects or block ones it accepts.
const server = readFileSync('../backend/public/index.php', 'utf8')
const serverRules = [...server.matchAll(/preg_match\('(\/\^\[A-Za-z0-9[^']*)', \$data\['username'\]\)/g)].map(m => m[1])
assert.equal(serverRules.length, 2, 'Expected the setup and login username checks in backend/public/index.php')
for (const rule of serverRules) assert.equal(rule.replace(/D$/, ''), String(USERNAME_PATTERN), 'Username rule drifted from the server')

const setupCalls: Array<Record<string, unknown>> = []
globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = String(input)
  if (url.endsWith('/api/auth/session')) {
    return Response.json({ authenticated: false, csrfToken: 'token', setupState: 'ready' })
  }
  if (url.endsWith('/api/auth/setup')) {
    setupCalls.push(JSON.parse(String(init?.body)) as Record<string, unknown>)
    return Response.json({ authenticated: false, csrfToken: 'token', setupState: 'complete' })
  }
  throw new Error('Unexpected request ' + url)
}) as typeof fetch

const host = document.createElement('div')
document.body.append(host)
const app = createApp({ render: () => h(AdminView) }).use(i18n)
const errors: unknown[] = []
app.config.errorHandler = error => errors.push(error)
app.mount(host)
const settle = async () => {
  for (let i = 0; i < 6; i++) { await new Promise<void>(resolve => setImmediate(resolve)); await nextTick() }
}
const type = async (selector: string, value: string) => {
  const input = host.querySelector<HTMLInputElement>(selector)
  assert.ok(input, 'Missing ' + selector)
  input.value = value
  input.dispatchEvent(new Event('input', { bubbles: true }))
  await settle()
}
const submit = async () => {
  host.querySelector('form')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  await settle()
}
const username = () => host.querySelector<HTMLInputElement>('#setup-username')!
const help = () => host.querySelector('#setup-username-help')!

try {
  await settle()
  assert.ok(username(), 'Setup form is shown')
  assert.equal(help().textContent, en.usernameRules, 'The rule is shown before typing')
  assert.ok(!username().classList.contains('is-invalid'))

  await type('#setup-password', 'correct horse battery')
  await type('#setup-key', 'p8Q2vX7mLr4tZ9wKc3Nf6yHb1Jd5Sg0aE')
  for (const bad of ['Jan Novák', 'jan novak', 'Novák', 'user@example.org']) {
    await type('#setup-username', bad)
    assert.ok(username().classList.contains('is-invalid'), bad + ' is flagged')
    assert.equal(username().getAttribute('aria-invalid'), 'true')
    assert.equal(help().textContent, en.usernameInvalid)
    await submit()
    assert.equal(setupCalls.length, 0, bad + ' must not be sent')
  }

  await type('#setup-username', 'jan.novak_2-x')
  assert.ok(!username().classList.contains('is-invalid'))
  assert.equal(help().textContent, en.usernameRules)
  await submit()
  assert.deepEqual(setupCalls, [{ username: 'jan.novak_2-x', password: 'correct horse battery', setupKey: 'p8Q2vX7mLr4tZ9wKc3Nf6yHb1Jd5Sg0aE' }])
  assert.deepEqual(errors, [])
  console.log('PASS SETUP DOM: username rule shown, invalid names flagged and not sent, valid name submitted')
} finally {
  app.unmount()
}
