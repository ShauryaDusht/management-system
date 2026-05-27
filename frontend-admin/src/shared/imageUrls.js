import { BASE_URL } from '../api/client'

const INTERNAL_HOSTS = ['backend', 'web', 'app', 'django', 'server']
const LOCAL_HOSTS = ['localhost', '127.0.0.1']

export const API_ORIGIN = (() => {
  try {
    return new URL(BASE_URL, window.location.origin).origin
  } catch {
    return window.location.origin
  }
})()

export function imageDebugEnabled() {
  try {
    return window.localStorage.getItem('imageDebug') === '1' || new URLSearchParams(window.location.search).get('debugImages') === '1'
  } catch {
    return false
  }
}

export function imageDebugLog(label, payload) {
  if (imageDebugEnabled()) {
    console.debug(`[image-flow] ${label}`, payload)
  }
}

export function generateImageUrl(raw) {
  if (!raw) return ''
  try {
    const baseOrigin = raw.startsWith('/media/') || raw.startsWith('/static/')
      ? API_ORIGIN
      : window.location.origin
    const parsed = new URL(raw, baseOrigin)
    const isAsset = parsed.pathname.startsWith('/media/') || parsed.pathname.startsWith('/static/')
    const missingPublicPort = LOCAL_HOSTS.includes(parsed.hostname) && !parsed.port
    const mixedContent = window.location.protocol === 'https:' && parsed.protocol === 'http:' && isAsset

    if ((INTERNAL_HOSTS.includes(parsed.hostname) || missingPublicPort || mixedContent) && isAsset) {
      const publicApp = new URL(window.location.origin)
      parsed.protocol = publicApp.protocol
      parsed.hostname = publicApp.hostname
      parsed.port = publicApp.port
    }

    const url = parsed.toString()
    imageDebugLog('generateImageUrl', { raw, url, apiOrigin: API_ORIGIN })
    return url
  } catch (error) {
    imageDebugLog('generateImageUrl.error', { raw, error })
    return raw
  }
}

export function handleImageError(event, fallbackSrc, context = {}) {
  const img = event.currentTarget
  console.warn('[image-flow] image failed to render', {
    src: img.currentSrc || img.src,
    naturalWidth: img.naturalWidth,
    naturalHeight: img.naturalHeight,
    ...context,
  })
  if (img.dataset.fallbackApplied === '1') return
  img.dataset.fallbackApplied = '1'
  img.src = fallbackSrc
}
