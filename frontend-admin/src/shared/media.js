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

export function normalizeMediaUrl(raw) {
  if (!raw) return ''
  try {
    const baseOrigin = raw.startsWith('/media/') || raw.startsWith('/static/')
      ? API_ORIGIN
      : window.location.origin
    const parsed = new URL(raw, baseOrigin)
    const mediaPath = parsed.pathname.startsWith('/media/') || parsed.pathname.startsWith('/static/')
    const missingPublicPort = LOCAL_HOSTS.includes(parsed.hostname) && !parsed.port
    const mixedContent = window.location.protocol === 'https:' && parsed.protocol === 'http:' && mediaPath

    if ((INTERNAL_HOSTS.includes(parsed.hostname) || missingPublicPort || mixedContent) && mediaPath) {
      const publicApp = new URL(window.location.origin)
      parsed.protocol = publicApp.protocol
      parsed.hostname = publicApp.hostname
      parsed.port = publicApp.port
    }

    return parsed.toString()
  } catch {
    return raw
  }
}
