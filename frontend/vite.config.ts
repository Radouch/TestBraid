import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  server: {
    // The shared canonical JSON schemas are next to frontend/, not inside it.
    fs: { allow: [fileURLToPath(new URL('../', import.meta.url))] },
    proxy: {
      '/api': 'http://127.0.0.1:8080',
    },
  },
})
