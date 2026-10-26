import { readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

const { version } = JSON.parse(readFileSync(fileURLToPath(new URL('./package.json', import.meta.url)), 'utf8')) as { version: string }

export default defineConfig({
  // One prebuilt asset set works at any runtime installation URL.
  base: './',
  define: { __TESTBRAID_VERSION__: JSON.stringify(version) },
  plugins: [vue()],
  server: {
    // The shared canonical JSON schemas are next to frontend/, not inside it.
    fs: { allow: [fileURLToPath(new URL('../', import.meta.url))] },
    proxy: {
      '/api': 'http://127.0.0.1:8080',
    },
  },
})
