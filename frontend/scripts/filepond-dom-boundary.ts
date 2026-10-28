import { defineComponent, h, onMounted, onUnmounted, type PropType } from 'vue'
import { FileStatus, type FilePondFile } from 'filepond'

export interface UploadProcess {
  url: string
  method: string
  headers: Record<string, string>
  withCredentials: boolean
  ondata: (data: FormData) => FormData
  onload: (response: string) => string
  onerror: (response: string) => string
}
export interface UploadBoundary {
  name: string
  server: { process: UploadProcess }
  allowMultiple: boolean
  instantUpload: boolean
  queuedForTest: (files: FilePondFile[]) => void
  processedFiles: string[]
}
// Expose the real adapter's props to transport tests without emulating the
// third-party widget. Mounted instances disappear when their picker closes.
export const uploadBoundaries = new Set<UploadBoundary>()

/** DOM suites exercise the real MediaUploader without a third-party upload
 * engine that requires browser layout and native file APIs. No upload is made. */
export default function filePondDomBoundary() {
  return defineComponent({
    name: 'FilePondDomBoundary',
    inheritAttrs: false,
    props: {
      name: { type: String, default: 'file' },
      server: { type: Object as PropType<UploadBoundary['server']>, required: true },
      acceptedFileTypes: { type: Array as PropType<string[]>, default: () => [] },
      allowMultiple: { type: Boolean, default: false },
      instantUpload: { type: Boolean, default: true },
    },
    setup(props, { expose, emit }) {
      let files: FilePondFile[] = []
      const processedFiles: string[] = []
      const boundary: UploadBoundary = {
        get name() { return props.name },
        get server() { return props.server },
        get allowMultiple() { return props.allowMultiple },
        get instantUpload() { return props.instantUpload },
        processedFiles,
        queuedForTest(items) {
          files = items
          emit('updatefiles', files)
        },
      }
      const getFiles = () => files
      const processFile = async (id: string) => {
        processedFiles.push(id)
        const file = files.find(item => item.id === id)
        if (!file) throw new Error('Missing test file')
        file.status = FileStatus.PROCESSING_COMPLETE
        emit('processfile', null, file)
        return file
      }
      expose({ getFiles, processFile })
      onMounted(() => uploadBoundaries.add(boundary))
      onUnmounted(() => uploadBoundaries.delete(boundary))
      return () => h('input', { type: 'file', multiple: props.allowMultiple,
        accept: props.acceptedFileTypes.join(','), 'data-upload-boundary': '' })
    },
  })
}
