import { readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

const { version } = JSON.parse(readFileSync(fileURLToPath(new URL('./package.json', import.meta.url)), 'utf8')) as { version: string }

export default defineConfig({
  // One prebuilt asset set works at any runtime installation URL.
  base: './',
  define: {
    __TESTBRAID_VERSION__: JSON.stringify(version),
    // Read-only GitHub Pages demo build, see src/static-demo.ts.
    __TESTBRAID_STATIC_DEMO__: JSON.stringify(process.env.TESTBRAID_STATIC_DEMO === '1'),
  },
  plugins: [vue()],
  server: {
    // The shared canonical JSON schemas are next to frontend/, not inside it.
    fs: { allow: [fileURLToPath(new URL('../', import.meta.url))] },
    proxy: {
      '/api': 'http://127.0.0.1:8080',
    },
  },
})
