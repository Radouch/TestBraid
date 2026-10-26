import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createApp, h, nextTick } from 'vue'
import { createI18n } from 'vue-i18n'
import SecurityDiagnostics from '../src/components/SecurityDiagnostics.vue'

const cs = JSON.parse(readFileSync('public/locales/cs.json', 'utf8')) as Record<string, string>
const en = JSON.parse(readFileSync('public/locales/en.json', 'utf8')) as Record<string, string>
const i18n = createI18n({ legacy: false, locale: 'cs', fallbackLocale: 'en', messages: { cs, en } })
const originalFetch = globalThis.fetch
let result: Record<string, unknown> = {
  backendPlacement: 'outside-inferred-site-root',
  storagePlacement: 'outside-inferred-site-root',
  denyFilePresent: true, denyDirectivePresent: true, probeFilePresent: true,
  probeUrlPath: null,
}
const requests: string[] = []
globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = String(input)
  requests.push(url)
  if (url.endsWith('/api/admin/installation/security')) {
    assert.equal(init?.credentials, 'same-origin')
    return Response.json(result)
  }
  assert.equal(init?.credentials, 'omit')
  if (url.endsWith('/security-probe.txt')) {
    return new Response('TESTBRAID_PRIVATE_BACKEND_PROBE_V1\n', { status: 200 })
  }
  throw new Error('Unexpected HTTP probe URL: ' + url)
}) as typeof fetch
const host = document.createElement('div')
document.body.append(host)
const app = createApp({ render: () => h(SecurityDiagnostics) }).use(i18n)
const errors: unknown[] = []
app.config.errorHandler = error => errors.push(error)
app.mount(host)
const settle = async () => {
  for (let i = 0; i < 6; i++) { await new Promise<void>(resolve => setImmediate(resolve)); await nextTick() }
}
const find = <T extends Element>(selector: string): T => {
  const el = host.querySelector<T>(selector)
  assert.ok(el, 'Missing element ' + selector)
  return el
}
const click = async (el: Element) => {
  el.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  await settle()
}
try {
  await click(find('button'))
  assert.ok(find('.alert-success').textContent?.includes(cs.securityOverviewGood))
  assert.equal(host.querySelectorAll('.text-bg-success').length, 2)
  assert.equal(host.querySelectorAll('.text-bg-info').length, 2)
  assert.equal(find<HTMLButtonElement>('details button').disabled, true,
    'Empty optional URL must not be actionable')
  assert.equal(find<HTMLInputElement>('#security-probe-url').value, '',
    'Do not show an example as a preset URL for a private backend')
  assert.equal(requests.length, 1, 'No automatic HTTP probe should be attempted')
  assert.equal(host.querySelectorAll('.alert-danger').length, 0)
  console.log('PASS SECURITY DOM: positive placement, informational statuses and optional empty HTTP field')

  result = { ...result,
    backendPlacement: 'within-inferred-site-root', storagePlacement: 'within-public-app',
    denyFilePresent: false, denyDirectivePresent: false, probeUrlPath: '/unsafe-backend/security-probe.txt',
  }
  await click(find('button'))
  assert.ok(find('.alert-danger').textContent?.includes(cs.securityOverviewDanger))
  assert.equal(find<HTMLInputElement>('#security-probe-url').value, '/unsafe-backend/security-probe.txt')
  assert.ok(find('.text-bg-warning'))
  assert.ok(find('.text-bg-danger'))
  await click(find('details button'))
  assert.ok(find('.alert-danger').textContent?.includes(cs.securityOverviewExposed))
  assert.ok(host.textContent?.includes(cs.securityProbe_exposed))
  assert.equal(requests.at(-1), '/unsafe-backend/security-probe.txt')
  console.log('PASS SECURITY DOM: risky placement, inferred candidate and confirmed HTTP exposure')

  result = { ...result, backendPlacement: 'unverified', storagePlacement: 'unverified', probeUrlPath: null }
  await click(find('button'))
  assert.ok(find('.alert-warning').textContent?.includes(cs.securityOverviewWarning))
  const input = find<HTMLInputElement>('#security-probe-url')
  input.value = 'https://example.invalid/security-probe.txt'
  input.dispatchEvent(new Event('input', { bubbles: true }))
  await settle()
  const count = requests.length
  await click(find('details button'))
  assert.equal(requests.length, count, 'A cross-origin URL must never be requested')
  assert.ok(host.textContent?.includes(cs.securityProbe_invalid))
  console.log('PASS SECURITY DOM: unknown placement, invalid cross-origin URL rejected')
  assert.deepEqual(errors, [])
} finally {
  app.unmount()
  host.remove()
  globalThis.fetch = originalFetch
}
