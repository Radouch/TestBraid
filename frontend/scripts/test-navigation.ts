import assert from 'node:assert/strict'
import { createMemoryHistory, createRouter } from 'vue-router'
import { navigationSection, retainExplicitLanguage } from '../src/navigation'
import { setAvailableUiLanguages } from '../src/ui-locale'

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
    { path: '/', component: dummy },
    { path: '/admin', component: dummy },
    { path: '/admin/media', component: dummy },
    { path: '/tests/:id', component: dummy },
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

// A disabled language is not propagated between pages.
setAvailableUiLanguages(['cs'])
await router.push('/?lang=en')
await router.push('/admin')
assert.equal(router.currentRoute.value.query.lang, undefined)
setAvailableUiLanguages(['en', 'cs'])

console.log('PASS: active navigation sections and explicit language URL propagation')
