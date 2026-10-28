<script setup lang="ts">
import { appBaseUrl } from '../deployment-base'
import { computed, onMounted, ref } from 'vue'
import { FileStatus, type FilePondFile } from 'filepond'
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

const props = defineProps<{ csrfToken: string; kind?: 'image' | 'video'; groupId?: string | null }>()
const emit = defineEmits<{ uploaded: [media: UploadedMedia] }>()
const { t } = useI18n()
const uploadError = ref('')
// Bulk selection is for the library only. An editor block still accepts one
// file and uploads it immediately to its chosen location.
const pond = ref<{ processFile: (id: string) => Promise<unknown>; getFiles: () => FilePondFile[] } | null>(null)
const pendingFileIds = ref<string[]>([])
const batchUploading = ref(false)
const batchResult = ref<{ uploaded: number; total: number } | null>(null)

function syncFileList(files?: FilePondFile[]): void {
  pendingFileIds.value = (files ?? pond.value?.getFiles() ?? [])
    .filter(file => ![FileStatus.PROCESSING_COMPLETE, FileStatus.PROCESSING, FileStatus.PROCESSING_QUEUED].includes(file.status))
    .map(file => file.id)
}

async function uploadSelected(): Promise<void> {
  if (props.kind || batchUploading.value || !pond.value || pendingFileIds.value.length === 0) return
  const selectedIds = [...pendingFileIds.value]
  batchUploading.value = true
  batchResult.value = null
  uploadError.value = ''
  // Wait for every upload, even if an earlier one fails. A single file's
  // failure must not prevent the other selected files from finishing.
  const results = await Promise.allSettled(selectedIds.map(id => pond.value!.processFile(id)))
  if (results.some(result => result.status === 'rejected') && !uploadError.value) {
    uploadError.value = t('mediaUploadFailed')
  }
  const uploaded = pond.value?.getFiles().filter(file =>
    selectedIds.includes(file.id) && file.status === FileStatus.PROCESSING_COMPLETE).length ?? 0
  batchResult.value = { uploaded, total: selectedIds.length }
  batchUploading.value = false
  syncFileList()
}

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
    const response = await fetch(`${appBaseUrl()}api/admin/media/limits`, {
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

  if (props.kind) uploadError.value = ''
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
    url: `${appBaseUrl()}api/admin/media`,
    method: 'POST',
    headers: { 'X-CSRF-Token': props.csrfToken },
    withCredentials: true,
    onload: uploaded,
    ondata: (data: FormData) => {
      // FilePond adds JSON metadata as a text part named "file", alongside
      // the binary part. PHP exposes that text in parsed-body fields, where
      // our API allows only groupId. Send the application's exact contract.
      const upload = new FormData()
      for (const file of data.getAll('file')) {
        if (typeof file !== 'string') upload.append('file', file, file.name)
      }
      if (props.groupId !== undefined) upload.append('groupId', props.groupId ?? '')
      return upload
    },
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
      ref="pond"
      name="file"
      :server="server"
      :allow-multiple="!props.kind"
      :instant-upload="!!props.kind"
      :max-parallel-uploads="2"
      :allow-revert="false"
      :accepted-file-types="acceptedTypes"
      :max-file-size="fileMaximum"
      :before-add-file="beforeAddFile"
      :label-idle="t(props.kind ? 'mediaDrop' : 'mediaDropMultiple')"
      :label-file-processing="t('mediaUploading')"
      :label-file-processing-complete="t('mediaUploadComplete')"
      :label-file-processing-error="t('mediaUploadFailed')"
      :label-button-process-item="t('mediaUploadFile')"
      :label-button-retry-item-processing="t('mediaUploadRetry')"
      @updatefiles="syncFileList"
      @processfile="syncFileList()"
    />
    <div v-if="!props.kind && limits && fileMaximum > 0" class="mt-2">
      <button type="button" class="btn btn-primary" data-upload-selected
        :disabled="batchUploading || pendingFileIds.length === 0" @click="uploadSelected">
        {{ t('mediaUploadSelected', { count: pendingFileIds.length }) }}
      </button>
      <p v-if="batchResult" class="mt-2 mb-0" role="status">
        {{ t('mediaUploadResult', { uploaded: batchResult.uploaded, total: batchResult.total }) }}
      </p>
    </div>
    <p v-if="limits" class="form-text">{{ t('mediaFormats', {
      image: asMiB(limits.imageMaxBytes), video: asMiB(limits.videoMaxBytes),
    }) }}</p>
  </div>
</template>
