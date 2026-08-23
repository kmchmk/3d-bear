import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    target: 'es2019',
    chunkSizeWarningLimit: 900,
  },
})
