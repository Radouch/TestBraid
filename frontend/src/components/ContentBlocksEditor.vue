<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import MediaUploader, { type UploadedMedia } from './MediaUploader.vue'
import { createBlock, move, uuidPattern, type BlockKind, type ContentBlock } from '../editor/model'

const props = defineProps<{
  modelValue: ContentBlock[]
  csrfToken: string
  label: string
}>()
const emit = defineEmits<{ 'update:modelValue': [blocks: ContentBlock[]] }>()
const { t } = useI18n()
const error = ref('')

function update(blocks: ContentBlock[]): void {
  emit('update:modelValue', blocks)
}
function add(kind: BlockKind): void {
  update([...props.modelValue, createBlock(kind)])
}
function setText(index: number, text: string): void {
  update(props.modelValue.map((b, i) => i === index && b.type === 'text' ? { ...b, text } : b))
}
function setMedia(index: number, mediaId: string): void {
  update(props.modelValue.map((b, i) => i === index && b.type !== 'text' ? { ...b, mediaId: mediaId.trim() } : b))
}
function onUploaded(index: number, media: UploadedMedia): void {
  const block = props.modelValue[index]
  if (!block || block.type === 'text') return
  if (media.kind !== block.type) {
    error.value = t('editorMediaMismatch')
    return
  }
  error.value = ''
  setMedia(index, media.mediaId)
}
function remove(index: number): void {
  update(props.modelValue.filter((_, i) => i !== index))
}
function reorder(index: number, direction: -1 | 1): void {
  update(move(props.modelValue, index, direction))
}
function preview(mediaId: string): string {
  return import.meta.env.BASE_URL + 'api/admin/media/' + encodeURIComponent(mediaId) + '/preview'
}
</script>

<template>
  <div class="border rounded p-2 my-2">
    <p class="fw-semibold mb-2">{{ label }}</p>
    <p v-if="error" role="alert" class="alert alert-danger">{{ error }}</p>
    <div v-for="(block, index) in modelValue" :key="block.id" class="border-start border-3 ps-2 mb-3">
      <div class="d-flex align-items-center gap-1 mb-2">
        <span class="small fw-semibold">{{ t('editorBlock') }} {{ index + 1 }}:
          {{ t('editorKind_' + block.type) }}</span>
        <div class="ms-auto d-flex flex-wrap gap-1">
          <button type="button" class="btn btn-outline-secondary btn-sm"
            :disabled="index === 0" :aria-label="t('editorMoveUp')"
            @click="reorder(index, -1)">↑</button>
          <button type="button" class="btn btn-outline-secondary btn-sm"
            :disabled="index === modelValue.length - 1" :aria-label="t('editorMoveDown')"
            @click="reorder(index, 1)">↓</button>
          <button type="button" class="btn btn-outline-danger btn-sm"
            @click="remove(index)">{{ t('editorRemove') }}</button>
        </div>
      </div>
      <label v-if="block.type === 'text'" :for="'text-' + block.id" class="form-label visually-hidden">
        {{ t('editorText') }}
      </label>
      <textarea v-if="block.type === 'text'" :id="'text-' + block.id" class="form-control"
        :value="block.text" maxlength="100000" rows="2"
        @input="setText(index, ($event.target as HTMLTextAreaElement).value)" />
      <template v-else>
        <label :for="'media-' + block.id" class="form-label">{{ t('editorExistingMediaId') }}</label>
        <input :id="'media-' + block.id" class="form-control font-monospace mb-2"
          :value="block.mediaId" @input="setMedia(index, ($event.target as HTMLInputElement).value)" />
        <p v-if="block.mediaId && !uuidPattern.test(block.mediaId)" class="text-danger small">
          {{ t('editorInvalidMediaId') }}
        </p>
        <img v-if="block.type === 'image' && uuidPattern.test(block.mediaId)"
          :src="preview(block.mediaId)" class="img-fluid d-block my-2"
          style="max-height: 240px" :alt="t('editorImagePreview')" />
        <video v-if="block.type === 'video' && uuidPattern.test(block.mediaId)"
          :src="preview(block.mediaId)" controls preload="metadata"
          class="w-100 my-2" style="max-height: 240px" />
        <details>
          <summary>{{ t('editorUploadHere') }}</summary>
          <MediaUploader :csrf-token="csrfToken" @uploaded="onUploaded(index, $event)" />
        </details>
      </template>
    </div>
    <div class="d-flex gap-2 flex-wrap">
      <button type="button" class="btn btn-outline-secondary btn-sm"
        @click="add('text')">{{ t('editorAddText') }}</button>
      <button type="button" class="btn btn-outline-secondary btn-sm"
        @click="add('image')">{{ t('editorAddImage') }}</button>
      <button type="button" class="btn btn-outline-secondary btn-sm"
        @click="add('video')">{{ t('editorAddVideo') }}</button>
    </div>
  </div>
</template>
