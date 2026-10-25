import { readFileSync } from 'node:fs'
import { basename, dirname, resolve } from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { build } from 'esbuild'
import { parse, compileScript } from 'vue/compiler-sfc'
import { Window } from 'happy-dom'

const frontend = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(import.meta.url)
const entry = resolve(frontend, process.argv[2] ?? 'scripts/test-runner-dom.ts')
const output = resolve(frontend, 'node_modules/.cache/' + basename(entry, '.ts') + '.mjs')
const window = new Window({ url: 'https://runner.invalid/training/tests/example', width: 1280, height: 800 })
// Vue's runtime captures document at import time. Install the DOM before
// importing the compiled tests; keep Vue external so every SFC shares it.
for (const name of ['window', 'document', 'navigator', 'Element', 'HTMLElement', 'HTMLInputElement',
  'HTMLMediaElement', 'SVGElement', 'Node', 'Document', 'ShadowRoot', 'Event', 'CustomEvent', 'MouseEvent', 'KeyboardEvent', 'ResizeObserver', 'history', 'location']) {
  Object.defineProperty(globalThis, name, { configurable: true, value: name === 'window' ? window : window[name] })
}
window.HTMLElement.prototype.scrollIntoView = function () {}
try {
  await build({
    entryPoints: [entry], outfile: output, bundle: true, platform: 'node', format: 'esm', packages: 'external',
    define: { 'import.meta.env.BASE_URL': JSON.stringify('/training/') },
    plugins: [{ name: 'vue-dom-tests', setup(plugin) {
      // DOM interaction tests do not render CSS. FilePond's stylesheet is a
      // browser asset and cannot be imported by Node's ESM loader.
      plugin.onResolve({ filter: /\.css$/ }, args => ({ path: args.path, namespace: 'dom-css' }))
      plugin.onLoad({ filter: /.*/, namespace: 'dom-css' }, () => ({ contents: '', loader: 'js' }))
      plugin.onLoad({ filter: /\.vue$/ }, args => {
        const { descriptor } = parse(readFileSync(args.path, 'utf8'), { filename: args.path })
        const compiled = compileScript(descriptor, { id: args.path, isProd: true, inlineTemplate: true })
        return { contents: compiled.content, loader: 'ts', resolveDir: dirname(args.path) }
      })
      plugin.onResolve({ filter: /\.svg\?raw$/ }, args => ({ path: require.resolve(args.path.slice(0, -4)), namespace: 'raw-svg' }))
      plugin.onLoad({ filter: /.*/, namespace: 'raw-svg' }, args => ({
        contents: 'export default ' + JSON.stringify(readFileSync(args.path, 'utf8')), loader: 'js',
      }))
    } }],
  })
  await import(pathToFileURL(output).href)
} finally {
  await window.happyDOM.close()
}
