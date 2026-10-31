import assert from 'node:assert/strict'
import { followSystemColorScheme } from '../src/color-scheme'

// The page follows the system colour scheme through Bootstrap's data-bs-theme
// attribute, from the first call and after later changes of the setting.
class FakeQuery {
  private listeners = new Set<() => void>()
  constructor(public matches: boolean) {}
  addEventListener(_type: 'change', listener: () => void): void { this.listeners.add(listener) }
  removeEventListener(_type: 'change', listener: () => void): void { this.listeners.delete(listener) }
  change(matches: boolean): void {
    this.matches = matches
    for (const listener of this.listeners) listener()
  }
}

const root = document.createElement('html')
const query = new FakeQuery(true)
const stop = followSystemColorScheme(root, query as unknown as MediaQueryList)
assert.equal(root.getAttribute('data-bs-theme'), 'dark')
query.change(false)
assert.equal(root.getAttribute('data-bs-theme'), 'light')
query.change(true)
assert.equal(root.getAttribute('data-bs-theme'), 'dark')
console.log('PASS COLOUR SCHEME: data-bs-theme follows the system setting and its changes')

stop()
query.change(false)
assert.equal(root.getAttribute('data-bs-theme'), 'dark', 'No updates after stopping')

const withoutMatchMedia = document.createElement('html')
followSystemColorScheme(withoutMatchMedia, undefined)
assert.equal(withoutMatchMedia.getAttribute('data-bs-theme'), 'light')
console.log('PASS COLOUR SCHEME: browsers without matchMedia get the light scheme')
