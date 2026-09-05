import { defineConfig } from 'vite'

// Reference media is local modeling input, never a website asset.
const mediaExtensions = [
  'jpg', 'jpeg', 'jpe', 'jfif', 'png', 'apng', 'gif', 'webp', 'avif',
  'heic', 'heif', 'tif', 'tiff', 'bmp', 'ico', 'svg', 'raw', 'dng', 'cr2', 'nef', 'arw',
  'mp4', 'mov', 'm4v', 'webm', 'mkv', 'avi', 'mpg', 'mpeg', 'm2ts', 'mts', '3gp', 'ogv',
  'mp3', 'wav', 'm4a', 'aac', 'ogg', 'opus', 'flac', 'aiff', 'aif',
]
const mediaPatterns = mediaExtensions.map(extension =>
  '*.' + [...extension].map(char => /[a-z]/.test(char) ? `[${char}${char.toUpperCase()}]` : char).join('')
)

export default defineConfig({
  publicDir: false,
  server: {
    fs: {
      deny: ['.env', '.env.*', '*.{crt,pem}', '**/.git/**', ...mediaPatterns],
    },
  },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 900,
  },
})
