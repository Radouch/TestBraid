import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createApp, h, nextTick } from 'vue'
import { createI18n } from 'vue-i18n'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import TestView from '../src/views/TestView.vue'
import type { DraftTest } from '../src/editor/model'
import { publicLessonHash } from '../src/public-catalog'

// The public test page: one way back above the test, named after the lesson,
// and the same destination offered again with the results.
const cs = JSON.parse(readFileSync('public/locales/cs.json', 'utf8')) as Record<string, string>
const en = JSON.parse(readFileSync('public/locales/en.json', 'utf8')) as Record<string, string>
const text = (id: string, value: string) => ({ id, type: 'text' as const, text: value })
const published: DraftTest = {
  schemaVersion: 1, id: 'shapes', groupId: 'lesson-1', language: 'cs', title: 'Tvary', description: '',
  status: 'published', createdAt: '', updatedAt: '', publishedAt: '',
  questions: [{
    id: 'q1', type: 'choice', mode: 'single', prompt: [text('p', 'Která je správně?')],
    options: [{ id: 'a', content: [text('a', 'Tato')] }, { id: 'b', content: [text('b', 'Tamta')] }],
    correctOptionIds: ['a'],
  }],
}
let catalogAvailable = true
const previousFetch = globalThis.fetch
globalThis.fetch = (async (input: string | URL | Request) => {
  const path = String(input).replace('/training/api/', '')
  if (path === 'public/catalog') {
    return catalogAvailable
      ? Response.json({ groups: [{ id: 'lesson-1', name: 'Ukázková lekce', tests: [
        { id: 'shapes', title: 'Tvary', language: 'cs', questionCount: 1 },
      ] }] })
      : new Response('', { status: 500 })
  }
  if (path === 'public/tests/shapes') return Response.json({ test: published, mediaUrls: {} })
  if (path === 'public/tests/missing') return new Response('', { status: 404 })
  throw new Error('Unexpected request: ' + path)
}) as typeof fetch

const i18n = createI18n({ legacy: false, locale: 'cs', fallbackLocale: 'en', messages: { cs, en } })
const router = createRouter({ history: createMemoryHistory('/training/'), routes: [
  { path: '/', name: 'home', component: { render: () => h('p', 'Home') } },
  { path: '/tests/:id', name: 'test', component: TestView },
] })
await router.push('/tests/shapes')
const host = document.createElement('div')
document.body.append(host)
const app = createApp({ render: () => h(RouterView) }).use(router).use(i18n)
const errors: unknown[] = []
app.config.errorHandler = error => { errors.push(error) }
app.mount(host)
const settle = async () => {
  for (let index = 0; index < 6; index++) {
    await new Promise<void>(resolve => setImmediate(resolve))
    await nextTick()
  }
}
function find<T extends Element = HTMLElement>(selector: string, parent: ParentNode = host): T {
  const element = parent.querySelector<T>(selector)
  assert.ok(element, 'Missing element: ' + selector)
  return element
}
const backNavigation = () => [...host.querySelectorAll('nav')]
  .filter(nav => nav.getAttribute('aria-label') === cs.runnerCatalogNavigation)
const occurrences = (needle: string) => (host.textContent ?? '').split(needle).length - 1

try {
  await settle()
  assert.equal(backNavigation().length, 1, 'One way back above the test, none below it')
  const back = find<HTMLAnchorElement>('a', backNavigation()[0]!)
  assert.equal(back.textContent?.trim(), 'Ukázková lekce')
  assert.ok(back.getAttribute('href')?.endsWith(publicLessonHash('lesson-1')))
  assert.equal(occurrences('Lekce:'), 0, 'No separate "Lesson:" line')
  assert.equal(occurrences(cs.runnerNoStorage!), 1)
  assert.equal(host.querySelector('.summary-actions'), null)

  const answer = find<HTMLInputElement>('#runner-option-q1-a')
  answer.checked = true
  answer.dispatchEvent(new Event('change', { bubbles: true }))
  find('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  await settle()
  const resultsBack = find<HTMLAnchorElement>('.summary-actions a')
  assert.equal(resultsBack.textContent?.trim(), cs.runnerBackToCatalog)
  assert.equal(resultsBack.getAttribute('href'), back.getAttribute('href'))
  assert.equal(host.querySelector('[data-review-mistakes]'), null)
  console.log('PASS DOM: one lesson-named way back, results link to the test list and a single privacy note')

  // Without the catalog the test still works and the link keeps a generic label.
  catalogAvailable = false
  await router.push('/')
  await router.push('/tests/shapes')
  await settle()
  assert.ok(host.querySelector('#runner-option-q1-a'))
  assert.equal(find('a', backNavigation()[0]!).textContent?.trim(), cs.runnerBackToCatalog)

  await router.push('/tests/missing')
  await settle()
  assert.equal(find('[role=alert]').textContent?.trim(), cs.runnerNotFound)
  assert.equal(backNavigation().length, 1)
  assert.equal(find('a', backNavigation()[0]!).textContent?.trim(), cs.runnerBackToCatalog)
  assert.deepEqual(errors, [])
  console.log('PASS DOM: generic way back without the catalog and for an unavailable test')
} finally {
  app.unmount()
  host.remove()
  globalThis.fetch = previousFetch
}
