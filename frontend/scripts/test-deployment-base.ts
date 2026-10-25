import assert from 'node:assert/strict'
import { appBaseUrl } from '../src/deployment-base'

// Production shell includes a base element before loading the application.
// Each case is the identical compiled JavaScript with a different HTML base.
const existing = Object.getOwnPropertyDescriptor(globalThis, 'document')
try {
  for (const expected of ['/', '/testbraid/', '/courses/testbraid/']) {
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: { querySelector: (selector: string) => {
        assert.equal(selector, 'base[data-testbraid-base]')
        return { getAttribute: (key: string) => key === 'href' ? expected : null }
      } },
    })
    assert.equal(appBaseUrl(), expected)
    assert.equal(appBaseUrl() + 'api/auth/session', expected + 'api/auth/session')
    assert.equal(appBaseUrl() + 'locales/cs.json', expected + 'locales/cs.json')
  }
  Object.defineProperty(globalThis, 'document', {
    configurable: true, value: { querySelector: () => ({ getAttribute: () => 'https://evil.example/' }) },
  })
  assert.equal(appBaseUrl(), '/')
} finally {
  if (existing) Object.defineProperty(globalThis, 'document', existing)
  else Reflect.deleteProperty(globalThis, 'document')
}
console.log('PASS: runtime deployment base for root and two nested paths')
