import assert from 'node:assert/strict'
import { createMemoryHistory, createRouter } from 'vue-router'
import { NOT_FOUND_PATH, navigationSection, retainExplicitLanguage } from '../src/navigation'
import { setAvailableUiLanguages } from '../src/ui-locale'
import {
  fetchPublicCatalog, publicCatalogLocation, publicLessonAnchor, publicLessonForHash, publicLessonForTest, publicLessonHash,
  publicLessonsForLanguage,
  type PublicLesson,
} from '../src/public-catalog'

assert.equal(navigationSection('/'), 'home')
assert.equal(navigationSection('/tests/any-test'), 'home')
assert.equal(navigationSection('/admin'), 'admin')
assert.equal(navigationSection('/admin/tests/test-id/questions'), 'admin')
assert.equal(navigationSection('/admin/tests/test-id/preview'), 'admin')
assert.equal(navigationSection('/admin/media'), 'media')
assert.equal(navigationSection('/admin/media/example'), 'media')

const dummy = { render: () => null }
const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    { path: '/', name: 'home', component: dummy },
    { path: '/admin', component: dummy },
    { path: '/admin/media', component: dummy },
    { path: '/tests/:id', name: 'test', component: dummy },
    { path: NOT_FOUND_PATH, name: 'not-found', component: dummy },
  ],
})
router.beforeEach(retainExplicitLanguage)

// An explicit link language follows ordinary internal navigation, including
// nested pages; query, fragment and custom deployment routes are retained.
await router.push('/?lang=cs')
await router.push('/admin')
assert.equal(router.currentRoute.value.fullPath, '/admin?lang=cs')
await router.push('/admin/media')
assert.equal(router.currentRoute.value.fullPath, '/admin/media?lang=cs')
await router.push({ path: '/tests/example', query: { q: 'search' }, hash: '#top' })
assert.equal(router.currentRoute.value.query.lang, 'cs')
assert.equal(router.currentRoute.value.query.q, 'search')
assert.equal(router.currentRoute.value.hash, '#top')

// A target's explicit language takes priority and then keeps propagating.
await router.push('/admin?lang=en')
assert.equal(router.currentRoute.value.query.lang, 'en')
await router.push('/')
assert.equal(router.currentRoute.value.query.lang, 'en')

// Unknown language values are not propagated; fallback is controlled by i18n.
await router.push('/admin?lang=fr')
await router.push('/')
assert.equal(router.currentRoute.value.query.lang, undefined)

// With no language in the source URL, navigation does not manufacture one,
// preserving preference/browser fallback semantics.
await router.push('/admin')
assert.equal(router.currentRoute.value.query.lang, undefined)
await router.push('/admin/media')
assert.equal(router.currentRoute.value.query.lang, undefined)

// Unknown direct URLs and nested paths reach the 404 route instead of an empty view.
await router.push('/prasopes')
assert.equal(router.currentRoute.value.name, 'not-found')
assert.equal(router.currentRoute.value.path, '/prasopes')
await router.push('/admin/invalid/page')
assert.equal(router.currentRoute.value.name, 'not-found')
await router.push('/tests/valid-id')
assert.equal(router.currentRoute.value.name, 'test')

// The home link from the 404 view still preserves an explicit language.
await router.push('/prasopes?lang=cs')
assert.equal(router.currentRoute.value.name, 'not-found')
await router.push('/')
assert.equal(router.currentRoute.value.fullPath, '/?lang=cs')

// A disabled language is not propagated between pages.
setAvailableUiLanguages(['cs'])
await router.push('/?lang=en')
await router.push('/admin')
assert.equal(router.currentRoute.value.query.lang, undefined)
setAvailableUiLanguages(['en', 'cs'])

const lessons: PublicLesson[] = [
  { id: 'lesson-a', name: 'Family', tests: [{ id: 'test-a', title: 'Signs', language: 'en', questionCount: 1 }] },
  { id: 'lesson-b', name: 'Daily life', tests: [{ id: 'test-b', title: 'Pairs', language: 'cs', questionCount: 3 }] },
]
// The public list filters test language and hides lessons with no tests in that language.
assert.deepEqual(publicLessonsForLanguage(lessons, 'cs'), [lessons[1]])
assert.deepEqual(publicLessonsForLanguage(lessons, 'en'), [lessons[0]])
assert.deepEqual(publicLessonsForLanguage(lessons, 'de'), [])
const mixed = [{ ...lessons[0]!, tests: [...lessons[0]!.tests, ...lessons[1]!.tests] }]
assert.deepEqual(publicLessonsForLanguage(mixed, 'cs')[0]?.tests, lessons[1]?.tests)
assert.deepEqual(publicLessonsForLanguage(mixed, 'en')[0]?.tests, lessons[0]?.tests)
assert.deepEqual(lessons[0]?.tests.map(test => test.language), ['en'], 'Language filtering must not mutate the fetched catalog.')

// Directly shared test URLs can resolve their lesson without browser history.
assert.equal(publicLessonForTest(lessons, { id: 'test-b', groupId: 'lesson-b' }), lessons[1])
assert.equal(publicLessonForTest(lessons, { id: 'test-b', groupId: 'lesson-a' }), undefined)
assert.equal(publicLessonForTest(lessons, { id: 'withdrawn-test', groupId: 'lesson-a' }), undefined)
assert.equal(publicLessonForTest([], { id: 'test-b', groupId: 'lesson-b' }), undefined)
assert.equal(publicLessonAnchor('lesson-b'), 'lesson-lesson-b')
assert.equal(publicLessonForHash(lessons, publicLessonHash('lesson-b')), lessons[1])
assert.equal(publicLessonForHash(lessons, '#lesson-removed'), undefined)
assert.equal(publicLessonForHash(lessons, '#unrelated'), undefined)
assert.equal(publicLessonForHash(lessons, '#lesson-%E0%A4%A'), undefined)

await router.push('/tests/test-b?lang=cs')
await router.push(publicCatalogLocation('lesson-b'))
assert.equal(router.currentRoute.value.fullPath, '/?lang=cs#lesson-lesson-b')
await router.push('/tests/withdrawn-test?lang=cs')
await router.push(publicCatalogLocation())
assert.equal(router.currentRoute.value.fullPath, '/?lang=cs#public-catalog-heading')

const previousFetch = globalThis.fetch
const controller = new AbortController()
let payload: unknown = { groups: lessons }
let responseStatus = 200
globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
  assert.equal(String(url), '/training/api/public/catalog')
  assert.equal(init?.credentials, 'omit', 'Author cookies must not be sent to the public catalog.')
  assert.equal(init?.cache, 'no-store')
  assert.equal(init?.signal, controller.signal)
  return new Response(JSON.stringify(payload), { status: responseStatus })
}) as typeof fetch
try {
  assert.deepEqual(await fetchPublicCatalog('/training/', controller.signal), lessons)
  payload = { groups: [] }
  assert.deepEqual(await fetchPublicCatalog('/training/', controller.signal), [])
  for (const malformed of [null, {}, { groups: null }, { groups: [null] },
    { groups: [{ id: 'lesson', name: 'Lesson', tests: [{}] }] },
    { groups: [{ id: 'lesson', name: 'Lesson', tests: [{ id: 't', title: 'T', language: 'cs' }] }] },
    ...[-1, 1.5, '2'].map(questionCount => ({
      groups: [{ id: 'lesson', name: 'Lesson', tests: [{ id: 't', title: 'T', language: 'cs', questionCount }] }],
    }))]) {
    payload = malformed
    await assert.rejects(fetchPublicCatalog('/training/', controller.signal), /Invalid public catalog/)
  }
  responseStatus = 503
  await assert.rejects(fetchPublicCatalog('/training/', controller.signal), /Public catalog unavailable/)
} finally {
  globalThis.fetch = previousFetch
}

console.log('PASS: section navigation, language propagation, public lesson lookup and catalog return anchors')
