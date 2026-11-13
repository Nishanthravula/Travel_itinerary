/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  /** Public, referrer-restricted key for the Google Maps Embed API. */
  readonly VITE_GOOGLE_MAPS_EMBED_KEY?: string
}
