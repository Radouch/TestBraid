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
// Descriptions reach learners as the image's alt and the video's accessible name;
// a description of only spaces counts as none.
choice.options[1]!.content.push({ id: 'clip', type: 'video', mediaId, alt: '   ' })
choice.options[3]!.content.push({ id: 'image', type: 'image', mediaId: imageId, alt: 'A stop sign' })
const matching: MatchingQuestion = {
  id: 'matching', type: 'matching', prompt: [text('mp', 'Match the signs')],
  leftItems: ['l1', 'l2', 'l3'].map(id => ({ id, content: [text(id, 'Source ' + id)] })),
  rightItems: ['r1', 'r2', 'r3'].map(id => ({ id, content: [text(id, 'Counterpart ' + id)] })),
  matches: [1, 2, 3].map(index => ({ leftId: 'l' + index, rightId: 'r' + index })),
}
// Text-only options are laid out one per row; options with media two per row.
const textOnly: ChoiceQuestion = {
  id: 'text', type: 'choice', mode: 'single', prompt: [text('tp', 'Pick a word')],
  options: ['x', 'y', 'z'].map(id => ({ id, content: [text(id, 'Word ' + id)] })),
  correctOptionIds: ['x'],
}
// Six questions: the question overview appears from OVERVIEW_MIN_QUESTIONS (6) on.
const test = shallowRef<DraftTest>({
  schemaVersion: 1, id: 'test', groupId: 'lesson', language: 'cs', title: 'Test', description: '',
  status: 'published', createdAt: '', updatedAt: '', publishedAt: '',
  questions: [choice, { ...choice, id: 'correct', mode: 'single', correctOptionIds: ['b'] }, matching,
    { ...choice, id: 'missing' }, textOnly, { ...textOnly, id: 'last' }],
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
}, { 'results-actions': () => h('a', { href: '/training/#lesson-lesson', class: 'results-back' }, 'Back to lesson') }) }).use(i18n)
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
const heading = (id: string) => find<HTMLElement>('.question-position', question(id))
const status = (id: string) => find<HTMLElement>('.question-header .question-status', question(id))
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
  assert.equal(host.querySelectorAll('[data-runner-question]').length, 6)
  assert.equal(host.querySelectorAll('.runner-question [aria-expanded]').length, 0, 'Question cards cannot collapse')
  assert.equal(heading('choice').id, question('choice').getAttribute('aria-labelledby'))
  assert.equal(host.querySelectorAll('.status-unanswered').length, 12)
  assert.equal(host.querySelectorAll('.status-unanswered .app-icon').length, 0, 'Unanswered has no radio-like icon')
  assert.equal(status('choice').textContent?.trim(), 'Nezodpovězeno')
  // The "Remaining to match" instructions are enough; no separate "no pairs yet" line.
  assert.equal(question('matching').textContent?.includes('Zatím nemáte žádné dvojice'), false)
  assert.equal(find('.overview-question[aria-current=location]').getAttribute('aria-controls'), 'runner-section-choice')
  assert.equal(host.querySelector('header a'), null, 'The test header has no lesson line')
  assert.equal(host.querySelector('.results-back'), null, 'Page actions appear only with the results')
  assert.equal(find('video').closest('label'), null)
  assert.equal(find('video').getAttribute('controls'), '')
  assert.equal(find('video').getAttribute('src'), '/training/media/example.mp4')
  assert.equal(find('img', question('choice')).getAttribute('alt'), 'A stop sign')
  assert.equal(find('video', question('choice')).hasAttribute('aria-label'), false)

  // Options show a letter; the input's accessible name is "Odpověď A" plus the option content.
  const labelledBy = input('choice', 'a').getAttribute('aria-labelledby')?.split(' ') ?? []
  assert.deepEqual(labelledBy, ['runner-option-label-choice-a', 'runner-option-content-choice-a'])
  const letter = find('#' + labelledBy[0])
  assert.equal(letter.tagName, 'LABEL')
  assert.equal(letter.getAttribute('for'), 'runner-option-choice-a')
  assert.equal(find('[aria-hidden=true]', letter).textContent, 'A')
  assert.equal(find('.visually-hidden', letter).textContent, 'Odpověď A')
  assert.equal(find('#' + labelledBy[1]).textContent?.trim(), 'Option a')
  assert.equal(find('.visually-hidden', find('#runner-option-label-choice-d')).textContent, 'Odpověď D')
  assert.ok(find('.choice-options', question('choice')).classList.contains('choice-options-media'))
  assert.equal(find('.choice-options', question('text')).classList.contains('choice-options-media'), false)

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
  assert.equal(status('choice').textContent?.trim(), 'Zodpovězeno')
  assert.ok(status('choice').classList.contains('status-answered'))
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
  await click(find('.overview-question[aria-controls=runner-section-choice]'))
  assert.equal(document.activeElement, heading('choice'))
  assert.equal(find('video', question('choice')), clip, 'Jumping preserves native media nodes')
  assert.equal(clip.currentTime, 12)
  assert.equal(pauses, 0, 'Navigation does not stop playback')
  assert.ok(input('choice', 'a').checked)
  console.log('PASS DOM: continuous questions, neutral completion, native media controls, preserved answers/media and keyboard focus')

  await pair('l1', 'r1')
  assert.ok(status('matching').textContent?.includes('1 ze 3 dvojic'))
  assert.equal(find('.overview-desktop').textContent?.includes('Zodpovězeno 2 ze 6'), true)
  assert.equal(find('.runner-progress').textContent?.trim(), 'Zodpovězeno 2 ze 6')
  assert.equal(question('matching').querySelectorAll('.learner-pair').length, 1)
  await pair('l2', 'r3')
  const order = [...question('matching').querySelectorAll('.right-pool .selection-card')].map(card => card.textContent)
  i18n.global.locale.value = 'en'
  await settle()
  assert.ok(status('matching').textContent?.includes('2 of 3 pairs'))
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
  let jumpOffset = ''
  question('missing').scrollIntoView = () => { jumpOffset = find<HTMLElement>('.test-runner').style.getPropertyValue('--runner-scroll-offset') }
  await click(find('.overview-question[aria-controls=runner-section-missing]'))
  assert.equal(find('.overview-mobile').getAttribute('aria-expanded'), 'false')
  assert.equal(jumpOffset, '96px', 'Jump uses collapsed mobile-bar height')
  assert.equal(document.activeElement, heading('missing'))
  await click(find('.overview-mobile'))
  find('.overview-question').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
  await settle()
  assert.equal(find('.overview-mobile').getAttribute('aria-expanded'), 'false')
  assert.equal(document.activeElement, find('.overview-mobile'))
  window.matchMedia = realMatchMedia
  window.dispatchEvent(new Event('resize'))
  await settle()
  assert.equal(find<HTMLElement>('.test-runner').style.getPropertyValue('--runner-scroll-offset'), '16px')
  console.log('PASS DOM: partial matching, stable attempt/locale, scroll tracking, mobile jump offset and Escape focus')

  await submit()
  assert.equal(document.activeElement, find('#runner-summary-heading'))
  assert.ok(pauses > 0, 'Checking answers pauses playback')
  assert.ok(find('#runner-summary-heading').textContent?.includes('Správně zodpovězené otázky: 1 ze 6'))
  // The large score is visual only; the heading's sentence is what screen readers hear.
  assert.equal(find('.summary-score').textContent, '1 / 6')
  assert.equal(find('.summary-score').getAttribute('aria-hidden'), 'true')
  assert.equal(find('.visually-hidden', find('#runner-summary-heading')).textContent, 'Správně zodpovězené otázky: 1 ze 6')
  assert.ok(find('.summary-actions .results-back').getAttribute('href')?.endsWith('#lesson-lesson'))
  assert.ok(find('.summary-actions').textContent?.includes('Zkusit znovu'))
  assert.equal(host.querySelector('.runner-progress'), null)
  assert.equal(/\bbod\w*\b/.test(host.textContent ?? ''), false)
  assert.ok(question('choice').classList.contains('result-incorrect'))
  assert.ok(question('correct').classList.contains('result-correct'))
  assert.ok(question('missing').classList.contains('result-unanswered'))
  // Status tags end without a full stop; only results with a meaning carry an icon.
  assert.equal(status('choice').textContent?.trim(), 'Nesprávně')
  assert.equal(find('.app-icon', status('choice')).dataset.icon, 'x-lg')
  assert.equal(status('correct').textContent?.trim(), 'Správně')
  assert.equal(find('.app-icon', status('correct')).dataset.icon, 'check-lg')
  assert.equal(status('missing').textContent?.trim(), 'Bez odpovědi')
  assert.equal(status('missing').querySelector('.app-icon'), null)
  assert.ok(tile('choice', 'a').classList.contains('option-chosen-correct'))
  assert.ok(tile('choice', 'b').classList.contains('option-chosen-incorrect'))
  assert.ok(tile('choice', 'c').classList.contains('option-correct-unselected'))
  assert.ok(tile('choice', 'd').classList.contains('option-neutral'))
  assert.ok(tile('choice', 'a').textContent?.includes('Vaše volba – správně'))
  assert.ok(tile('choice', 'b').textContent?.includes('Vaše volba – nesprávně'))
  assert.ok(tile('choice', 'c').textContent?.includes('Správná možnost – nezvoleno'))
  // A missed correct answer has its own icon, distinct from a correct choice.
  assert.equal(find('.option-feedback .app-icon', tile('choice', 'c')).dataset.icon, 'exclamation-circle')
  assert.equal(find('.option-feedback .app-icon', tile('choice', 'a')).dataset.icon, 'check-lg')
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
  // "Review mistakes" jumps to the first wrong or unanswered question.
  assert.ok(find('[data-review-mistakes]').textContent?.includes('Projít chyby'))
  await click(find('[data-review-mistakes]'))
  assert.equal(document.activeElement, heading('choice'))
  assert.equal(JSON.stringify(test.value), original)
  await retry()
  assert.equal(host.querySelector('.runner-summary'), null)
  assert.equal(host.querySelectorAll('input:checked').length, 0)
  assert.equal(question('matching').querySelectorAll('.learner-pair').length, 0)
  assert.equal(document.activeElement, heading('choice'))
  console.log('PASS DOM: exact grading, results summary, review of mistakes, selected/missed correct answers, neutral missing responses, pair corrections, locking and retry')

  test.value = { ...test.value, showOverallScore: false }
  await settle()
  await choose('correct', 'b')
  await submit()
  assert.equal(find('#runner-summary-heading').textContent?.trim(), 'Test je vyhodnocen')
  assert.equal(host.querySelector('.summary-score'), null)
  assert.equal(/\bbod\w*\b|\bpoint\w*\b|Správně zodpovězené otázky/.test(host.textContent ?? ''), false)
  assert.ok(question('correct').classList.contains('result-correct'))
  assert.ok(tile('correct', 'b').textContent?.includes('Vaše volba – správně'))
  assert.equal(question('matching').textContent?.includes('Zatím nemáte žádné dvojice'), false)
  assert.equal(status('missing').textContent?.trim(), cs.runnerQuestionUnansweredNoScore)

  // Without mistakes there is nothing to review, but the attempt can still be repeated.
  test.value = { ...test.value, showOverallScore: true, questions: [textOnly] }
  await settle()
  await choose('text', 'x')
  await submit()
  assert.equal(find('.summary-score').textContent, '1 / 1')
  assert.equal(host.querySelector('[data-review-mistakes]'), null)
  assert.ok(find('.summary-actions').textContent?.includes('Zkusit znovu'))

  privatePreview.value = true
  test.value = { ...test.value, status: 'draft', questions: [{ ...choice, correctOptionIds: [] }, { ...matching, matches: [] }] }
  await settle()
  assert.equal(host.querySelector('.runner-overview'), null, 'Short tests have no question overview')
  assert.equal(find('.runner-progress').textContent?.trim(), 'Zodpovězeno 0 ze 2')
  assert.equal(find('video').getAttribute('src'), '/training/api/admin/media/' + mediaId + '/preview')
  await choose('choice', 'a')
  await submit()
  assert.equal(host.querySelectorAll('.result-ungraded').length, 2)
  assert.equal(host.querySelector('[data-review-mistakes]'), null, 'Ungradable questions are not mistakes')
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
