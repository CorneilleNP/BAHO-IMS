import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

// Files from public/ the app needs offline (the build's own files are added automatically).
const PUBLIC_PRECACHE = [
  '/index.html',
  '/manifest.webmanifest',
  '/favicon.svg',
  '/baho-image.jpg',
  '/baho-login-page.jpeg',
  '/pwa-192.png',
  '/pwa-512.png',
  '/apple-touch-icon.png',
]

/** Writes dist/sw.js from pwa/sw.js with this build's file list (installable, opens offline). */
function serviceWorker(): Plugin {
  return {
    name: 'baho-service-worker',
    apply: 'build',
    generateBundle(_options, bundle) {
      const built = Object.keys(bundle)
        .filter((name) => name !== 'index.html' && !name.endsWith('.map'))
        .map((name) => `/${name}`)
      const precache = [...PUBLIC_PRECACHE, ...built].sort()
      const template = readFileSync(new URL('./pwa/sw.js', import.meta.url), 'utf8')
      const version = createHash('sha256').update(template).update(precache.join('\n')).digest('hex').slice(0, 12)
      this.emitFile({
        type: 'asset',
        fileName: 'sw.js',
        source: template.replace('__VERSION__', version).replace('__PRECACHE__', JSON.stringify(precache)),
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), serviceWorker()],
  server: {
    port: 5173,
    // Forward API calls to the Django dev server so the browser sees one origin.
    proxy: {
      '/api': 'http://127.0.0.1:8000',
    },
  },
})
