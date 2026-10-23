import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { inventoryAPI } from '../api/inventory'
import { hkAPI } from '../api/housekeeping'
import { useAuth } from './AuthContext'

const NotificationContext = createContext(null)

const BADGE_KEYS = ['inventory', 'lowStock', 'housekeeping', 'horticultureInventory']

function createEmptyBadges() {
  return { inventory: 0, lowStock: 0, housekeeping: 0, horticultureInventory: 0 }
}

function createEmptySeen() {
  return { inventory: [], lowStock: [], housekeeping: [], horticultureInventory: [] }
}

function normalizeSeen(raw) {
  const base = createEmptySeen()
  if (!raw || typeof raw !== 'object') return base
  BADGE_KEYS.forEach((k) => {
    const v = raw[k]
    base[k] = Array.isArray(v) ? v.map((id) => String(id)) : []
  })
  return base
}

function normalizeList(payload) {
  if (Array.isArray(payload)) return payload
  if (Array.isArray(payload?.results)) return payload.results
  return []
}

function uniqueIds(ids) {
  return Array.from(new Set(ids.map((id) => String(id))))
}

function buildId(prefix, value) {
  if (value == null) return null
  return `${prefix}-${value}`
}

function getUnseenCount(currentIds, seenIds) {
  const seen = new Set(seenIds.map((id) => String(id)))
  return currentIds.reduce((acc, id) => (seen.has(String(id)) ? acc : acc + 1), 0)
}

export function NotificationProvider({ children }) {
  const { user, loading } = useAuth()
  const [badges, setBadges] = useState(createEmptyBadges)

  const storageKey = useMemo(
    () => `cms_notification_seen_${user?.id || user?.username || 'anon'}`,
    [user?.id, user?.username]
  )
  const seenIdsRef = useRef(createEmptySeen())
  const currentIdsRef = useRef(createEmptySeen())

  const fetchBadges = useCallback(async () => {
    if (loading || !user) return
    try {
      const [reqRes, hortReqRes, purchaseRes, stockRes, inchargeRes, leaveRes] = await Promise.allSettled([
        inventoryAPI.getRequests({ status: 'pending', page_size: 1000, exclude_category: 'Garden & Horticulture Equipment' }),
        inventoryAPI.getRequests({ status: 'pending', page_size: 1000, category: 'Garden & Horticulture Equipment' }),
        inventoryAPI.getPurchaseRequests({ status: 'pending', page_size: 1000 }),
        inventoryAPI.getLowStockItems(),
        hkAPI.getInchargeAssignments('pending_acceptance'),
        hkAPI.getLeaveRequests(),
      ])

      // Pending inventory requests IDs (Housekeeping / General only)
      let invIds = []
      if (reqRes.status === 'fulfilled') {
        const list = normalizeList(reqRes.value?.data)
        invIds = uniqueIds(
          list
            .map((r) => buildId('req', r?.id))
            .filter(Boolean)
        )
      }
      if (purchaseRes.status === 'fulfilled') {
        const list = normalizeList(purchaseRes.value?.data)
        invIds = uniqueIds(
          invIds.concat(
            list
              .map((r) => buildId('purchase', r?.id))
              .filter(Boolean)
          )
        )
      }

      // Pending horticulture requests IDs
      let hortIds = []
      if (hortReqRes.status === 'fulfilled') {
        const list = normalizeList(hortReqRes.value?.data)
        hortIds = uniqueIds(
          list
            .map((r) => buildId('hort-req', r?.id))
            .filter(Boolean)
        )
      }

      // Low stock item IDs
      let lowIds = []
      if (stockRes.status === 'fulfilled') {
        const list = normalizeList(stockRes.value?.data)
        lowIds = uniqueIds(
          list
            .map((item) => buildId('item', item?.id))
            .filter(Boolean)
        )
      }

      // Pending housekeeping incharge + leave IDs
      let hkIds = []
      if (inchargeRes.status === 'fulfilled') {
        const list = normalizeList(inchargeRes.value?.data)
        hkIds = hkIds.concat(
          list
            .map((row) => buildId('incharge', row?.id))
            .filter(Boolean)
        )
      }
      if (leaveRes.status === 'fulfilled') {
        const leaves = normalizeList(leaveRes.value?.data)
          .filter((l) => l.status === 'awaiting_incharge' || l.status === 'pending_admin_approval')
          .map((l) => buildId('leave', l?.id))
          .filter(Boolean)
        hkIds = hkIds.concat(leaves)
      }

      hkIds = uniqueIds(hkIds)
      currentIdsRef.current = {
        inventory: invIds,
        lowStock: lowIds,
        housekeeping: hkIds,
        horticultureInventory: hortIds,
      }

      const seenIds = seenIdsRef.current
      setBadges({
        inventory: getUnseenCount(invIds, seenIds.inventory),
        lowStock: getUnseenCount(lowIds, seenIds.lowStock),
        housekeeping: getUnseenCount(hkIds, seenIds.housekeeping),
        horticultureInventory: getUnseenCount(hortIds, seenIds.horticultureInventory),
      })
    } catch {
      // fail silently — badges just don't update
    }
  }, [loading, user])

  const markSeen = useCallback((bucket) => {
    if (!BADGE_KEYS.includes(bucket)) return

    const currentIds = currentIdsRef.current[bucket] || []
    if (currentIds.length) {
      const nextSeen = {
        ...seenIdsRef.current,
        [bucket]: uniqueIds([...(seenIdsRef.current[bucket] || []), ...currentIds]),
      }
      seenIdsRef.current = nextSeen
      try {
        localStorage.setItem(storageKey, JSON.stringify(nextSeen))
      } catch {
        // ignore storage errors
      }
    }

    setBadges((prev) => (prev[bucket] > 0 ? { ...prev, [bucket]: 0 } : prev))
  }, [storageKey])

  useEffect(() => {
    if (loading) return

    if (!user) {
      seenIdsRef.current = createEmptySeen()
      currentIdsRef.current = createEmptySeen()
      setBadges(createEmptyBadges())
      return
    }

    try {
      const raw = localStorage.getItem(storageKey)
      seenIdsRef.current = raw ? normalizeSeen(JSON.parse(raw)) : createEmptySeen()
    } catch {
      seenIdsRef.current = createEmptySeen()
    }

  }, [loading, storageKey, user])

  useEffect(() => {
    if (loading || !user) return

    let cancelled = false
    const run = () => { if (!cancelled) fetchBadges() }
    run()
    const interval = setInterval(run, 60000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [fetchBadges, loading, user])

  return (
    <NotificationContext.Provider value={{ badges, refresh: fetchBadges, markSeen }}>
      {children}
    </NotificationContext.Provider>
  )
}

export function useNotifications() {
  const ctx = useContext(NotificationContext)
  if (!ctx) throw new Error('useNotifications must be used within NotificationProvider')
  return ctx
}
