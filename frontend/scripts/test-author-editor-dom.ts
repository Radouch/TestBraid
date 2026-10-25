import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createApp, h, nextTick } from 'vue'
import { createI18n } from 'vue-i18n'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import AdminCatalog from '../src/components/AdminCatalog.vue'
import TestQuestionsView from '../src/views/TestQuestionsView.vue'
import TestPreviewView from '../src/views/TestPreviewView.vue'
import { retainExplicitLanguage } from '../src/navigation'
import type { DraftTest } from '../src/editor/model'

const cs = JSON.parse(readFileSync('public/locales/cs.json', 'utf8')) as Record<string, string>
const en = JSON.parse(readFileSync('public/locales/en.json', 'utf8')) as Record<string, string>
const text = (id: string, value: string) => ({ id, type: 'text' as const, text: value })
const mediaId = '11111111-1111-4111-8111-111111111111'
const fixture: DraftTest = {
  schemaVersion: 1, id: 'draft', groupId: 'a', title: 'Original title', description: 'Original description', language: 'cs',
  status: 'draft', createdAt: 'created', updatedAt: 'initial', publishedAt: null,
  questions: [
    { id: 'choice', type: 'choice', mode: 'single', prompt: [text('prompt', 'Original prompt'), { id: 'clip', type: 'video', mediaId }],
      options: [{ id: 'yes', content: [text('yes-content', 'Yes')] }, { id: 'no', content: [text('no-content', 'No')] }], correctOptionIds: ['yes'] },
    { id: 'matching', type: 'matching', prompt: [text('matching-prompt', 'Match items')],
      leftItems: [{ id: 'l1', content: [text('l1-text', 'One')] }, { id: 'l2', content: [text('l2-text', 'Two')] }],
      rightItems: [{ id: 'r1', content: [text('r1-text', 'First')] }, { id: 'r2', content: [text('r2-text', 'Second')] }],
      matches: [{ leftId: 'l1', rightId: 'r1' }, { leftId: 'l2', rightId: 'r2' }] },
  ],
}
const stored: Record<string, DraftTest> = { draft: structuredClone(fixture), other: { ...structuredClone(fixture), id: 'other', title: 'Other test', groupId: 'b' } }
const lessons = [{ id: 'a', name: 'Lesson A' }, { id: 'b', name: 'Lesson B' }]
const calls: Array<{ method: string; path: string; body?: Record<string, unknown> }> = []
let authenticated = true
let holdLessons = true
let resolveLessons: ((response: Response) => void) | undefined
let failSave = false
let holdSave = false
let finishSave: (() => void) | undefined
let failRename = false
let failLessons = false
let heldTestId = ''
let resolveTest: ((response: Response) => void) | undefined
let revision = 0
const previousFetch = globalThis.fetch
const previousConfirm = window.confirm
let allowExit = false
let confirmations = 0
window.confirm = () => { confirmations++; return allowExit }
globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const path = String(input).replace('/training/api/', '')
  const method = init?.method ?? 'GET'
  const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : undefined
  assert.equal(init?.credentials, 'same-origin')
  assert.equal(init?.cache, 'no-store')
  if (method !== 'GET') assert.equal(new Headers(init?.headers).get('X-CSRF-Token'), 'session-csrf')
  calls.push({ method, path, body })
  if (path === 'auth/session') return Response.json({ authenticated, csrfToken: 'session-csrf' })
  if (path === 'admin/groups') {
    if (method === 'POST') { const group = { id: 'new-lesson', name: String(body!.name) }; lessons.push(group); return Response.json(group) }
    if (holdLessons) return new Promise<Response>(resolve => { resolveLessons = resolve })
    return failLessons ? Response.json({}, { status: 503 }) : Response.json({ groups: lessons })
  }
  if (path.startsWith('admin/groups/') && method === 'PATCH') {
    if (failRename) return Response.json({ error: { code: 'UNAVAILABLE' } }, { status: 503 })
    const group = lessons.find(item => item.id === path.split('/').at(-1))!
    group.name = String(body!.name)
    return Response.json(group)
  }
  if (path === 'admin/tests/readiness') return Response.json({ tests: Object.fromEntries(Object.keys(stored).map(id => [id, { ready: true, issues: [] }])) })
  if (path === 'admin/tests' && method === 'GET') return Response.json({ tests: Object.values(stored) })
  if (path === 'admin/tests' && method === 'POST') {
    const created = { ...structuredClone(fixture), ...body, id: 'created', questions: [], updatedAt: 'created' } as DraftTest
    stored.created = created
    return Response.json(created)
  }
  const match = path.match(/^admin\/tests\/([^/]+)(?:\/(unpublish|duplicate))?$/)
  if (match) {
    const id = match[1]!
    if (method === 'PUT') {
      if (failSave) return Response.json({ error: { code: 'UNAVAILABLE' } }, { status: 503 })
      if (holdSave) return new Promise<Response>(resolve => {
        finishSave = () => {
          stored[id] = { ...stored[id]!, ...body, updatedAt: 'saved-' + (++revision) } as DraftTest
          resolve(Response.json(stored[id]))
        }
      })
      stored[id] = { ...stored[id]!, ...body, updatedAt: 'saved-' + (++revision) } as DraftTest
      return Response.json(stored[id])
    }
    if (match[2] === 'unpublish') {
      stored[id] = { ...stored[id]!, status: 'draft', publishedAt: null, updatedAt: 'unpublished' }
      return Response.json(stored[id])
    }
    if (match[2] === 'duplicate') {
      stored.copy = { ...structuredClone(stored[id]!), id: 'copy', title: 'Copy', status: 'draft' }
      return Response.json(stored.copy)
    }
    if (id === heldTestId) return new Promise<Response>(resolve => { resolveTest = resolve })
    return stored[id] ? Response.json(stored[id]) : Response.json({}, { status: 404 })
  }
  throw new Error('Unexpected author request: ' + method + ' ' + path)
}) as typeof fetch

const i18n = createI18n({ legacy: false, locale: 'cs', fallbackLocale: 'en', messages: { cs, en } })
const router = createRouter({ history: createMemoryHistory('/training/'), routes: [
  { path: '/admin', name: 'admin', component: { render: () => h(AdminCatalog, { csrfToken: 'session-csrf' }) } },
  { path: '/admin/tests/:id/questions', name: 'test-questions', component: TestQuestionsView },
  { path: '/admin/tests/:id/preview', name: 'test-preview', component: TestPreviewView },
  { path: '/elsewhere', name: 'elsewhere', component: { render: () => h('p', 'Elsewhere') } },
  { path: '/tests/:id', name: 'test', component: { render: () => h('p', 'Public test') } },
] })
router.beforeEach(retainExplicitLanguage)
await router.push('/admin/tests/draft/questions?tab=settings&lang=cs')
const host = document.createElement('div')
document.body.append(host)
const errors: unknown[] = []
const app = createApp({ render: () => h(RouterView) }).use(router).use(i18n)
app.config.errorHandler = error => errors.push(error)
app.mount(host)
const settle = async () => {
  for (let index = 0; index < 6; index++) { await new Promise<void>(resolve => setImmediate(resolve)); await nextTick() }
}
function find<T extends Element = HTMLElement>(selector: string, parent: ParentNode = host): T {
  const value = parent.querySelector<T>(selector)
  assert.ok(value, 'Missing element: ' + selector)
  return value
}
async function click(element: Element): Promise<void> {
  element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }))
  await settle()
}
async function fill(selector: string, value: string): Promise<void> {
  const input = find<HTMLInputElement | HTMLTextAreaElement>(selector)
  input.value = value
  input.dispatchEvent(new Event('input', { bubbles: true }))
  await settle()
}
async function change(selector: string, value: string): Promise<void> {
  const input = find<HTMLSelectElement>(selector)
  input.value = value
  input.dispatchEvent(new Event('change', { bubbles: true }))
  await settle()
}
async function submit(form: HTMLFormElement): Promise<void> {
  form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  await settle()
}
const save = () => submit(find<HTMLFormElement>('#test-editor-form'))
const puts = () => calls.filter(call => call.method === 'PUT' && call.path === 'admin/tests/draft')
const back = () => find<HTMLAnchorElement>('.editor-back')

try {
  await settle()
  assert.equal(find('#editor-tab-settings').getAttribute('aria-selected'), 'true')
  assert.equal(find<HTMLInputElement>('#test-settings-title').value, 'Original title')
  assert.equal(find<HTMLInputElement>('#test-settings-score').checked, true, 'Legacy tests keep visible scoring')
  assert.ok(find<HTMLSelectElement>('#test-settings-lesson').disabled)
  await fill('#test-settings-title', 'Updated title')
  await click(find('#test-settings-score'))
  find('#editor-tab-settings').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true, cancelable: true }))
  await settle()
  assert.equal(document.activeElement, find('#editor-tab-questions'))
  assert.equal(router.currentRoute.value.query.tab, undefined)
  assert.equal(confirmations, 0, 'Switching tabs must not ask to discard edits')
  const video = find('video')
  await fill('#text-prompt', 'Updated prompt')
  await click(find('#editor-tab-settings'))
  assert.equal(find<HTMLInputElement>('#test-settings-title').value, 'Updated title')
  assert.equal(find<HTMLInputElement>('#test-settings-score').checked, false)
  await click(find('#editor-tab-questions'))
  assert.equal(find('video'), video, 'Tab switches keep native media/composer nodes')
  assert.equal(find<HTMLTextAreaElement>('#text-prompt').value, 'Updated prompt')
  holdLessons = false
  resolveLessons!(Response.json({ groups: lessons }))
  await settle()
  assert.ok(host.textContent?.includes('Lesson A'))
  assert.equal(find<HTMLInputElement>('#test-settings-title').value, 'Updated title', 'Late lesson metadata must not reset edits')
  await click(find('#editor-tab-settings'))
  await change('#test-settings-lesson', 'b')
  assert.ok(back().href.includes('lesson=b'))
  await click(find('#editor-tab-questions'))
  const contentDialog = find<HTMLDialogElement>('#editor-panel-questions dialog')
  contentDialog.showModal()
  await save()
  assert.equal(puts().length, 0, 'A native content dialog must not submit the test behind it')
  contentDialog.close()
  await click(find('#editor-tab-settings'))
  await save()
  assert.equal(puts().length, 1)
  const body = puts()[0]!.body!
  assert.equal(body.title, 'Updated title')
  assert.equal(body.groupId, 'b')
  assert.equal(body.showOverallScore, false)
  assert.equal((body.questions as DraftTest['questions'])[0]!.prompt[0]!.type, 'text')
  assert.deepEqual((body.questions as DraftTest['questions'])[0]!.prompt[0], text('prompt', 'Updated prompt'))
  assert.deepEqual((body.questions as DraftTest['questions'])[1], fixture.questions[1])
  assert.equal(find('.editor-save-state').textContent, cs.editorAllSaved)
  assert.ok(find<HTMLButtonElement>('button[form=test-editor-form]').disabled)
  await fill('#test-settings-title', 'Save in progress')
  holdSave = true
  const beforeBusy = puts().length
  await save()
  await save()
  assert.equal(puts().length, beforeBusy + 1, 'Repeated submit must not start a second write')
  assert.ok(find<HTMLFieldSetElement>('.editor-fields').disabled)
  await router.push('/elsewhere')
  assert.equal(router.currentRoute.value.name, 'test-questions', 'An in-flight save blocks leaving')
  finishSave!()
  holdSave = false
  await settle()
  assert.equal(stored.draft!.title, 'Save in progress')
  console.log('PASS AUTHOR DOM: direct settings link, delayed lesson context, tab/media preservation and one authenticated metadata/questions save')

  await fill('#test-settings-title', '   ')
  await click(find('#editor-tab-questions'))
  await save()
  assert.equal(puts().length, beforeBusy + 1)
  assert.equal(router.currentRoute.value.query.tab, 'settings', 'Invalid hidden settings must be revealed')
  await fill('#test-settings-title', 'Retry title')
  failSave = true
  await save()
  assert.equal(find<HTMLInputElement>('#test-settings-title').value, 'Retry title')
  assert.equal(find('.editor-save-state').textContent, cs.editorUnsaved)
  assert.ok(find('[role=alert]').textContent?.includes(cs.editorSaveFailed!))
  failSave = false
  await save()
  assert.equal(stored.draft!.title, 'Retry title')
  await fill('#test-settings-description', 'Local change')
  stored.draft!.updatedAt = 'another-author'
  const beforeStale = puts().length
  await save()
  assert.equal(puts().length, beforeStale)
  assert.ok(find('[role=alert]').textContent?.includes(cs.editorStaleTest!))
  const unload = new Event('beforeunload', { cancelable: true })
  window.dispatchEvent(unload)
  assert.ok(unload.defaultPrevented)
  await router.push('/elsewhere')
  assert.equal(router.currentRoute.value.name, 'test-questions')
  assert.equal(find<HTMLInputElement>('#test-settings-description').value, 'Local change')
  allowExit = true
  await router.push('/elsewhere')
  await router.push('/admin/tests/draft/questions?tab=settings&lang=cs')
  await settle()
  assert.equal(find<HTMLInputElement>('#test-settings-description').value, 'Original description')
  console.log('PASS AUTHOR DOM: hidden-tab validation, failed save retry, stale-write rejection and combined unsaved-change guards')

  await click(find('.editor-primary-actions a'))
  assert.equal(router.currentRoute.value.name, 'test-preview')
  const editorLink = [...host.querySelectorAll<HTMLAnchorElement>('a')].find(link => link.textContent?.trim() === cs.editorOpen)!
  assert.ok(editorLink.getAttribute('href')?.includes('tab=settings'))
  assert.ok(editorLink.getAttribute('href')?.startsWith('/training/admin/tests/'))
  await click(editorLink)
  assert.equal(find('#editor-tab-settings').getAttribute('aria-selected'), 'true')
  await click(find('#editor-tab-questions'))
  const matchingToggle = find<HTMLButtonElement>('#editor-question-matching .question-toggle')
  assert.equal(matchingToggle.getAttribute('aria-expanded'), 'false')
  await click(find('.editor-map-entry[aria-controls=editor-question-matching]'))
  assert.equal(matchingToggle.getAttribute('aria-expanded'), 'true')
  assert.equal(document.activeElement, matchingToggle)
  await change('#editor-question-select', 'choice')
  assert.equal(document.activeElement, find('#editor-question-choice .question-toggle'))
  assert.equal(matchingToggle.getAttribute('aria-expanded'), 'true')
  await click(back())
  assert.equal(router.currentRoute.value.query.lesson, 'b')
  assert.equal(router.currentRoute.value.query.lang, 'cs')
  assert.ok(find('#tests-heading').textContent?.includes('Lesson B'))
  assert.equal(find<HTMLSelectElement>('#catalog-lesson-select').value, 'b')
  const metadataLink = [...host.querySelectorAll<HTMLAnchorElement>('a')].find(link => link.textContent?.includes(cs.catalogEditMetadata!))!
  assert.ok(metadataLink.getAttribute('href')?.includes('tab=settings'))
  console.log('PASS AUTHOR DOM: saved-version preview return, keyboard question jumps and lesson-filter/base/language return paths')

  const renameButton = [...find('#tests-heading').parentElement!.querySelectorAll<HTMLButtonElement>('button')]
    .find(button => button.textContent?.includes(cs.catalogRenameGroup!))!
  await click(renameButton)
  const lessonDialog = find<HTMLDialogElement>('dialog[aria-labelledby=lesson-dialog-heading]')
  assert.ok(lessonDialog.open)
  assert.equal(document.activeElement, find('#lesson-dialog-name'))
  await fill('#lesson-dialog-name', 'Renamed lesson')
  failRename = true
  await submit(find<HTMLFormElement>('form', lessonDialog))
  assert.ok(lessonDialog.open)
  assert.ok(lessonDialog.querySelector('[role=alert]'))
  assert.equal(find<HTMLInputElement>('#lesson-dialog-name').value, 'Renamed lesson')
  failRename = false
  await submit(find<HTMLFormElement>('form', lessonDialog))
  assert.equal(lessonDialog.open, false)
  assert.ok(find('#tests-heading').textContent?.includes('Renamed lesson'))
  assert.equal(document.activeElement, renameButton)
  const newButton = [...host.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent?.includes(cs.adminNewTest!))!
  await click(newButton)
  const creation = find<HTMLDialogElement>('dialog[aria-labelledby=create-test-heading]')
  assert.ok(creation.open)
  assert.equal(find<HTMLSelectElement>('#test-settings-lesson').value, 'b')
  await fill('#test-settings-title', 'Created test')
  await submit(find<HTMLFormElement>('form', creation))
  assert.equal(router.currentRoute.value.params.id, 'created')
  assert.equal(find('h1').textContent, 'Created test')
  assert.equal(calls.filter(call => call.method === 'POST' && call.path === 'admin/tests').length, 1)
  assert.deepEqual(stored.created!.questions, [])
  console.log('PASS AUTHOR DOM: focused lesson rename/error/retry, selected-lesson creation dialog and direct editor handoff')

  await click(back())
  const duplicateRow = [...host.querySelectorAll<HTMLLIElement>('section[aria-labelledby=tests-heading] li')]
    .find(row => row.querySelector('a')?.textContent?.trim() === stored.draft!.title)!
  const duplicate = [...duplicateRow.querySelectorAll<HTMLButtonElement>('button')]
    .find(button => button.textContent?.includes(cs.adminDuplicate!))!
  await click(duplicate)
  assert.equal(router.currentRoute.value.params.id, 'copy')
  assert.equal(router.currentRoute.value.query.tab, 'settings')
  assert.deepEqual(stored.copy!.questions, stored.draft!.questions)
  assert.equal(find<HTMLInputElement>('#test-settings-score').checked, false)
  await click(back())
  const addLesson = [...host.querySelectorAll<HTMLButtonElement>('button')]
    .find(button => button.textContent?.includes(cs.catalogAddGroup!))!
  await click(addLesson)
  await fill('#lesson-dialog-name', 'New lesson')
  await submit(find<HTMLFormElement>('dialog[aria-labelledby=lesson-dialog-heading] form'))
  assert.equal(router.currentRoute.value.query.lesson, 'new-lesson')
  assert.ok(find('#tests-heading').textContent?.includes('New lesson'))
  assert.equal(calls.filter(call => call.method === 'POST' && call.path === 'admin/groups').length, 1)
  console.log('PASS AUTHOR DOM: duplication preserves questions/scoring and new lessons use the same focused dialog')

  await router.push('/elsewhere')
  stored.draft!.status = 'published'
  await router.push('/admin/tests/draft/questions?tab=settings&lang=cs')
  await settle()
  assert.equal(host.querySelector('button[form=test-editor-form]'), null)
  assert.ok(find<HTMLFieldSetElement>('.editor-fields').disabled)
  const beforePublished = puts().length
  await save()
  assert.equal(puts().length, beforePublished)
  const unpublish = [...host.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent?.includes(cs.adminUnpublishEdit!))!
  await click(unpublish)
  assert.equal(stored.draft!.status, 'draft')
  assert.ok(find('button[form=test-editor-form]'))
  await router.push('/elsewhere')
  failLessons = true
  await router.push('/admin/tests/draft/questions?tab=settings&lang=cs')
  await settle()
  assert.equal(find('h1').textContent, stored.draft!.title)
  assert.ok(host.textContent?.includes(cs.editorLessonsUnavailable!))
  await fill('#test-settings-title', 'Saved without lesson names')
  await save()
  assert.equal(stored.draft!.groupId, 'b')
  assert.equal(stored.draft!.title, 'Saved without lesson names')
  failLessons = false
  console.log('PASS AUTHOR DOM: published read-only settings/questions, explicit unpublish and optional lesson-list failure')

  await router.push('/elsewhere')
  heldTestId = 'draft'
  await router.push('/admin/tests/draft/questions?lang=cs')
  await settle()
  assert.ok(resolveTest)
  heldTestId = ''
  await router.push('/admin/tests/other/questions?lang=cs')
  await settle()
  resolveTest!(Response.json(stored.draft))
  await settle()
  assert.equal(find('h1').textContent, 'Other test')
  await router.push('/elsewhere')
  authenticated = false
  const beforeAnonymous = calls.length
  await router.push('/admin/tests/draft/questions?lang=cs')
  await settle()
  assert.ok(find('[role=alert]').textContent?.includes(cs.editorSignInRequired!))
  assert.equal(calls.slice(beforeAnonymous).filter(call => call.path.startsWith('admin/')).length, 0)
  assert.deepEqual(errors, [])
  console.log('PASS AUTHOR DOM: same-component route reload, late-response cancellation and authentication before protected reads')
} finally {
  app.unmount()
  host.remove()
  globalThis.fetch = previousFetch
  window.confirm = previousConfirm
}
