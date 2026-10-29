import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createApp, h, nextTick, shallowRef } from 'vue'
import { createI18n } from 'vue-i18n'
import TestRunner from '../src/components/TestRunner.vue'
import type { ChoiceQuestion, DraftTest, MatchingQuestion } from '../src/editor/model'

const text = (id: string, value: string) => ({ id, type: 'text' as const, text: value })
const choice: ChoiceQuestion = {
  id: 'choice', type: 'choice', mode: 'multiple', prompt: [text('p', 'Choose the correct signs')],
  options: ['a', 'b', 'c', 'd'].map(id => ({ id, content: [text(id, 'Option ' + id)] })),
  correctOptionIds: ['a', 'c'],
}
const mediaId = '11111111-1111-4111-8111-111111111111'
const imageId = '22222222-2222-4222-8222-222222222222'
choice.options[1]!.content.push({ id: 'clip', type: 'video', mediaId })
choice.options[3]!.content.push({ id: 'image', type: 'image', mediaId: imageId })
const matching: MatchingQuestion = {
  id: 'matching', type: 'matching', prompt: [text('mp', 'Match the signs')],
  leftItems: ['l1', 'l2', 'l3'].map(id => ({ id, content: [text(id, 'Source ' + id)] })),
  rightItems: ['r1', 'r2', 'r3'].map(id => ({ id, content: [text(id, 'Counterpart ' + id)] })),
  matches: [1, 2, 3].map(index => ({ leftId: 'l' + index, rightId: 'r' + index })),
}
const test = shallowRef<DraftTest>({
  schemaVersion: 1, id: 'test', groupId: 'lesson', language: 'cs', title: 'Test', description: '',
  status: 'published', createdAt: '', updatedAt: '', publishedAt: '',
  questions: [choice, { ...choice, id: 'correct', mode: 'single', correctOptionIds: ['b'] }, matching,
    { ...choice, id: 'missing' }],
})
const privatePreview = shallowRef(false)
const mediaUrls = shallowRef({ [mediaId]: '/training/media/example.mp4', [imageId]: '/training/media/example.jpg' })
const original = JSON.stringify(test.value)
const cs = JSON.parse(readFileSync('public/locales/cs.json', 'utf8')) as Record<string, string>
const i18n = createI18n({ legacy: false, locale: 'cs', fallbackLocale: 'en', messages: {
  cs,
  en: JSON.parse(readFileSync('public/locales/en.json', 'utf8')),
} })
// The shared runner must not post or persist responses, even after grading/retry.
let requests = 0
const previousFetch = globalThis.fetch
const previousSetItem = window.localStorage.setItem
const previousCookie = document.cookie
const previousStorage = window.localStorage.length
let storageWrites = 0
window.localStorage.setItem = () => { storageWrites++; throw new Error('Unexpected response persistence') }
globalThis.fetch = (() => { requests++; throw new Error('Unexpected runner request') }) as typeof fetch
const host = document.createElement('div')
document.body.append(host)
const app = createApp({ render: () => h(TestRunner, {
  test: test.value, privatePreview: privatePreview.value,
  mediaUrls: privatePreview.value ? {} : mediaUrls.value,
}, { context: () => h('a', { href: '/training/#lesson-lesson' }, 'Back to lesson') }) }).use(i18n)
const errors: unknown[] = []
app.config.errorHandler = error => { errors.push(error) }
app.mount(host)
const settle = async () => {
  for (let index = 0; index < 4; index++) {
    await new Promise<void>(resolve => setImmediate(resolve))
    await nextTick()
  }
}
function find<T extends Element = HTMLElement>(selector: string, parent: ParentNode = host): T {
  const element = parent.querySelector<T>(selector)
  assert.ok(element, 'Missing element: ' + selector)
  return element
}
const question = (id: string) => find<HTMLElement>('#runner-section-' + id)
const toggle = (id: string) => find<HTMLButtonElement>('.question-toggle', question(id))
const input = (id: string, option: string) => find<HTMLInputElement>('#runner-option-' + id + '-' + option)
const tile = (id: string, option: string) => input(id, option).closest<HTMLElement>('.choice-option')!
async function click(element: Element) {
  element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }))
  await settle()
}
async function choose(id: string, option: string, selected = true) {
  const control = input(id, option)
  control.checked = selected
  control.dispatchEvent(new Event('change', { bubbles: true }))
  await settle()
}
async function pair(left: string, right: string) {
  const source = [...question('matching').querySelectorAll<HTMLElement>('.left-pool .selection-card')]
    .find(card => card.textContent?.includes('Source ' + left))!
  await click(find('button[data-select]', source))
  const target = [...question('matching').querySelectorAll<HTMLElement>('.right-pool .selection-card')]
    .find(card => card.textContent?.includes('Counterpart ' + right))!
  await click(find('button[data-assign]', target))
}
async function submit() {
  find('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  await settle()
}
async function retry() { await click(find('.runner-actions button')) }

try {
  await settle()
  assert.equal(host.querySelectorAll('[data-runner-question]').length, 4)
  assert.equal(host.querySelectorAll('.question-toggle[aria-expanded=true]').length, 4)
  assert.equal(host.querySelectorAll('.status-unanswered').length, 8)
  assert.equal(find('.overview-question[aria-current=location]').getAttribute('aria-controls'), 'runner-section-choice')
  assert.ok(find('header a').getAttribute('href')?.endsWith('#lesson-lesson'))
  assert.equal(find('video').closest('label'), null)
  assert.equal(find('video').getAttribute('controls'), '')
  assert.equal(find('video').getAttribute('src'), '/training/media/example.mp4')

  // Real intrinsic dimensions arrive after media loading, independently of
  // block IDs and response state. Exercise both media types and source reuse.
  const video = find<HTMLVideoElement>('video', question('choice'))
  const image = find<HTMLImageElement>('img', question('choice'))
  const dimensions = (element: Element, width: number, height: number, image = false) => {
    Object.defineProperty(element, image ? 'naturalWidth' : 'videoWidth', { configurable: true, value: width })
    Object.defineProperty(element, image ? 'naturalHeight' : 'videoHeight', { configurable: true, value: height })
  }
  assert.equal(video.classList.contains('media-portrait'), false)
  dimensions(video, 1080, 1920)
  video.dispatchEvent(new Event('loadedmetadata'))
  dimensions(image, 900, 1600, true)
  image.dispatchEvent(new Event('load'))
  await settle()
  assert.ok(video.classList.contains('media-portrait'))
  assert.ok(image.classList.contains('media-portrait'))
  dimensions(video, 1920, 1080)
  video.dispatchEvent(new Event('resize'))
  dimensions(image, 800, 800, true)
  image.dispatchEvent(new Event('load'))
  await settle()
  assert.equal(video.classList.contains('media-portrait'), false)
  assert.equal(image.classList.contains('media-portrait'), false)
  dimensions(video, 1080, 1920)
  video.dispatchEvent(new Event('resize'))
  await settle()
  assert.ok(video.classList.contains('media-portrait'))
  mediaUrls.value = { ...mediaUrls.value, [mediaId]: '/training/media/replacement.mp4' }
  await settle()
  assert.equal(video.getAttribute('src'), '/training/media/replacement.mp4')
  assert.equal(video.classList.contains('media-portrait'), false)
  dimensions(video, 0, 0)
  video.dispatchEvent(new Event('loadedmetadata'))
  await settle()
  assert.equal(video.classList.contains('media-portrait'), false)
  dimensions(image, 600, 1000, true)
  image.dispatchEvent(new Event('load'))
  await settle()
  assert.ok(image.classList.contains('media-portrait'))
  image.dispatchEvent(new Event('error'))
  await settle()
  assert.equal(image.classList.contains('media-portrait'), false)
  console.log('PASS DOM: portrait image/video detection, landscape/square media, metadata changes and replacement/error reset')

  await choose('choice', 'a')
  assert.ok(tile('choice', 'a').classList.contains('option-selected'))
  assert.ok(toggle('choice').textContent?.includes('Zodpovězeno'))
  assert.equal(host.querySelectorAll('.option-chosen-correct, .option-correct-unselected, .status-correct').length, 0)
  await click(find('video', tile('choice', 'b')))
  assert.equal(input('choice', 'b').checked, false, 'Media controls must not select their answer')
  await click(tile('choice', 'b'))
  assert.ok(input('choice', 'b').checked)
  await choose('correct', 'b')
  await click(tile('correct', 'b'))
  assert.ok(input('correct', 'b').checked, 'A selected single-choice card stays selected')

  const clip = find<HTMLVideoElement>('video', question('choice'))
  clip.currentTime = 12
  let pauses = 0
  clip.pause = () => { pauses++ }
  await click(toggle('choice'))
  assert.equal(find<HTMLElement>('#runner-body-choice').style.display, 'none')
  assert.equal(pauses, 1)
  assert.equal(clip.currentTime, 12)
  assert.ok(input('choice', 'a').checked)
  await click(find('.overview-question[aria-controls=runner-section-choice]'))
  assert.equal(toggle('choice').getAttribute('aria-expanded'), 'true')
  assert.equal(document.activeElement, toggle('choice'))
  assert.equal(find('video', question('choice')), clip, 'Collapse/jump preserves native media nodes')
  assert.equal(clip.currentTime, 12)
  console.log('PASS DOM: continuous questions, neutral completion, native media controls, preserved answers/media and keyboard focus')

  await pair('l1', 'r1')
  assert.ok(toggle('matching').textContent?.includes('1 ze 3 dvojic'))
  assert.equal(find('.overview-desktop').textContent?.includes('Zodpovězeno 2 ze 4'), true)
  await click(toggle('matching'))
  await click(toggle('matching'))
  assert.equal(question('matching').querySelectorAll('.learner-pair').length, 1)
  await pair('l2', 'r3')
  const order = [...question('matching').querySelectorAll('.right-pool .selection-card')].map(card => card.textContent)
  i18n.global.locale.value = 'en'
  await settle()
  assert.ok(toggle('matching').textContent?.includes('2 of 3 pairs'))
  assert.ok(input('choice', 'b').checked)
  assert.deepEqual([...question('matching').querySelectorAll('.right-pool .selection-card')].map(card => card.textContent?.replace('Assign', 'Přiřadit')), order)
  i18n.global.locale.value = 'cs'
  await settle()

  // Layout is not simulated by Happy DOM. Inject only the geometry used by the
  // reading-line tracker and sticky offset; real-device pixel checks stay manual.
  const sections = [...host.querySelectorAll<HTMLElement>('[data-runner-question]')]
  const bounds = (top: number, bottom: number, height = bottom - top) => ({ top, bottom, height }) as DOMRect
  sections.forEach((section, index) => { section.getBoundingClientRect = () => bounds(index * 300 - 400, index * 300 - 100) })
  window.dispatchEvent(new Event('scroll'))
  await new Promise<void>(resolve => window.requestAnimationFrame(() => resolve()))
  await settle()
  assert.equal(find('.overview-question[aria-current=location]').getAttribute('aria-controls'), 'runner-section-correct')
  const realMatchMedia = window.matchMedia.bind(window)
  window.matchMedia = (query: string) => ({ ...realMatchMedia(query), matches: true }) as MediaQueryList
  const overview = find<HTMLElement>('.runner-overview')
  overview.getBoundingClientRect = () => bounds(0, find('.overview-mobile').getAttribute('aria-expanded') === 'true' ? 320 : 80)
  window.dispatchEvent(new Event('resize'))
  await settle()
  assert.equal(find<HTMLElement>('.test-runner').style.getPropertyValue('--runner-scroll-offset'), '96px')
  await click(find('.overview-mobile'))
  assert.equal(find('.overview-mobile').getAttribute('aria-expanded'), 'true')
  await click(toggle('missing'))
  let jumpOffset = ''
  question('missing').scrollIntoView = () => { jumpOffset = find<HTMLElement>('.test-runner').style.getPropertyValue('--runner-scroll-offset') }
  await click(find('.overview-question[aria-controls=runner-section-missing]'))
  assert.equal(find('.overview-mobile').getAttribute('aria-expanded'), 'false')
  assert.equal(jumpOffset, '96px', 'Jump uses collapsed mobile-bar height')
  assert.equal(toggle('missing').getAttribute('aria-expanded'), 'true')
  assert.equal(document.activeElement, toggle('missing'))
  await click(find('.overview-mobile'))
  find('.overview-question').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
  await settle()
  assert.equal(find('.overview-mobile').getAttribute('aria-expanded'), 'false')
  assert.equal(document.activeElement, find('.overview-mobile'))
  window.matchMedia = realMatchMedia
  window.dispatchEvent(new Event('resize'))
  await settle()
  assert.equal(find<HTMLElement>('.test-runner').style.getPropertyValue('--runner-scroll-offset'), '16px')
  console.log('PASS DOM: partial matching, stable attempt/locale, scroll tracking, mobile jump offset, expansion and Escape focus')

  await click(toggle('choice'))
  await submit()
  assert.equal(document.activeElement, find('#runner-summary-heading'))
  assert.ok(find('#runner-summary-heading').textContent?.includes('Správně zodpovězené otázky: 1 ze 4'))
  assert.equal(/\bbod\w*\b/.test(host.textContent ?? ''), false)
  assert.ok(question('choice').classList.contains('result-incorrect'))
  assert.ok(question('correct').classList.contains('result-correct'))
  assert.ok(question('missing').classList.contains('result-unanswered'))
  assert.equal(toggle('choice').getAttribute('aria-expanded'), 'false', 'Grading preserves manual collapse')
  assert.ok(tile('choice', 'a').classList.contains('option-chosen-correct'))
  assert.ok(tile('choice', 'b').classList.contains('option-chosen-incorrect'))
  assert.ok(tile('choice', 'c').classList.contains('option-correct-unselected'))
  assert.ok(tile('choice', 'd').classList.contains('option-neutral'))
  assert.ok(tile('choice', 'a').textContent?.includes('Vaše volba – správně'))
  assert.ok(tile('choice', 'b').textContent?.includes('Vaše volba – nesprávně'))
  assert.ok(tile('choice', 'c').textContent?.includes('Správná možnost – nezvoleno'))
  assert.ok([...host.querySelectorAll<HTMLInputElement>('input')].every(control => control.disabled))
  assert.equal(question('matching').querySelectorAll('.pair-correct').length, 1)
  assert.equal(question('matching').querySelectorAll('.pair-incorrect').length, 1)
  assert.equal(question('matching').querySelectorAll('.pair-unanswered').length, 1)
  const wrong = find('.pair-incorrect', question('matching'))
  assert.ok(wrong.textContent?.includes('Counterpart r3'))
  const counterpartColumn = find('.pair-counterparts', wrong)
  assert.ok(find('.paired-content', counterpartColumn).textContent?.includes('Counterpart r3'))
  assert.ok(find('.pair-correction', counterpartColumn).textContent?.includes('Counterpart r2'))
  assert.equal(find('.pair-correction', wrong).parentElement, counterpartColumn)
  assert.equal(find('.paired-row', wrong).lastElementChild, counterpartColumn)
  assert.ok(find('.pair-unanswered .pair-correction', question('matching')).textContent?.includes('Counterpart r3'))
  await click(tile('choice', 'd'))
  assert.equal(input('choice', 'd').checked, false)
  assert.equal(JSON.stringify(test.value), original)
  await retry()
  assert.equal(host.querySelector('.runner-summary'), null)
  assert.equal(host.querySelectorAll('input:checked').length, 0)
  assert.equal(host.querySelectorAll('.question-toggle[aria-expanded=true]').length, 4)
  assert.equal(question('matching').querySelectorAll('.learner-pair').length, 0)
  assert.equal(document.activeElement, toggle('choice'))
  console.log('PASS DOM: exact grading, selected/missed correct answers, neutral missing responses, pair corrections, locking and retry')

  test.value = { ...test.value, showOverallScore: false }
  await settle()
  await choose('correct', 'b')
  await submit()
  assert.equal(find('#runner-summary-heading').textContent?.trim(), 'Test je vyhodnocen')
  assert.equal(/\bbod\w*\b|\bpoint\w*\b|Správně zodpovězené otázky/.test(host.textContent ?? ''), false)
  assert.ok(question('correct').classList.contains('result-correct'))
  assert.ok(tile('correct', 'b').textContent?.includes('Vaše volba – správně'))
  assert.equal(question('matching').textContent?.includes(cs.runnerNoPairsYet!), false)
  assert.ok(toggle('missing').textContent?.includes(cs.runnerQuestionUnansweredNoScore!))

  privatePreview.value = true
  test.value = { ...test.value, status: 'draft', questions: [{ ...choice, correctOptionIds: [] }, { ...matching, matches: [] }] }
  await settle()
  assert.equal(find('video').getAttribute('src'), '/training/api/admin/media/' + mediaId + '/preview')
  await choose('choice', 'a')
  await submit()
  assert.equal(host.querySelectorAll('.result-ungraded').length, 2)
  assert.equal(host.querySelectorAll('.pair-correct, .pair-incorrect, .option-chosen-correct, .option-chosen-incorrect, .option-correct-unselected').length, 0)
  assert.ok(tile('choice', 'a').classList.contains('option-selected'))
  assert.ok(host.textContent?.includes(cs.runnerMissingAnswerKey!))
  test.value = { ...test.value, questions: [] }
  await settle()
  assert.equal(host.querySelector('.runner-overview'), null)
  assert.equal(host.querySelector('.runner-actions'), null)
  assert.ok(host.textContent?.includes(cs.runnerEmptyDraft!))
  assert.equal(requests, 0)
  assert.equal(storageWrites, 0)
  assert.equal(window.localStorage.length, previousStorage)
  assert.equal(document.cookie, previousCookie)
  assert.deepEqual(errors, [])
  console.log('PASS DOM: hidden score/aggregate results, protected preview, invalid keys, empty drafts and no requests/persistence')
} finally {
  app.unmount()
  host.remove()
  globalThis.fetch = previousFetch
  window.localStorage.setItem = previousSetItem
}
