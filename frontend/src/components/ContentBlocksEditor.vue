<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref, type ObjectDirective } from 'vue'
import { useI18n } from 'vue-i18n'
import MediaUploader, { type UploadedMedia } from './MediaUploader.vue'
import EditorMenu from './EditorMenu.vue'
import { createBlock, move, uuidPattern, type BlockKind, type ContentBlock } from '../editor/model'

const props = withDefaults(defineProps<{
  modelValue: ContentBlock[]; csrfToken: string; label: string; hideLabel?: boolean
}>(), { hideLabel: false })
const emit = defineEmits<{ 'update:modelValue': [blocks: ContentBlock[]] }>()
const { t } = useI18n()
const root = ref<HTMLElement | null>(null)
const pickerDialog = ref<HTMLDialogElement | null>(null)
const mediaChoices = ref<Array<{ id: string; kind: 'image' | 'video'; originalName: string }>>([])
const pickerError = ref('')
const pickerLoading = ref(false)
const pickerKind = ref<'image' | 'video'>('image')
// Target by stable block ID, never by an index that could change while an
// upload or library request is pending. New media is inserted only on success.
const pickerTarget = ref<{ blockId: string } | { beforeId: string | null } | null>(null)
const matchingMedia = computed(() => mediaChoices.value.filter(item => item.kind === pickerKind.value))
let libraryRequest: AbortController | undefined

function resizeText(element: HTMLTextAreaElement): void {
  element.style.height = 'auto'
  element.style.height = element.scrollHeight + 'px'
}
const textObservers = new WeakMap<HTMLTextAreaElement, ResizeObserver>()
const vGrow: ObjectDirective<HTMLTextAreaElement> = {
  mounted(element) {
    resizeText(element)
    // Wrapping changes on viewport resize without changing the text value.
    // Observe width only so changing height does not trigger a resize loop.
    let width = element.clientWidth
    const observer = new ResizeObserver(() => {
      if (element.clientWidth === width) return
      width = element.clientWidth
      resizeText(element)
    })
    observer.observe(element)
    textObservers.set(element, observer)
  },
  updated: resizeText,
  unmounted(element) { textObservers.get(element)?.disconnect() },
}
function update(blocks: ContentBlock[]): void { emit('update:modelValue', blocks) }
function setText(id: string, text: string): void {
  update(props.modelValue.map(b => b.id === id && b.type === 'text' ? { ...b, text } : b))
}
async function insert(kind: BlockKind, index: number): Promise<void> {
  if (kind !== 'text') {
    void openPicker(kind, { beforeId: props.modelValue[index]?.id ?? null })
    return
  }
  const block = createBlock('text')
  const blocks = [...props.modelValue]
  blocks.splice(index, 0, block)
  update(blocks)
  await nextTick()
  root.value?.querySelector<HTMLTextAreaElement>('#text-' + block.id)?.focus()
}
async function openPicker(kind: 'image' | 'video', target: NonNullable<typeof pickerTarget.value>): Promise<void> {
  libraryRequest?.abort()
  const request = new AbortController()
  libraryRequest = request
  pickerKind.value = kind
  pickerTarget.value = target
  pickerError.value = ''
  mediaChoices.value = []
  pickerLoading.value = true
  pickerDialog.value?.showModal()
  try {
    const response = await fetch(import.meta.env.BASE_URL + 'api/admin/media', {
      credentials: 'same-origin', cache: 'no-store', signal: request.signal,
    })
    if (!response.ok) throw new Error('Unable to load library')
    const data = await response.json() as { media: typeof mediaChoices.value }
    if (!request.signal.aborted) mediaChoices.value = data.media
  } catch {
    if (!request.signal.aborted) pickerError.value = t('mediaLibraryUnavailable')
  } finally {
    if (!request.signal.aborted) pickerLoading.value = false
  }
}
function chooseMedia(id: string): void {
  const target = pickerTarget.value
  if (!target || !uuidPattern.test(id)) return
  if ('blockId' in target) {
    update(props.modelValue.map(block => block.id === target.blockId && block.type === pickerKind.value
      ? { ...block, mediaId: id } : block))
  } else {
    const blocks = [...props.modelValue]
    const index = target.beforeId === null ? blocks.length : blocks.findIndex(block => block.id === target.beforeId)
    if (index < 0) return
    const block = createBlock(pickerKind.value)
    if (block.type === 'text') return
    block.mediaId = id
    blocks.splice(index, 0, block)
    update(blocks)
  }
  pickerDialog.value?.close()
}
function onUploaded(media: UploadedMedia): void {
  if (media.kind !== pickerKind.value) {
    pickerError.value = t('editorMediaMismatch')
    return
  }
  chooseMedia(media.mediaId)
}
function closePicker(): void {
  libraryRequest?.abort()
  pickerTarget.value = null
}
async function remove(index: number): Promise<void> {
  update(props.modelValue.filter((_, i) => i !== index))
  await nextTick()
  const controls = root.value?.querySelectorAll<HTMLTextAreaElement | HTMLElement>('textarea, .block-tools summary')
  controls?.[Math.min(index, controls.length - 1)]?.focus()
  if (!props.modelValue.length) root.value?.querySelector<HTMLElement>('.append-content summary')?.focus()
}
function preview(mediaId: string): string {
  return import.meta.env.BASE_URL + 'api/admin/media/' + encodeURIComponent(mediaId) + '/preview'
}
onUnmounted(() => libraryRequest?.abort())
</script>

<template>
  <div ref="root" class="content-composer" role="group" :aria-label="label">
    <p :class="hideLabel ? 'visually-hidden' : 'fw-semibold mb-2'">{{ label }}</p>
    <div v-for="(block, index) in modelValue" :key="block.id" class="content-block">
      <div class="block-insertion">
        <EditorMenu :label="t('editorInsertContent', { index: index + 1 })" align="start">
          <template #trigger><span aria-hidden="true">+</span></template>
          <button v-for="kind in (['text', 'image', 'video'] as const)" :key="kind"
            type="button" class="btn btn-sm" @click="insert(kind, index)">{{ t('editorKind_' + kind) }}</button>
        </EditorMenu>
      </div>
      <div class="block-row">
        <div class="block-content">
          <template v-if="block.type === 'text'">
            <label :for="'text-' + block.id" class="visually-hidden">{{ label }} · {{ t('editorText') }} {{ index + 1 }}</label>
            <textarea :id="'text-' + block.id" v-grow class="form-control block-text" :value="block.text"
              :placeholder="t('editorTextPlaceholder')" maxlength="100000" rows="1"
              @input="setText(block.id, ($event.target as HTMLTextAreaElement).value)" />
          </template>
          <template v-else>
            <img v-if="block.type === 'image' && uuidPattern.test(block.mediaId)" :src="preview(block.mediaId)"
              class="media-preview" :alt="t('editorImagePreview')" />
            <video v-else-if="block.type === 'video' && uuidPattern.test(block.mediaId)" :src="preview(block.mediaId)"
              controls preload="metadata" class="media-preview" />
            <p v-else class="text-warning-emphasis small mb-2">{{ t('editorChooseMedia') }}</p>
            <button type="button" class="btn btn-link btn-sm px-0"
              @click="openPicker(block.type, { blockId: block.id })">
              {{ uuidPattern.test(block.mediaId) ? t('editorReplaceMedia') : t('mediaChooseFromLibrary') }}
            </button>
          </template>
        </div>
        <div class="block-tools">
          <button v-if="modelValue.length > 1" type="button" class="btn btn-sm" :disabled="index === 0"
            :aria-label="t('editorMoveBlockUp', { index: index + 1 })" :title="t('editorMoveUp')"
            @click="update(move(modelValue, index, -1))">↑</button>
          <button v-if="modelValue.length > 1" type="button" class="btn btn-sm" :disabled="index === modelValue.length - 1"
            :aria-label="t('editorMoveBlockDown', { index: index + 1 })" :title="t('editorMoveDown')"
            @click="update(move(modelValue, index, 1))">↓</button>
          <EditorMenu :label="t('editorBlockActions', { index: index + 1 })">
            <button v-if="block.type !== 'text'" type="button" class="btn btn-sm"
              @click="openPicker(block.type, { blockId: block.id })">{{ t('editorReplaceMedia') }}</button>
            <button type="button" class="btn btn-sm text-danger" @click="remove(index)">{{ t('editorRemoveBlock') }}</button>
          </EditorMenu>
        </div>
      </div>
    </div>
    <EditorMenu class="append-content mt-1" :label="t('editorAddContent')" align="start">
      <template #trigger><span class="text-primary">+ {{ t('editorAddContent') }}</span></template>
      <button v-for="kind in (['text', 'image', 'video'] as const)" :key="kind"
        type="button" class="btn btn-sm" @click="insert(kind, modelValue.length)">{{ t('editorKind_' + kind) }}</button>
    </EditorMenu>

    <dialog ref="pickerDialog" class="media-dialog border rounded shadow p-3 p-md-4"
      :aria-label="t('editorSelectMedia_' + pickerKind)" @close="closePicker">
      <div class="d-flex justify-content-between align-items-center gap-2 mb-3">
        <h2 class="h5 mb-0">{{ t('editorSelectMedia_' + pickerKind) }}</h2>
        <button class="btn-close" type="button" :aria-label="t('catalogCancel')" @click="pickerDialog?.close()" />
      </div>
      <p v-if="pickerError" class="text-danger" role="alert">{{ pickerError }}</p>
      <p v-if="pickerLoading" role="status">{{ t('loading') }}</p>
      <div class="row g-2 mb-3">
        <div v-for="media in matchingMedia" :key="media.id" class="col-6 col-md-4">
          <button type="button" class="btn btn-outline-secondary w-100 text-break" @click="chooseMedia(media.id)">
            <img v-if="media.kind === 'image'" :src="preview(media.id)" alt=""
              class="w-100 object-fit-contain" style="height: 110px" />
            <video v-else :src="preview(media.id)" preload="metadata" class="w-100" style="height: 110px" />
            <span class="small">{{ media.originalName }}</span>
          </button>
        </div>
      </div>
      <p v-if="!pickerLoading && !pickerError && !matchingMedia.length" class="text-secondary">{{ t('mediaNoItems') }}</p>
      <h3 class="h6">{{ t('mediaUploadTitle') }}</h3>
      <!-- Reset the uploader on every dialog opening so a completed prior file
           cannot be mistaken for an attachment to the new target block. -->
      <MediaUploader v-if="pickerTarget" :csrf-token="csrfToken" :kind="pickerKind" @uploaded="onUploaded" />
    </dialog>
  </div>
</template>

<style scoped>
.content-composer { min-width: 0; }
.block-row { display: flex; align-items: flex-start; gap: .5rem; }
.block-content { flex: 1; min-width: 0; }
.block-text { min-height: 2.5rem; max-height: 24rem; overflow-y: auto; resize: vertical; }
.block-tools { display: flex; flex-direction: column; color: var(--bs-secondary-color); }
.block-tools > button { color: inherit; padding: .1rem .4rem; min-width: 2rem; }
.block-tools > button:hover { background: var(--bs-tertiary-bg); }
.block-insertion { display: flex; align-items: center; gap: .4rem; margin: .15rem 2.5rem .15rem 0; }
.block-insertion::before, .block-insertion::after { content: ''; height: 1px; background: var(--bs-border-color); flex: 1; opacity: .5; }
.block-insertion :deep(summary) { padding: 0 .35rem; line-height: 1.25rem; }
.content-block:first-of-type .block-insertion { margin-top: -.25rem; }
.media-preview { display: block; max-width: 100%; max-height: 240px; border-radius: .25rem; }
video.media-preview { width: 100%; background: var(--bs-tertiary-bg); }
.append-content { width: fit-content; }
.media-dialog { width: min(92vw, 780px); max-height: 85vh; }
.media-dialog::backdrop { background: rgb(0 0 0 / .35); }
</style>
