/**
 * Shared list utility.
 * This is a simple helper to normalise API responses into a consistent shape for
 * frontend components that expect lists.
 * Usage:
 *   import { asList } from '../../shared/utils'
 */

/**
 * Normalise any API response shape into a plain array.
 * Handles:
 *   - already-an-array responses
 *   - DRF paginated { results: [...] }
 *   - custom { items: [...] } wrappers
 *
 * @param {*} data - The value from axios response.data
 * @returns {Array}
 */
export function asList(data) {
  if (Array.isArray(data)) return data
  if (Array.isArray(data?.results)) return data.results
  if (Array.isArray(data?.items)) return data.items
  return []
}

// Error message extractor — replaces all local getErrorMessage copies
export function getErrorMessage(error, fallback = 'Something went wrong.') {
  return error?.response?.data?.detail
    || error?.response?.data?.message
    || error?.message
    || fallback
}

// Trigger a file download from a blob response
export function triggerDownload(blob, filename) {
  const href = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = href
  a.download = filename
  a.click()
  URL.revokeObjectURL(href)
}

// Get today's date as YYYY-MM-DD in local time
export function todayISO() {
  const d = new Date()
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
}
