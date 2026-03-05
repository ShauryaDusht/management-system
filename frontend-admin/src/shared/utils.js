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
