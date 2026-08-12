import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  // Pin the dev server to 5173 and fail loudly if it's taken. Tauri's devUrl is
  // hardcoded to 5173, so without strictPort Vite would silently move to 5174+
  // and the desktop webview would load a stale/other instance on 5173 (or
  // nothing). strictPort surfaces the conflict instead of hiding it.
  server: {
    port: 5173,
    strictPort: true,
  },
  plugins: [
    react(),
    VitePWA({
      // 'prompt' so a new deploy surfaces an "Update available" banner the
      // user clicks when ready — rather than silently swapping the service
      // worker (which left open tabs stale until a hard refresh).
      registerType: 'prompt',
      // Precache the built app shell so the app boots with no connection.
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,woff2}'],
        // Plan PDFs/images are large and handled by our own IndexedDB cache
        // (planBlobCache) — keep them out of the Workbox precache/runtime cache.
        navigateFallbackDenylist: [/^\/v1\//, /^\/api\//],
        runtimeCaching: [
          {
            // API calls: always try the network (edits are queued anyway); fall
            // back to a short-lived cache only for GETs so a reload offline can
            // still show last-known data.
            urlPattern: ({ url }) =>
              url.pathname.startsWith('/v1/') || url.pathname.startsWith('/api/'),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              networkTimeoutSeconds: 5,
              expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 },
            },
          },
        ],
      },
      includeAssets: ['logo.svg'],
      manifest: {
        name: 'Reckon',
        short_name: 'Reckon',
        description: 'Construction takeoff and bill of quantities',
        theme_color: '#003566',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '/',
        icons: [
          {
            src: 'logo.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any',
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
