<script setup lang="ts">
import { appBaseUrl } from '../deployment-base'
import { computed, nextTick, onUnmounted, ref, useId, type ObjectDirective } from 'vue'
import { useI18n } from 'vue-i18n'
import MediaUploader, { type UploadedMedia } from './MediaUploader.vue'
import EditorMenu from './EditorMenu.vue'
import AppIcon from './AppIcon.vue'
import ContentMedia from './ContentMedia.vue'
import { createBlock, move, uuidPattern, type BlockKind, type ContentBlock } from '../editor/model'

const props = withDefaults(defineProps<{
  modelValue: ContentBlock[]; csrfToken: string; label: string; hideLabel?: boolean; groupId: string; addLabel?: string
}>(), { hideLabel: false })
const emit = defineEmits<{ 'update:modelValue': [blocks: ContentBlock[]] }>()
const { t } = useI18n()
const root = ref<HTMLElement | null>(null)
const pickerDialog = ref<HTMLDialogElement | null>(null)
const pickerLessonId = 'media-picker-lesson-' + useId()
let pickerOrigin: HTMLElement | null = null
const mediaChoices = ref<Array<{ id: string; kind: 'image' | 'video'; originalName: string; groupId: string | null }>>([])
const lessons = ref<Array<{ id: string; name: string }>>([])
const lessonFilter = ref('__all__')
const pickerError = ref('')
const pickerLoading = ref(false)
const pickerKind = ref<'image' | 'video'>('image')
// Target by stable block ID, never by an index that could change while an
// upload or library request is pending. New media is inserted only on success.
const pickerTarget = ref<{ blockId: string } | { beforeId: string | null } | null>(null)
const matchingMedia = computed(() => mediaChoices.value.filter(item =>
  item.kind === pickerKind.value &&
  (lessonFilter.value === '__all__' || (lessonFilter.value === '__unassigned__'
    ? !item.groupId : item.groupId === lessonFilter.value))
))
function lessonName(id: string | null): string {
  return lessons.value.find(lesson => lesson.id === id)?.name ?? t('mediaUnassigned')
}
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
  lessonFilter.value = props.groupId
  pickerLoading.value = true
  const focused = document.activeElement instanceof HTMLElement ? document.activeElement : null
  // Insertion actions live in a transient menu panel. Restore its persistent
  // trigger when the picker closes, rather than a button removed on selection.
  pickerOrigin = focused?.closest('details.editor-menu')?.querySelector<HTMLElement>('summary') ?? focused
  pickerDialog.value?.showModal()
  await nextTick()
  if (request.signal.aborted) return
  pickerDialog.value?.querySelector<HTMLButtonElement>('button')?.focus()
  try {
    const [response, groupsResponse] = await Promise.all([
      fetch(appBaseUrl() + 'api/admin/media', {
        credentials: 'same-origin', cache: 'no-store', signal: request.signal,
      }),
      fetch(appBaseUrl() + 'api/admin/groups', {
        credentials: 'same-origin', cache: 'no-store', signal: request.signal,
      }),
    ])
    if (!response.ok || !groupsResponse.ok) throw new Error('Unable to load library')
    const data = await response.json() as { media: typeof mediaChoices.value }
    const groups = await groupsResponse.json() as { groups: typeof lessons.value }
    if (!request.signal.aborted) {
      mediaChoices.value = data.media
      lessons.value = groups.groups
    }
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
  const origin = pickerOrigin
  pickerOrigin = null
  void nextTick(() => { if (origin?.isConnected) origin.focus() })
}
async function remove(index: number): Promise<void> {
  update(props.modelValue.filter((_, i) => i !== index))
  await nextTick()
  const blocks = root.value?.querySelectorAll<HTMLElement>('.content-block')
  const nextBlock = blocks?.[Math.min(index, blocks.length - 1)]
  const target = nextBlock?.querySelector<HTMLElement>('textarea')
    ?? nextBlock?.querySelector<HTMLElement>('.replace-media, .block-actions summary')
  target?.focus()
  if (!nextBlock) root.value?.querySelector<HTMLElement>('.append-content summary')?.focus()
}
function preview(mediaId: string): string {
  return appBaseUrl() + 'api/admin/media/' + encodeURIComponent(mediaId) + '/preview'
}
onUnmounted(() => libraryRequest?.abort())
</script>

<template>
  <div ref="root" class="content-composer" role="group" :aria-label="label">
    <p :class="hideLabel ? 'visually-hidden' : 'fw-semibold mb-2'">{{ label }}</p>
    <div v-for="(block, index) in modelValue" :key="block.id" class="content-block border rounded p-2 p-sm-3" :data-block-id="block.id">
      <div class="block-content">
        <template v-if="block.type === 'text'">
          <textarea :id="'text-' + block.id" v-grow class="form-control block-text" :value="block.text"
            :aria-label="label + ' · ' + t('editorText') + ' ' + (index + 1)"
            :placeholder="t('editorTextPlaceholder')" maxlength="100000" rows="1"
            @input="setText(block.id, ($event.target as HTMLTextAreaElement).value)" />
        </template>
        <div v-else class="block-media">
          <div v-if="uuidPattern.test(block.mediaId)" class="block-media-preview">
            <ContentMedia :kind="block.type" :src="preview(block.mediaId)" :label="t(block.type === 'image' ? 'editorImagePreview' : 'editorVideoPreview')" />
          </div>
          <p v-else class="text-warning-emphasis small mb-2">{{ t('editorChooseMedia') }}</p>
          <button type="button" class="btn btn-outline-secondary btn-sm replace-media"
            @click="openPicker(block.type, { blockId: block.id })">
            <AppIcon :name="uuidPattern.test(block.mediaId) ? 'pencil-square' : block.type === 'image' ? 'image' : 'play-btn'" />
            {{ uuidPattern.test(block.mediaId) ? t('editorReplaceMedia') : t('mediaChooseFromLibrary') }}
          </button>
        </div>
      </div>
      <EditorMenu class="block-actions" :label="label + ' · ' + t('editorBlockActions', { index: index + 1 })">
        <p class="small text-secondary px-2 pt-1 mb-1">{{ t('editorInsertContent', { index: index + 1 }) }}</p>
        <button v-for="kind in (['text', 'image', 'video'] as const)" :key="kind" type="button" class="btn btn-sm insert-block"
          :data-insert-kind="kind" @click="insert(kind, index)"><AppIcon :name="kind === 'text' ? 'text-left' : kind === 'image' ? 'image' : 'play-btn'" />{{ t('editorKind_' + kind) }}</button>
        <hr class="my-1" />
        <button type="button" class="btn btn-sm move-block-up" :disabled="index === 0"
          :aria-label="t('editorMoveBlockUp', { index: index + 1 })" @click="update(move(modelValue, index, -1))"><AppIcon name="arrow-up" />{{ t('editorMoveUp') }}</button>
        <button type="button" class="btn btn-sm move-block-down" :disabled="index === modelValue.length - 1"
          :aria-label="t('editorMoveBlockDown', { index: index + 1 })" @click="update(move(modelValue, index, 1))"><AppIcon name="arrow-down" />{{ t('editorMoveDown') }}</button>
        <button type="button" class="btn btn-sm text-danger remove-block" @click="remove(index)"><AppIcon name="trash3" />{{ t('editorRemoveBlock') }}</button>
      </EditorMenu>
    </div>
    <EditorMenu class="append-content mt-1" :label="addLabel ?? t('editorAddContent')" align="start">
      <template #trigger><span class="text-primary"><AppIcon name="plus-lg" /> {{ addLabel ?? t('editorAddContent') }}</span></template>
      <button v-for="kind in (['text', 'image', 'video'] as const)" :key="kind"
        type="button" class="btn btn-sm" :data-insert-kind="kind" @click="insert(kind, modelValue.length)"><AppIcon :name="kind === 'text' ? 'text-left' : kind === 'image' ? 'image' : 'play-btn'" />{{ t('editorKind_' + kind) }}</button>
    </EditorMenu>

    <dialog ref="pickerDialog" class="media-dialog border rounded shadow p-3 p-md-4"
      :aria-label="t('editorSelectMedia_' + pickerKind)" @close="closePicker">
      <div class="d-flex justify-content-between align-items-center gap-2 mb-3">
        <h2 class="h5 mb-0">{{ t('editorSelectMedia_' + pickerKind) }}</h2>
        <button class="btn btn-outline-secondary icon-button" type="button" :aria-label="t('catalogCancel')" :title="t('catalogCancel')" @click="pickerDialog?.close()"><AppIcon name="x-lg" /></button>
      </div>
      <label :for="pickerLessonId" class="form-label">{{ t('mediaHomeLesson') }}</label>
      <select :id="pickerLessonId" v-model="lessonFilter" class="form-select mb-3">
        <option value="__all__">{{ t('mediaAllLessons') }}</option>
        <option v-for="lesson in lessons" :key="lesson.id" :value="lesson.id">{{ lesson.name }}</option>
        <option value="__unassigned__">{{ t('mediaUnassigned') }}</option>
      </select>
      <p v-if="pickerError" class="text-danger" role="alert">{{ pickerError }}</p>
      <p v-if="pickerLoading" role="status">{{ t('loading') }}</p>
      <div class="row g-2 mb-3">
        <div v-for="media in matchingMedia" :key="media.id" class="col-6 col-md-4">
          <button type="button" class="btn btn-outline-secondary w-100 text-break" @click="chooseMedia(media.id)">
            <img v-if="media.kind === 'image'" :src="preview(media.id)" alt=""
              class="w-100 object-fit-contain" style="height: 110px" />
            <video v-else :src="preview(media.id)" preload="metadata" class="w-100" style="height: 110px" />
            <span class="small d-block">{{ media.originalName }}</span>
            <span class="small text-secondary d-block">{{ lessonName(media.groupId) }}</span>
          </button>
        </div>
      </div>
      <p v-if="!pickerLoading && !pickerError && !matchingMedia.length" class="text-secondary">{{ t('mediaNoItems') }}</p>
      <h3 class="h6">{{ t('mediaUploadTitle') }}</h3>
      <!-- Reset the uploader on every dialog opening so a completed prior file
           cannot be mistaken for an attachment to the new target block. -->
      <MediaUploader v-if="pickerTarget" :csrf-token="csrfToken" :kind="pickerKind"
        :group-id="groupId" @uploaded="onUploaded" />
    </dialog>
  </div>
</template>

<style scoped>
.content-composer { min-width: 0; position: relative; }
.content-composer:has(.editor-menu[open]) { z-index: 45; }
/* The menu shares the content row in a reserved column. It neither adds a
   header row nor covers text, image details or native video controls. */
.content-block { display: grid; grid-template-columns: minmax(0, 1fr) 2.75rem; align-items: start; gap: .5rem; min-width: 0; background: var(--bs-body-bg); margin-bottom: .65rem; }
.block-content { min-width: 0; grid-column: 1; grid-row: 1; }
.block-actions { grid-column: 2; grid-row: 1; }
.block-text { min-height: 2.5rem; max-height: 24rem; overflow-y: auto; resize: vertical; }
.block-media { display: grid; gap: .75rem; }
.block-media-preview {
  display: grid; justify-items: center; min-width: 0;
  --content-media-landscape-height: 360px;
  --content-media-portrait-height: 560px;
}
.block-media-preview :deep(.content-media) { border-radius: .25rem; }
.replace-media { justify-self: start; min-height: 2.75rem; }
.append-content { width: fit-content; }
.media-dialog { width: min(92vw, 780px); max-height: 85vh; }
.media-dialog::backdrop { background: rgb(0 0 0 / .35); }
</style>
