<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import vueFilePond from 'vue-filepond'
import FilePondPluginFileValidateType from 'filepond-plugin-file-validate-type'
import FilePondPluginFileValidateSize from 'filepond-plugin-file-validate-size'
import 'filepond/dist/filepond.min.css'

export interface UploadedMedia {
  mediaId: string
  kind: 'image' | 'video'
  mimeType: string
  originalName: string
  sizeBytes: number
}

const props = defineProps<{ csrfToken: string }>()
const emit = defineEmits<{ uploaded: [media: UploadedMedia] }>()
const { t } = useI18n()
const uploadError = ref('')
const FilePond = vueFilePond(FilePondPluginFileValidateType, FilePondPluginFileValidateSize)

const acceptedTypes = ['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm']

function uploaded(response: string): string {
  let parsed: unknown
  try {
    parsed = JSON.parse(response)
  } catch {
    uploadError.value = t('mediaUploadFailed')
    throw new Error(uploadError.value)
  }
  if (!parsed || typeof parsed !== 'object' || !('mediaId' in parsed)
    || typeof parsed.mediaId !== 'string' || !('kind' in parsed)
    || (parsed.kind !== 'image' && parsed.kind !== 'video')
    || !('mimeType' in parsed) || typeof parsed.mimeType !== 'string'
    || !('originalName' in parsed) || typeof parsed.originalName !== 'string'
    || !('sizeBytes' in parsed) || typeof parsed.sizeBytes !== 'number') {
    uploadError.value = t('mediaUploadFailed')
    throw new Error(uploadError.value)
  }

  uploadError.value = ''
  const media = parsed as UploadedMedia
  emit('uploaded', media)
  return media.mediaId
}

function serverError(raw: string): string {
  try {
    const result = JSON.parse(raw) as { error?: { message?: string } }
    uploadError.value = result.error?.message || t('mediaUploadFailed')
  } catch {
    uploadError.value = t('mediaUploadFailed')
  }
  return uploadError.value
}

// Only this adapter knows FilePond's server protocol. Other application
// components see a stable, typed mediaId-based upload event.
const server = computed(() => ({
  process: {
    url: `${import.meta.env.BASE_URL}api/admin/media`,
    method: 'POST',
    headers: { 'X-CSRF-Token': props.csrfToken },
    withCredentials: true,
    onload: uploaded,
    onerror: serverError,
  },
}))
</script>

<template>
  <div>
    <p v-if="uploadError" class="alert alert-danger" role="alert">{{ uploadError }}</p>
    <FilePond
      name="file"
      :server="server"
      :allow-multiple="false"
      :allow-revert="false"
      :accepted-file-types="acceptedTypes"
      max-file-size="64MB"
      :label-idle="t('mediaDrop')"
    />
    <p class="form-text">{{ t('mediaFormats') }}</p>
  </div>
</template>
