import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

function clearAdminServiceWorkerCache() {
  if (!('serviceWorker' in navigator)) return

  window.addEventListener('load', () => {
    navigator.serviceWorker
      .getRegistrations()
      .then((registrations) =>
        Promise.all(
          registrations
            .filter((registration) => new URL(registration.scope).origin === window.location.origin)
            .map((registration) => registration.unregister()),
        ),
      )
      .catch((error) => console.warn('Admin PWA service worker cleanup failed:', error))

    if ('caches' in window) {
      caches
        .keys()
        .then((keys) =>
          Promise.all(keys.filter((key) => key.startsWith('cs-admin-')).map((key) => caches.delete(key))),
        )
        .catch((error) => console.warn('Admin PWA cache cleanup failed:', error))
    }
  })
}

clearAdminServiceWorkerCache()
