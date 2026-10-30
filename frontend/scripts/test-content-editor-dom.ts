import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createApp, h, nextTick, reactive, ref } from 'vue'
import { createI18n } from 'vue-i18n'
import QuestionEditor from '../src/components/QuestionEditor.vue'
import ContentBlocksEditor from '../src/components/ContentBlocksEditor.vue'
import { move, type ChoiceQuestion, type ContentBlock, type MatchingQuestion } from '../src/editor/model'

const cs = JSON.parse(readFileSync('public/locales/cs.json', 'utf8')) as Record<string, string>
const en = JSON.parse(readFileSync('public/locales/en.json', 'utf8')) as Record<string, string>
const text = (id: string, value: string) => ({ id, type: 'text' as const, text: value })
const videoId = '11111111-1111-4111-8111-111111111111'
const imageId = '22222222-2222-4222-8222-222222222222'
const replacementId = '33333333-3333-4333-8333-333333333333'
const otherLessonId = '44444444-4444-4444-8444-444444444444'
const choice = reactive<ChoiceQuestion>({
  id: 'choice', type: 'choice', mode: 'single',
  prompt: [text('prompt-start', 'Watch the clip'), { id: 'clip', type: 'video', mediaId: videoId },
    text('prompt-end', 'Choose the matching answer'), { id: 'photo', type: 'image', mediaId: imageId }],
  options: [{ id: 'yes', content: [text('yes-text', 'Yes'), { id: 'answer-clip', type: 'video', mediaId: videoId }] },
    { id: 'no', content: [text('no-text', 'No')] }], correctOptionIds: ['yes'],
})
const matching = reactive<MatchingQuestion>({
  id: 'matching', type: 'matching', prompt: [text('matching-prompt', 'Match the greetings')],
  leftItems: ['l1', 'l2'].map(id => ({ id, content: [text(id + '-text', 'Left ' + id)] })),
  rightItems: ['r1', 'r2'].map(id => ({ id, content: [text(id + '-text', 'Right ' + id)] })),
  matches: [{ leftId: 'l1', rightId: 'r2' }, { leftId: 'l2', rightId: 'r1' }],
})
const empty = ref<ContentBlock[]>([])
const locked = ref(false)
const i18n = createI18n({ legacy: false, locale: 'cs', fallbackLocale: 'en', warnHtmlMessage: false, messages: { cs, en } })
const media = [
  { id: videoId, kind: 'video', originalName: 'Original.mp4', groupId: 'lesson' },
  { id: imageId, kind: 'image', originalName: 'Photo.jpg', groupId: 'lesson' },
  { id: replacementId, kind: 'video', originalName: 'Replacement.mp4', groupId: 'lesson' },
  { id: otherLessonId, kind: 'video', originalName: 'Other lesson.mp4', groupId: 'other' },
]
const previousFetch = globalThis.fetch
const calls: Array<{ path: string; signal?: AbortSignal | null }> = []
let failMedia = false
let holdMedia = false
let resolveMedia: ((response: Response) => void) | undefined
globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const path = String(input).replace('/training/api/', '')
  assert.equal(init?.method ?? 'GET', 'GET', 'Local composition must not publish, save or delete files')
  assert.equal(init?.credentials, 'same-origin')
  assert.equal(init?.cache, 'no-store')
  calls.push({ path, signal: init?.signal })
  if (path === 'admin/media') {
    if (holdMedia) return new Promise<Response>(resolve => { resolveMedia = resolve })
    return failMedia ? Response.json({}, { status: 503 }) : Response.json({ media })
  }
  if (path === 'admin/groups') return Response.json({ groups: [{ id: 'lesson', name: 'Lesson' }, { id: 'other', name: 'Other lesson' }] })
  if (path === 'admin/media/limits') return Response.json({ imageMaxBytes: 10485760, videoMaxBytes: 104857600,
    phpUploadMaxBytes: null, phpPostMaxBytes: null, warnings: [] })
  throw new Error('Unexpected content-editor request: ' + path)
}) as typeof fetch

const host = document.createElement('div')
document.body.append(host)
const errors: unknown[] = []
const app = createApp({ render: () => h('fieldset', { disabled: locked.value }, [
  h(QuestionEditor, { question: choice, csrfToken: 'csrf', groupId: 'lesson', index: 0, total: 2, initiallyExpanded: true }),
  h(QuestionEditor, { question: matching, csrfToken: 'csrf', groupId: 'lesson', index: 1, total: 2, initiallyExpanded: false }),
  h('div', { class: 'empty-composer' }, [h(ContentBlocksEditor, { modelValue: empty.value, csrfToken: 'csrf', groupId: 'lesson', label: 'Empty content',
    'onUpdate:modelValue': (value: ContentBlock[]) => { empty.value = value } })]),
]) }).use(i18n)
app.config.errorHandler = error => errors.push(error)
app.mount(host)
const settle = async () => {
  for (let index = 0; index < 5; index++) { await new Promise<void>(resolve => setImmediate(resolve)); await nextTick() }
}
function find<T extends Element = HTMLElement>(selector: string, parent: ParentNode = host): T {
  const element = parent.querySelector<T>(selector)
  assert.ok(element, 'Missing element: ' + selector)
  return element
}
async function click(element: Element): Promise<void> {
  element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }))
  await settle()
}
async function menu(selector: string, parent: ParentNode = host): Promise<HTMLDetailsElement> {
  const details = find<HTMLDetailsElement>(selector, parent)
  find<HTMLElement>('summary', details).focus()
  // Native details owns disclosure activation. Exercise Vue's toggle handler
  // with the same DOM state/event rather than emulating browser key defaults.
  details.open = true
  details.dispatchEvent(new Event('toggle'))
  await settle()
  assert.ok(details.querySelector('.editor-menu-panel'))
  return details
}
function button(label: string, parent: ParentNode): HTMLButtonElement {
  const element = [...parent.querySelectorAll<HTMLButtonElement>('button')].find(item => item.textContent?.trim() === label)
  assert.ok(element, 'Missing button: ' + label)
  return element
}
async function fill(input: HTMLTextAreaElement, value: string): Promise<void> {
  input.value = value
  input.dispatchEvent(new Event('input', { bubbles: true }))
  await settle()
}
const question = (id: string) => find<HTMLElement>('.question-card[aria-label="'
  + i18n.global.t('editorQuestionNumber', { index: id === 'choice' ? 1 : 2 }) + '"]')
const block = (id: string) => find<HTMLElement>('[data-block-id="' + id + '"]')
const prompt = () => find<HTMLElement>('.question-prompt .content-composer', question('choice'))
const option = (id: string) => find<HTMLElement>('[data-option-id="' + id + '"]')
const correct = (id: string) => find<HTMLInputElement>('#correct-' + id)
const snapshot = () => JSON.stringify({ choice, matching, empty: empty.value })

try {
  await settle()
  const initial = snapshot()
  assert.equal(calls.length, 0, 'Opening the editor does not enumerate private media')
  assert.ok(find('.question-state', question('choice')).textContent?.includes(cs.editorComplete!))
  assert.equal(find('.question-state', question('choice')).classList.contains('text-bg-success'), false)
  assert.equal(host.querySelectorAll('.block-tools, .block-insertion').length, 0)
  const video = find<HTMLVideoElement>('video', block('clip'))
  assert.equal(video.getAttribute('src'), '/training/api/admin/media/' + videoId + '/preview')
  assert.equal(video.getAttribute('controls'), '')
  assert.equal(video.closest('label, button'), null, 'Playback is separate from correct-answer selection')
  const answerVideo = find('video', option('yes'))
  await click(answerVideo)
  assert.deepEqual(choice.correctOptionIds, ['yes'])
  const dimensions = (element: Element, width: number, height: number, image = false) => {
    Object.defineProperty(element, image ? 'naturalWidth' : 'videoWidth', { configurable: true, value: width })
    Object.defineProperty(element, image ? 'naturalHeight' : 'videoHeight', { configurable: true, value: height })
  }
  dimensions(video, 1080, 1920)
  video.dispatchEvent(new Event('loadedmetadata'))
  const image = find<HTMLImageElement>('img', block('photo'))
  dimensions(image, 900, 1600, true)
  image.dispatchEvent(new Event('load'))
  await settle()
  assert.ok(video.classList.contains('media-portrait'))
  assert.ok(image.classList.contains('media-portrait'))
  video.currentTime = 3
  const collapse = find('.question-toggle', question('choice'))
  await click(collapse)
  assert.equal(find<HTMLElement>('#question-body-choice').style.display, 'none')
  await click(collapse)
  assert.equal(find('video', block('clip')), video)
  assert.equal(video.currentTime, 3)
  assert.equal(snapshot(), initial, 'Opening/closing cards and measuring media never rewrites content or answer keys')
  console.log('PASS CONTENT DOM: neutral completeness, separate prompt/answers, private portrait previews and retained collapsed media')

  // Every chosen picture or video gets a description field; clearing it removes the property.
  const altInput = find<HTMLInputElement>('#alt-photo', block('photo'))
  assert.equal(find(`label[for="alt-photo"]`, block('photo')).textContent?.trim(), cs.editorAltText)
  assert.equal(find('#' + altInput.getAttribute('aria-describedby')).textContent?.trim(), cs.editorAltHelp_image)
  assert.equal(altInput.maxLength, 500)
  assert.ok(find('#alt-clip', block('clip')))
  const photo = () => choice.prompt.find(item => item.id === 'photo')!
  altInput.value = 'A maple leaf'
  altInput.dispatchEvent(new Event('input', { bubbles: true }))
  await settle()
  const described = photo()
  assert.equal(described.type !== 'text' ? described.alt : undefined, 'A maple leaf')
  altInput.value = ''
  altInput.dispatchEvent(new Event('input', { bubbles: true }))
  await settle()
  assert.equal('alt' in photo(), false, 'An emptied description is not stored')
  assert.equal(snapshot(), initial)
  console.log('PASS CONTENT DOM: description fields for pictures and videos, stored on the block and removed when emptied')

  let actions = await menu('.block-actions', block('prompt-start'))
  assert.ok(find<HTMLButtonElement>('.move-block-up', actions).disabled)
  await click(find('[data-insert-kind=text]', actions))
  const inserted = choice.prompt[0]!
  assert.equal(inserted.type, 'text')
  assert.notEqual(inserted.id, 'prompt-start')
  assert.equal(document.activeElement, find('#text-' + inserted.id))
  await fill(find<HTMLTextAreaElement>('#text-' + inserted.id), 'Inserted before the first block')
  actions = await menu('.block-actions', block(inserted.id))
  await click(find('svg', find('.move-block-down', actions)))
  assert.equal(choice.prompt[1]!.id, inserted.id)
  assert.equal(document.activeElement, find('summary', block(inserted.id)))
  actions = await menu('.block-actions', block(inserted.id))
  await click(find('.remove-block', actions))
  assert.equal(choice.prompt.some(item => item.id === inserted.id), false)
  assert.equal(document.activeElement, find('.replace-media', block('clip')))
  actions = await menu('.block-actions', block('clip'))
  await click(find('[data-insert-kind=text]', actions))
  const middle = choice.prompt[1]!
  assert.equal(choice.prompt[2]!.id, 'clip')
  assert.equal(middle.type, 'text')
  actions = await menu('.append-content', prompt())
  await click(find('[data-insert-kind=text]', actions))
  assert.equal(choice.prompt.at(-1)!.type, 'text')
  assert.equal(document.activeElement, find('#text-' + choice.prompt.at(-1)!.id))
  assert.equal(new Set(choice.prompt.map(item => item.id)).size, choice.prompt.length)
  console.log('PASS CONTENT DOM: insertion at the start/between/after blocks, stable-ID movement, nested icon actions and removal focus')

  const beforeCancel = snapshot()
  actions = await menu('.block-actions', block('clip'))
  await click(find('[data-insert-kind=video]', actions))
  const dialog = find<HTMLDialogElement>('dialog[open]')
  assert.equal(dialog.open, true)
  assert.deepEqual(errors, [])
  assert.ok(dialog.contains(document.activeElement), 'A menu action must not move focus out of the modal it opens')
  assert.equal(find<HTMLSelectElement>('select', dialog).value, 'lesson')
  assert.ok(dialog.textContent?.includes('Replacement.mp4'))
  assert.equal(dialog.textContent?.includes('Other lesson.mp4'), false)
  assert.equal(find('input[data-upload-boundary]', dialog).getAttribute('accept'), 'video/mp4,video/webm')
  await click(find('button[aria-label="' + cs.catalogCancel + '"]', dialog))
  assert.equal(snapshot(), beforeCancel)
  assert.equal(document.activeElement, find('summary', block('clip')))

  find<HTMLButtonElement>('.replace-media', block('clip')).focus()
  await click(find('.replace-media', block('clip')))
  const replacementDialog = find<HTMLDialogElement>('dialog[open]')
  const lessonSelect = find<HTMLSelectElement>('select', replacementDialog)
  lessonSelect.value = '__all__'
  lessonSelect.dispatchEvent(new Event('change', { bubbles: true }))
  await settle()
  assert.ok(replacementDialog.textContent?.includes('Other lesson.mp4'))
  choice.prompt = move(choice.prompt, choice.prompt.findIndex(item => item.id === 'clip'), 1)
  await settle()
  await click([...replacementDialog.querySelectorAll<HTMLButtonElement>('button')].find(item => item.textContent?.includes('Replacement.mp4'))!)
  const replaced = choice.prompt.find(item => item.id === 'clip')!
  assert.equal(replaced.type !== 'text' && replaced.mediaId, replacementId)
  assert.equal(find('video', block('clip')), video)
  assert.equal(video.classList.contains('media-portrait'), false, 'Orientation resets when an existing block selects another source')
  assert.equal(document.activeElement, find('.replace-media', block('clip')))
  const anchorIndex = choice.prompt.findIndex(item => item.id === 'clip')
  actions = await menu('.block-actions', block('clip'))
  await click(find('[data-insert-kind=image]', actions))
  const imageDialog = find<HTMLDialogElement>('dialog[open]')
  assert.equal(find('input[data-upload-boundary]', imageDialog).getAttribute('accept'), 'image/jpeg,image/png,image/webp')
  assert.equal(imageDialog.textContent?.includes('Replacement.mp4'), false, 'The picker enforces its intended media kind')
  await click([...imageDialog.querySelectorAll<HTMLButtonElement>('button')].find(item => item.textContent?.includes('Photo.jpg'))!)
  assert.equal(choice.prompt[anchorIndex]!.type, 'image')
  assert.equal(choice.prompt[anchorIndex + 1]!.id, 'clip')
  assert.equal(snapshot().includes('/training/api/'), false, 'Preview URLs never enter canonical content')
  console.log('PASS CONTENT DOM: kind/lesson-aware media selection, insertion cancellation, modal focus and replacement by stable block ID')

  await click(correct('no'))
  assert.deepEqual(choice.correctOptionIds, ['no'])
  assert.ok(option('no').classList.contains('answer-correct'))
  assert.equal(option('yes').classList.contains('answer-correct'), false)
  const mode = find<HTMLSelectElement>('#mode-choice')
  mode.value = 'multiple'
  mode.dispatchEvent(new Event('change', { bubbles: true }))
  await settle()
  await click(correct('yes'))
  assert.deepEqual(choice.correctOptionIds, ['no', 'yes'])
  actions = await menu('.answer-actions', option('yes'))
  await click(button(cs.editorMoveDown!, actions))
  assert.deepEqual(choice.options.map(item => item.id), ['no', 'yes'])
  assert.deepEqual(choice.correctOptionIds, ['no', 'yes'])
  mode.value = 'single'
  mode.dispatchEvent(new Event('change', { bubbles: true }))
  await settle()
  assert.deepEqual(choice.correctOptionIds, ['no'])
  actions = await menu('.answer-actions', option('no'))
  await click(button(cs.editorRemoveOption!, actions))
  assert.deepEqual(choice.correctOptionIds, [])
  assert.equal(document.activeElement, correct('yes'))
  assert.ok(find('.question-state', question('choice')).textContent?.includes(cs.editorIncomplete!))
  console.log('PASS CONTENT DOM: explicit correct-answer controls, single/multiple modes and ID-based keys through movement/deletion')

  const beforeMatching = JSON.stringify(matching)
  await click(find('.question-toggle', question('matching')))
  assert.equal(JSON.stringify(matching), beforeMatching, 'Projecting saved pairs is read-only')
  const firstPair = find<HTMLElement>('[data-pair-id=l1]')
  assert.ok(firstPair.textContent?.includes(cs.editorLeftItem!))
  assert.ok(firstPair.textContent?.includes(cs.editorRightItem!))
  assert.equal([...firstPair.querySelectorAll<HTMLTextAreaElement>('textarea')].map(input => input.value).join('|'), 'Left l1|Right r2')
  actions = await menu('.pair-header .editor-menu', firstPair)
  await click(button(cs.editorRemovePair!, actions))
  assert.deepEqual(matching.leftItems.map(item => item.id), ['l2'])
  assert.deepEqual(matching.rightItems.map(item => item.id), ['r1'])
  assert.deepEqual(matching.matches, [{ leftId: 'l2', rightId: 'r1' }])
  assert.equal(document.activeElement, find('[data-pair-id=l2] summary'))
  matching.matches = []
  await settle()
  assert.ok(question('matching').textContent?.includes(cs.editorUnconfirmedPair!))
  assert.deepEqual(matching.matches, [])
  await click(button(cs.editorConfirmPair!, question('matching')))
  assert.deepEqual(matching.matches, [{ leftId: 'l2', rightId: 'r1' }])
  matching.rightItems = []
  matching.matches = []
  await settle()
  await click(button(cs.editorCompleteRight!, question('matching')))
  assert.equal(matching.rightItems.length, 1)
  assert.equal(matching.matches[0]!.leftId, 'l2')
  assert.equal(matching.matches[0]!.rightId, matching.rightItems[0]!.id)
  assert.equal(matching.leftItems[0]!.content[0]!.id, 'l2-text')
  console.log('PASS CONTENT DOM: matching pair labels, crossed-key removal and deliberate legacy confirmation/completion')

  actions = await menu('.append-content', find('.empty-composer'))
  await click(find('[data-insert-kind=text]', actions))
  assert.equal(empty.value.length, 1)
  actions = await menu('.block-actions', find('.empty-composer'))
  await click(find('.remove-block', actions))
  assert.equal(empty.value.length, 0)
  assert.equal(document.activeElement, find('.empty-composer .append-content summary'))
  failMedia = true
  actions = await menu('.append-content', find('.empty-composer'))
  await click(find('[data-insert-kind=video]', actions))
  assert.ok(find('dialog[open]').textContent?.includes(cs.mediaLibraryUnavailable!))
  assert.ok(find('dialog[open]').textContent?.includes(cs.mediaUploadTitle!), 'Library failures must retain the upload adapter')
  assert.deepEqual(empty.value, [])
  find<HTMLDialogElement>('dialog[open]').close()
  await settle()
  failMedia = false

  actions = await menu('.block-actions', block('prompt-start'))
  const summary = find<HTMLElement>('summary', actions)
  find('button', actions).dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
  await settle()
  assert.equal(actions.open, false)
  assert.equal(document.activeElement, summary)
  actions = await menu('.block-actions', block('prompt-start'))
  await click(find('.question-header', question('matching')))
  assert.equal(actions.open, false)

  actions = await menu('.block-actions', block('prompt-start'))
  const trigger = find<HTMLElement>('summary', actions)
  const panel = find<HTMLElement>('.editor-menu-panel', actions)
  const oldWidth = window.innerWidth
  const oldHeight = window.innerHeight
  const oldOrigin = actions.getBoundingClientRect
  const oldAnchor = trigger.getBoundingClientRect
  const bounds = (x: number, y: number, width: number, height: number) => ({
    x, y, width, height, left: x, right: x + width, top: y, bottom: y + height, toJSON: () => ({}),
  }) as DOMRect
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 320 })
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: 480 })
  actions.getBoundingClientRect = () => bounds(276, 420, 44, 44)
  trigger.getBoundingClientRect = () => bounds(276, 420, 44, 44)
  panel.getBoundingClientRect = () => bounds(0, 0, 240, 500)
  Object.defineProperty(panel, 'scrollHeight', { configurable: true, value: 500 })
  window.dispatchEvent(new Event('resize'))
  await settle()
  const menuLeft = 276 + Number.parseFloat(panel.style.left)
  const menuTop = 420 + Number.parseFloat(panel.style.top)
  assert.ok(menuLeft >= 8 && menuLeft + 240 <= 312, 'A long menu fits the narrow viewport horizontally')
  assert.ok(menuTop >= 8 && menuTop + Number.parseFloat(panel.style.maxHeight) <= 472, 'A low trigger opens upward with bounded scrolling')
  actions.getBoundingClientRect = oldOrigin
  trigger.getBoundingClientRect = oldAnchor
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: oldWidth })
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: oldHeight })
  await click(find('.question-header', question('matching')))
  locked.value = true
  await settle()
  actions = await menu('.block-actions', block('prompt-start'))
  assert.ok(find('.editor-menu-panel', actions).closest('fieldset[disabled]'), 'Menu placement must preserve the native disabled fieldset')
  locked.value = false
  await settle()
  const ids = [...host.querySelectorAll('[id]')].map(element => element.id)
  assert.equal(new Set(ids).size, ids.length, 'Mounted composers need unique picker labels and control IDs')
  for (const label of host.querySelectorAll('label[for]')) assert.ok(document.getElementById(label.getAttribute('for')!))
  i18n.global.locale.value = 'en'
  await settle()
  assert.ok(prompt().textContent?.includes(en.editorAddPromptContent!))
  assert.ok(find('.question-state', question('choice')).getAttribute('title')?.includes(en.editorCompletenessHelp!))
  assert.deepEqual(errors, [])
  console.log('PASS CONTENT DOM: empty content, library error recovery, keyboard/outside focus, bounded menu placement, native lock, unique IDs and English labels')

  holdMedia = true
  actions = await menu('.append-content', find('.empty-composer'))
  await click(find('[data-insert-kind=video]', actions))
  const pendingMedia = calls.filter(call => call.path === 'admin/media').at(-1)!
  assert.ok(resolveMedia)
  app.unmount()
  assert.ok(pendingMedia.signal?.aborted, 'Unmounting aborts pending private-library requests')
  resolveMedia!(Response.json({ media }))
  await settle()
  assert.deepEqual(errors, [])
  console.log('PASS CONTENT DOM: aborting late media enumeration on unmount')
} finally {
  if (host.firstChild) app.unmount()
  host.remove()
  globalThis.fetch = previousFetch
}
