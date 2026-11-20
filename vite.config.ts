import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

const MAP_CACHE = 'map-data-v2'
const API_CACHE = 'api-data-v2'

export default defineConfig({
  // The map library is large but loads only when a plan is opened.
  build: { chunkSizeWarningLimit: 1200 },
  test: { exclude: ['e2e/**', 'node_modules/**', 'dist/**'] },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png'],
      manifest: {
        name: 'Wayfarer trip planner',
        short_name: 'Wayfarer',
        description:
          'Three complete trip plans to compare: sights, local food and places to stay.',
        theme_color: '#2743d6',
        background_color: '#f6f7f5',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        cleanupOutdatedCaches: true,
        navigateFallback: '/index.html',
        // A real page, not part of the app: never answer it with the app shell.
        navigateFallbackDenylist: [/^\/privacy\.html$/],
        runtimeCaching: [
          {
            // Wikipedia photos of places and cities: kept so saved trips
            // still show them offline.
            urlPattern: /^https:\/\/upload\.wikimedia\.org\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'photos-v1',
              expiration: { maxEntries: 300, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Map style, glyphs, sprites and vector tiles: cache-first, so
            // areas already viewed keep drawing with no connectivity.
            urlPattern: /^https:\/\/tiles\.openfreemap\.org\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: MAP_CACHE,
              expiration: {
                maxEntries: 3000,
                maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
              },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Weather / geocoding / wiki: serve fresh when online,
            // fall back to cache when offline.
            urlPattern:
              /^https:\/\/(api\.open-meteo\.com|geocoding-api\.open-meteo\.com|en\.wikipedia\.org)\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: API_CACHE,
              networkTimeoutSeconds: 8,
              expiration: {
                maxEntries: 200,
                maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
              },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
})
