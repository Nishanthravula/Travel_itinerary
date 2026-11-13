import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import '@fontsource-variable/figtree/wght.css'
import '@fontsource-variable/bricolage-grotesque/wght.css'
import './ui/tokens.css'
import './styles.css'
import App from './App'
import ErrorBoundary from './components/ErrorBoundary'

// Auto-updating service worker: the app shell, viewed map data and API
// responses are cached for offline use (see vite.config.ts).
registerSW({ immediate: true })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
