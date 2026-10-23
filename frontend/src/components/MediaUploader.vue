<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
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

const props = defineProps<{ csrfToken: string; kind?: 'image' | 'video' }>()
const emit = defineEmits<{ uploaded: [media: UploadedMedia] }>()
const { t } = useI18n()
const uploadError = ref('')
const FilePond = vueFilePond(FilePondPluginFileValidateType, FilePondPluginFileValidateSize)
interface UploadWarning { kind: 'image' | 'video'; configuredMaxBytes: number; effectiveMaxBytes: number }
interface UploadLimits {
  imageMaxBytes: number
  videoMaxBytes: number
  phpUploadMaxBytes: number | null
  phpPostMaxBytes: number | null
  warnings: UploadWarning[]
}
const limits = ref<UploadLimits | null>(null)
const limitsError = ref('')
const fileMaximum = computed(() => limits.value
  ? Math.max(limits.value.imageMaxBytes, limits.value.videoMaxBytes) : 0)
const asMiB = (bytes: number) => (bytes / 1048576).toLocaleString(undefined, { maximumFractionDigits: 1 })
const phpMiB = (bytes: number | null) => bytes === null ? t('mediaUnlimited') : asMiB(bytes) + ' MiB'

// The author-only API derives both displayed and enforced limits from the
// same private JSON file on every load, without a Vite rebuild.
onMounted(async () => {
  try {
    const response = await fetch(`${import.meta.env.BASE_URL}api/admin/media/limits`, {
      credentials: 'same-origin', cache: 'no-store',
    })
    if (!response.ok) throw new Error('Unavailable')
    const data = await response.json() as UploadLimits
    if (!Number.isSafeInteger(data.imageMaxBytes) || !Number.isSafeInteger(data.videoMaxBytes)
      || !Array.isArray(data.warnings)) throw new Error('Invalid response')
    limits.value = data
  } catch {
    limitsError.value = t('mediaLimitsUnavailable')
  }
})

// FilePond's generic maximum protects early selection. The per-kind check
// prevents an image from inheriting the larger video allowance.
function beforeAddFile(item: { file: File }): boolean {
  if (!limits.value) return false
  const kind = props.kind ?? (item.file.type.startsWith('image/') ? 'image' : 'video')
  const allowed = kind === 'image' ? limits.value.imageMaxBytes : limits.value.videoMaxBytes
  if (item.file.size > allowed) {
    uploadError.value = t('mediaFileTooLarge', { kind: t(kind === 'image' ? 'mediaImages' : 'mediaVideos'), max: asMiB(allowed) })
    return false
  }
  uploadError.value = ''
  return true
}

// Restrict an editor attachment to its intended block kind. The standalone
// media library leaves kind unset and continues to accept both kinds.
const acceptedTypes = computed(() => props.kind === 'image'
  ? ['image/jpeg', 'image/png', 'image/webp']
  : props.kind === 'video' ? ['video/mp4', 'video/webm']
    : ['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm'])

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
    <p v-if="limitsError" class="alert alert-danger" role="alert">{{ limitsError }}</p>
    <div v-if="limits?.warnings.length" class="alert alert-warning" role="alert">
      <strong>{{ t('mediaLimitsMismatch') }}</strong>
      <p class="mb-1 small">{{ t('mediaPhpLimits', {
        upload: phpMiB(limits.phpUploadMaxBytes), post: phpMiB(limits.phpPostMaxBytes),
      }) }}</p>
      <ul class="mb-0 small">
        <li v-for="warning in limits.warnings" :key="warning.kind">
          {{ t('mediaLimitsReduced', {
            kind: t(warning.kind === 'image' ? 'mediaImages' : 'mediaVideos'),
            configured: asMiB(warning.configuredMaxBytes),
            effective: asMiB(warning.effectiveMaxBytes),
          }) }}
        </li>
      </ul>
    </div>
    <p v-if="uploadError" class="alert alert-danger" role="alert">{{ uploadError }}</p>
    <FilePond v-if="limits && fileMaximum > 0"
      name="file"
      :server="server"
      :allow-multiple="false"
      :allow-revert="false"
      :accepted-file-types="acceptedTypes"
      :max-file-size="fileMaximum"
      :before-add-file="beforeAddFile"
      :label-idle="t('mediaDrop')"
    />
    <p v-if="limits" class="form-text">{{ t('mediaFormats', {
      image: asMiB(limits.imageMaxBytes), video: asMiB(limits.videoMaxBytes),
    }) }}</p>
  </div>
</template>
