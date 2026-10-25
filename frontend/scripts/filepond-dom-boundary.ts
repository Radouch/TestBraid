import { defineComponent, h, type PropType } from 'vue'

/** DOM suites exercise the real MediaUploader without a third-party upload
 * engine that requires browser layout and native file APIs. No upload is made. */
export default function filePondDomBoundary() {
  return defineComponent({
    name: 'FilePondDomBoundary',
    inheritAttrs: false,
    props: { acceptedFileTypes: { type: Array as PropType<string[]>, default: () => [] } },
    setup: props => () => h('input', { type: 'file', accept: props.acceptedFileTypes.join(','), 'data-upload-boundary': '' }),
  })
}
