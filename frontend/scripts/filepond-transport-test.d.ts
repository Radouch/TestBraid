/** Private test-only export of the installed FilePond transport, supplied by
 * run-dom-tests.mjs. Production code must use the public MediaUploader adapter. */
declare module 'filepond-transport-test' {
  export function createFileProcessorFunction(apiUrl: string, action: {
    url: string
    method: string
    headers: Record<string, string>
    withCredentials: boolean
    ondata: (data: FormData) => FormData
    onload: (response: string) => string
    onerror: (response: string) => string
  }, name: string, options: { chunkUploads: boolean }): (
    file: File,
    metadata: Record<string, unknown>,
    load: (response: { type: string; code: number; body: string }) => void,
    error: (response: unknown) => void,
    progress: () => void,
    abort: () => void,
    transfer: () => void,
  ) => unknown
}
