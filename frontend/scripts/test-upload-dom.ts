import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createApp, h, nextTick, reactive, type App } from 'vue'
import { createI18n } from 'vue-i18n'
import { createFileProcessorFunction } from 'filepond-transport-test'
import { FileStatus, type FilePondFile } from 'filepond'
import MediaUploader from '../src/components/MediaUploader.vue'
import QuestionEditor from '../src/components/QuestionEditor.vue'
import { uploadBoundaries, type UploadBoundary } from './filepond-dom-boundary'
import type { ChoiceQuestion } from '../src/editor/model'

const messages = Object.fromEntries(['cs', 'en'].map(locale => [locale, JSON.parse(readFileSync('public/locales/' + locale + '.json', 'utf8'))]))
const lessonId = '11111111-1111-4111-8111-111111111111'
const mediaId = '22222222-2222-4222-8222-222222222222'
const jpeg = Buffer.from(readFileSync('../backend/bin/fixtures/tiny.jpg.b64', 'utf8'), 'base64')
const video = Buffer.from(readFileSync('../backend/bin/fixtures/tiny.mp4.b64', 'utf8'), 'base64')
const previousFetch = globalThis.fetch
const previousXHR = Object.getOwnPropertyDescriptor(globalThis, 'XMLHttpRequest')
const errors: unknown[] = []
const requests: RecordingXHR[] = []
let mounted: App | undefined
let host: HTMLDivElement | undefined

/** Capture the actual FilePond transport at the network boundary. Response
 * delivery still invokes the real MediaUploader onload/onerror callbacks. */
class RecordingXHR {
  method = ''
  url = ''
  headers: Record<string, string> = {}
  withCredentials = false
  upload = {}
  status = 0
  response = ''
  data!: FormData
  onload = () => {}
  onabort = () => {}
  open(method: string, url: string): void { this.method = method; this.url = url }
  setRequestHeader(name: string, value: string): void { this.headers[name] = value }
  getAllResponseHeaders(): string { return 'Content-Type: application/json\r\n' }
  send(data: FormData): void { this.data = data; requests.push(this) }
  abort(): void { this.onabort() }
}
Object.defineProperty(globalThis, 'XMLHttpRequest', { configurable: true, value: RecordingXHR })
globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const path = String(input).replace('/training/api/', '')
  assert.equal(init?.method ?? 'GET', 'GET')
  assert.equal(init?.credentials, 'same-origin')
  if (path === 'admin/media/limits') return Response.json({ imageMaxBytes: 10485760, videoMaxBytes: 104857600,
    phpUploadMaxBytes: null, phpPostMaxBytes: null, warnings: [] })
  if (path === 'admin/media') return Response.json({ media: [] })
  if (path === 'admin/groups') return Response.json({ groups: [{ id: lessonId, name: 'Lesson' }] })
  throw new Error('Unexpected upload-test request: ' + path)
}) as typeof fetch
const settle = async () => {
  for (let index = 0; index < 5; index++) { await new Promise<void>(resolve => setImmediate(resolve)); await nextTick() }
}
async function mount(component: Parameters<typeof h>[0], props: Record<string, unknown>): Promise<void> {
  mounted?.unmount()
  host?.remove()
  host = document.createElement('div')
  document.body.append(host)
  mounted = createApp({ render: () => h(component, props) }).use(createI18n({ legacy: false, locale: 'cs', warnHtmlMessage: false, messages }))
  mounted.config.errorHandler = error => errors.push(error)
  mounted.mount(host)
  await settle()
}
function boundary(): UploadBoundary {
  assert.equal(uploadBoundaries.size, 1, 'Use the actual mounted MediaUploader configuration')
  return [...uploadBoundaries][0]!
}
function find<T extends Element = HTMLElement>(selector: string, parent: ParentNode = host!): T {
  const element = parent.querySelector<T>(selector)
  assert.ok(element, 'Missing element: ' + selector)
  return element
}
async function transport(adapter: UploadBoundary, file: File, groupId: string | null | undefined, metadata: Record<string, unknown> = {}): Promise<RecordingXHR> {
  let raw: FormData | undefined
  const failures: unknown[] = []
  const processor = createFileProcessorFunction('', {
    ...adapter.server.process,
    ondata: data => { raw = data; return adapter.server.process.ondata(data) },
  }, adapter.name, { chunkUploads: false })
  processor(file, metadata, () => {}, error => failures.push(error), () => {}, () => {}, () => {})
  assert.ok(raw)
  assert.equal(typeof raw.getAll('file')[0], 'string', 'The installed FilePond serializer really includes text metadata under file')
  assert.equal(raw.getAll('file').length, 2, 'The raw request contains metadata and binary under the same name')
  const request = requests.at(-1)!
  assert.equal(request.method, 'POST')
  assert.equal(request.url, '/training/api/admin/media')
  assert.equal(request.withCredentials, true)
  assert.equal(request.headers['X-CSRF-Token'], 'session-csrf')
  // Round-trip the actual multipart bytes. PHP separates text parts into POST
  // and binary parts into FILES; only groupId is allowed in the former.
  const wire = new Request('https://upload.invalid/training/api/admin/media', { method: 'POST', body: request.data })
  const parsed = await wire.formData()
  const textFields = [...parsed.entries()].filter(([, value]) => typeof value === 'string')
  assert.deepEqual(textFields, groupId === undefined ? [] : [['groupId', groupId ?? '']], 'Unsupported upload fields must not reach the API')
  assert.equal(parsed.getAll('file').length, 1)
  const uploaded = parsed.get('file')
  assert.ok(uploaded instanceof File)
  assert.equal(uploaded.name, file.name)
  assert.equal(uploaded.type, file.type)
  assert.equal(uploaded.size, file.size)
  assert.deepEqual(Buffer.from(await uploaded.arrayBuffer()), Buffer.from(await file.arrayBuffer()))
  assert.deepEqual(failures, [])
  return request
}

try {
  for (const [groupId, kind] of [[undefined, 'image'], [null, 'image'], [lessonId, 'image'], [lessonId, 'video']] as const) {
    await mount(MediaUploader, { csrfToken: 'session-csrf', groupId, kind })
    assert.equal(boundary().allowMultiple, false, 'Editor attachments must stay single-file')
    assert.equal(boundary().instantUpload, true, 'Editor attachments must still upload immediately')
    const file = new File([kind === 'image' ? jpeg : video], kind === 'image' ? 'Pozdrav.JPG' : 'Pozdrav.mp4', { type: kind === 'image' ? 'image/jpeg' : 'video/mp4' })
    await transport(boundary(), file, groupId, { caption: 'Not application metadata' })
  }
  console.log('PASS UPLOAD DOM: real FilePond multipart serialization, binary-only file parts, filenames/bytes/MIME, lesson assignment, base path and CSRF')

  await mount(MediaUploader, { csrfToken: 'session-csrf', groupId: lessonId })
  const library = boundary()
  assert.equal(library.allowMultiple, true, 'Library must allow selecting several files')
  assert.equal(library.instantUpload, false, 'Library uploads should await a button click')
  assert.equal(find<HTMLInputElement>('[data-upload-boundary]').multiple, true)
  const uploadAll = find<HTMLButtonElement>('[data-upload-selected]')
  assert.equal(uploadAll.disabled, true, 'No files selected yet')
  const queued = [
    { id: 'photo-1', status: FileStatus.IDLE },
    { id: 'movie-2', status: FileStatus.IDLE },
  ] as FilePondFile[]
  library.queuedForTest(queued)
  await settle()
  assert.equal(uploadAll.disabled, false)
  uploadAll.click()
  await settle()
  assert.deepEqual(library.processedBatches, [['photo-1', 'movie-2']], 'One click processes both files')
  assert.equal(uploadAll.disabled, true, 'Completed media must not be reuploaded')
  assert.ok(host!.textContent?.includes('Nahráno 2 z 2'), 'Show batch upload result')
  assert.deepEqual(errors, [])
  console.log('PASS UPLOAD DOM: one-click batch media uploads; editor upload stays single-file')

  const question = reactive<ChoiceQuestion>({ id: 'choice', type: 'choice', mode: 'single', prompt: [{ id: 'prompt', type: 'text', text: 'Choose the correct picture' }],
    options: [{ id: 'first', content: [{ id: 'answer-text', type: 'text', text: 'Answer with a picture' }] },
      { id: 'second', content: [{ id: 'other-text', type: 'text', text: 'Other answer' }] }], correctOptionIds: ['first'] })
  await mount(QuestionEditor, { question, csrfToken: 'session-csrf', groupId: lessonId, index: 0, total: 1, initiallyExpanded: true })
  const answer = find('[data-option-id=first]')
  const add = find<HTMLDetailsElement>('.append-content', answer)
  find<HTMLElement>('summary', add).focus()
  add.open = true
  add.dispatchEvent(new Event('toggle'))
  await settle()
  find<HTMLButtonElement>('[data-insert-kind=image]', add).click()
  await settle()
  assert.ok(find<HTMLDialogElement>('dialog[open]').open)
  const file = new File([jpeg], 'Pozdrav.JPG', { type: 'image/jpeg' })
  const request = await transport(boundary(), file, lessonId)
  request.status = 201
  request.response = JSON.stringify({ mediaId, kind: 'image', mimeType: 'image/jpeg', originalName: file.name, sizeBytes: file.size, groupId: lessonId })
  request.onload()
  await settle()
  assert.deepEqual(question.options[0]!.content[0], { id: 'answer-text', type: 'text', text: 'Answer with a picture' })
  assert.equal(question.options[0]!.content.length, 2)
  assert.deepEqual(question.options[0]!.content[1], { id: question.options[0]!.content[1]!.id, type: 'image', mediaId })
  assert.equal(find('img', answer).getAttribute('src'), '/training/api/admin/media/' + mediaId + '/preview')
  assert.equal(host!.querySelector('dialog[open]'), null)
  assert.deepEqual(question.correctOptionIds, ['first'])
  assert.deepEqual(errors, [])
  console.log('PASS UPLOAD DOM: a new JPG upload attaches after existing answer text and preserves the correct-answer key')
} finally {
  mounted?.unmount()
  host?.remove()
  globalThis.fetch = previousFetch
  if (previousXHR) Object.defineProperty(globalThis, 'XMLHttpRequest', previousXHR)
  else Reflect.deleteProperty(globalThis, 'XMLHttpRequest')
}
