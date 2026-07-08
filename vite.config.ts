import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// Cache names are shared with src/offline/tiles.ts (offline area download
// writes into the same tile cache the service worker reads from).
export const TILE_CACHE = 'osm-tiles-v1'
export const API_CACHE = 'api-data-v1'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png'],
      manifest: {
        name: 'Wayfarer — Smart Travel Itinerary',
        short_name: 'Wayfarer',
        description:
          'Weather-aware, flight-aware travel itineraries with offline maps.',
        theme_color: '#0f766e',
        background_color: '#f8fafc',
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
        navigateFallback: '/index.html',
        runtimeCaching: [
          {
            // Map tiles: cache-first so previously viewed / downloaded areas
            // keep working with no connectivity.
            urlPattern: /^https:\/\/[abc]\.tile\.openstreetmap\.org\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: TILE_CACHE,
              expiration: {
                maxEntries: 4000,
                maxAgeSeconds: 60 * 60 * 24 * 60, // 60 days
              },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Weather / geocoding / places / wiki: serve fresh when online,
            // fall back to cache when offline.
            urlPattern:
              /^https:\/\/(api\.open-meteo\.com|geocoding-api\.open-meteo\.com|overpass-api\.de|en\.wikipedia\.org|restcountries\.com|query\.wikidata\.org)\/.*/i,
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
