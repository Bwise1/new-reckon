import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
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
