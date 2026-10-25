import { defineComponent, h, onMounted, onUnmounted, type PropType } from 'vue'

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
    },
    setup(props) {
      onMounted(() => uploadBoundaries.add(props))
      onUnmounted(() => uploadBoundaries.delete(props))
      return () => h('input', { type: 'file', accept: props.acceptedFileTypes.join(','), 'data-upload-boundary': '' })
    },
  })
}
