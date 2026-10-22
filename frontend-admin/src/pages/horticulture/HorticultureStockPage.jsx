import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { horticultureAPI } from '../../api/horticulture'
import { inventoryAPI } from '../../api/inventory'
import { Card, Spinner, Tabs } from '../../components/ui'
import { useAuth } from '../../context/AuthContext'
import { useNotifications } from '../../context/NotificationContext'
import AdminLayout from '../../layout/AdminLayout'
import { asList } from '../../shared/utils'

import IssuesTab from '../inventory/IssuesTab'
import ItemsTab from '../inventory/ItemsTab'
import ReportTab from '../inventory/ReportTab'
import RequestsTab from '../inventory/RequestsTab'
import StockLogTab from '../inventory/StockLogTab'
import RequestsReportTab from '../reports/RequestsReportTab'

export default function HorticultureStockPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const { user } = useAuth()
  const { badges, markSeen } = useNotifications()

  // Area Stocks backend data
  const [areaData, setAreaData] = useState({
    category_id: null,
    category_name: 'Garden & Horticulture Equipment',
    items_summary: { total_items: 0, in_stock: 0, low_stock: 0, out_of_stock: 0 },
    area_stocks_summary: { total_count: 0, low_stock_count: 0 },
    items: [],
    stocks: [],
  })
  const [areaLoading, setAreaLoading] = useState(false)
  const [areaError, setAreaError] = useState('')

  // Area tab filters
  const [areaSearch, setAreaSearch] = useState('')
  const [zoneFilter, setZoneFilter] = useState('all')
  const [selectedAreaFilter, setSelectedAreaFilter] = useState('all')
  const [selectedItemFilter, setSelectedItemFilter] = useState('all')
  const [lowStockOnly, setLowStockOnly] = useState(false)
  const [hortPendingCount, setHortPendingCount] = useState(null)

  const loadHortPending = async () => {
    try {
      const res = await inventoryAPI.getRequests({ category: 'Garden & Horticulture Equipment', status: 'pending' })
      const list = asList(res.data)
      const count = list.filter((r) => r.status === 'pending').length
      setHortPendingCount(count > 0 ? count : null)
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    loadHortPending()
  }, [badges.horticultureInventory])

  const tabConfig = useMemo(() => {
    return [
      {
        key: 'items',
        label: 'Items',
        icon: '📦',
        count: badges.lowStock > 0 ? badges.lowStock : null,
        countTone: 'yellow',
      },
      {
        key: 'requests',
        label: 'Requests',
        icon: '📋',
        count: badges.horticultureInventory > 0 ? badges.horticultureInventory : hortPendingCount,
        countTone: 'red',
      },
      { key: 'issues', label: 'Issued Items', icon: '🔄' },
      { key: 'stocklog', label: 'Stock Log', icon: '🧾' },
      { key: 'inventory-report', label: 'Inventory Report', icon: 'IR' },
      { key: 'request-report', label: 'Request Report', icon: 'RR' },
      {
        key: 'areas',
        label: 'Area Stocks',
        icon: '📍',
        count: areaData?.stocks?.length || null,
        countTone: 'green',
      },
    ]
  }, [badges.horticultureInventory, badges.lowStock, hortPendingCount, areaData?.stocks?.length])

  const validTabs = useMemo(() => tabConfig.map((t) => t.key), [tabConfig])
  const initialTab = searchParams.get('tab')
  const [active, setActive] = useState(
    initialTab && validTabs.includes(initialTab) ? initialTab : 'items'
  )

  useEffect(() => {
    const tab = searchParams.get('tab')
    if (tab && validTabs.includes(tab) && tab !== active) {
      setActive(tab)
      return
    }
    if (tab && !validTabs.includes(tab) && active !== 'items') {
      setActive('items')
    }
  }, [active, searchParams, validTabs])

  useEffect(() => {
    if (active === 'requests' && badges.horticultureInventory > 0) {
      markSeen('horticultureInventory')
    }
    if (active === 'items' && badges.lowStock > 0) {
      markSeen('lowStock')
    }
  }, [active, badges.horticultureInventory, badges.lowStock, markSeen])

  // Load area stocks
  const loadAreaStocks = async () => {
    try {
      setAreaLoading(true)
      setAreaError('')
      const res = await horticultureAPI.getAreaStocks()
      setAreaData(res.data || {})
    } catch (err) {
      console.error(err)
      setAreaError('Failed to load area stocks.')
    } finally {
      setAreaLoading(false)
    }
  }

  useEffect(() => {
    loadAreaStocks()
  }, [])

  const onTabChange = (nextTab) => {
    setActive(nextTab)
    const next = new URLSearchParams(searchParams)
    next.set('tab', nextTab)
    setSearchParams(next, { replace: true })
    if (nextTab === 'areas') {
      loadAreaStocks()
    }
  }

  // Zone & Area options for the Area Stocks tab
  const zoneOptions = useMemo(() => {
    const map = new Map()
    ;(areaData.stocks || []).forEach((s) => {
      if (s.zone_id && !map.has(s.zone_id)) {
        map.set(s.zone_id, { id: s.zone_id, name: s.zone_name, color: s.zone_color })
      }
    })
    return Array.from(map.values())
  }, [areaData.stocks])

  const areaOptions = useMemo(() => {
    const map = new Map()
    ;(areaData.stocks || []).forEach((s) => {
      if (s.area_id && !map.has(s.area_id)) {
        if (zoneFilter === 'all' || String(s.zone_id) === String(zoneFilter)) {
          map.set(s.area_id, { id: s.area_id, name: s.area_name, number: s.area_number })
        }
      }
    })
    return Array.from(map.values()).sort((a, b) => a.number - b.number)
  }, [areaData.stocks, zoneFilter])

  // Filtered area stocks
  const filteredStocks = useMemo(() => {
    return (areaData.stocks || []).filter((stock) => {
      const q = areaSearch.toLowerCase().trim()
      const matchesSearch =
        !q ||
        (stock.item_name && stock.item_name.toLowerCase().includes(q)) ||
        (stock.area_name && stock.area_name.toLowerCase().includes(q))

      const matchesZone = zoneFilter === 'all' || String(stock.zone_id) === String(zoneFilter)
      const matchesArea = selectedAreaFilter === 'all' || String(stock.area_id) === String(selectedAreaFilter)
      const matchesItem = selectedItemFilter === 'all' || String(stock.item_id) === String(selectedItemFilter)
      const matchesLow = !lowStockOnly || stock.is_low

      return matchesSearch && matchesZone && matchesArea && matchesItem && matchesLow
    })
  }, [areaData.stocks, areaSearch, zoneFilter, selectedAreaFilter, selectedItemFilter, lowStockOnly])

  return (
    <AdminLayout
      title="Horticulture Inventory"
      subtitle="Stock overview, requests, issued assets, replenishment logs, and reports"
    >
      <div style={{ marginBottom: 14 }}>
        <Tabs tabs={tabConfig} active={active} onChange={onTabChange} />
      </div>

      {active === 'items' && (
        <ItemsTab
          userRole={user?.role}
          initialCategory="Garden & Horticulture Equipment"
        />
      )}

      {active === 'requests' && (
        <RequestsTab
          userRole={user?.role}
          categoryScope="Garden & Horticulture Equipment"
        />
      )}

      {active === 'issues' && (
        <IssuesTab
          userRole={user?.role}
          categoryScope="Garden & Horticulture Equipment"
        />
      )}

      {active === 'stocklog' && <StockLogTab userRole={user?.role} />}

      {active === 'inventory-report' && (
        <ReportTab
          categoryScope="Garden & Horticulture Equipment"
        />
      )}

      {active === 'request-report' && (
        <RequestsReportTab
          categoryScope="Garden & Horticulture Equipment"
        />
      )}

      {active === 'areas' && (
        <Card noPad>
          {areaError && (
            <div style={{ padding: '12px 18px', background: '#fef2f2', borderBottom: '1px solid #ef4444', color: '#991b1b', fontSize: 13, fontWeight: 600 }}>
              ⚠️ {areaError}
            </div>
          )}

          {/* Area Filters */}
          <div
            style={{
              padding: '16px 20px',
              borderBottom: '1px solid var(--border)',
              display: 'flex',
              gap: 12,
              flexWrap: 'wrap',
              alignItems: 'center',
              background: 'var(--surface-2)',
            }}
          >
            <input
              type="text"
              placeholder="Search area or item name..."
              value={areaSearch}
              onChange={(e) => setAreaSearch(e.target.value)}
              style={{
                flex: '1 1 200px',
                padding: '8px 14px',
                borderRadius: 8,
                border: '1px solid var(--border)',
                background: 'var(--surface)',
                color: 'var(--text)',
                fontSize: 13,
              }}
            />
            <select
              value={zoneFilter}
              onChange={(e) => {
                setZoneFilter(e.target.value)
                setSelectedAreaFilter('all')
              }}
              style={{
                padding: '8px 12px',
                borderRadius: 8,
                border: '1px solid var(--border)',
                background: 'var(--surface)',
                color: 'var(--text)',
                fontSize: 13,
              }}
            >
              <option value="all">All Zones</option>
              {zoneOptions.map((z) => (
                <option key={z.id} value={z.id}>
                  {z.name}
                </option>
              ))}
            </select>
            <select
              value={selectedAreaFilter}
              onChange={(e) => setSelectedAreaFilter(e.target.value)}
              style={{
                padding: '8px 12px',
                borderRadius: 8,
                border: '1px solid var(--border)',
                background: 'var(--surface)',
                color: 'var(--text)',
                fontSize: 13,
                maxWidth: 220,
              }}
            >
              <option value="all">All Areas ({areaOptions.length})</option>
              {areaOptions.map((a) => (
                <option key={a.id} value={a.id}>
                  #{a.number} {a.name}
                </option>
              ))}
            </select>
            <select
              value={selectedItemFilter}
              onChange={(e) => setSelectedItemFilter(e.target.value)}
              style={{
                padding: '8px 12px',
                borderRadius: 8,
                border: '1px solid var(--border)',
                background: 'var(--surface)',
                color: 'var(--text)',
                fontSize: 13,
                maxWidth: 220,
              }}
            >
              <option value="all">All Equipment ({areaData.items?.length || 0})</option>
              {(areaData.items || []).map((it) => (
                <option key={it.id} value={it.id}>
                  {it.name}
                </option>
              ))}
            </select>
            <label
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 13,
                cursor: 'pointer',
                fontWeight: 600,
                color: lowStockOnly ? '#c2410c' : 'var(--text-2)',
              }}
            >
              <input
                type="checkbox"
                checked={lowStockOnly}
                onChange={(e) => setLowStockOnly(e.target.checked)}
                style={{ width: 16, height: 16 }}
              />
              Low Stock Only ⚠️
            </label>
          </div>

          {/* Area Stocks Table */}
          {areaLoading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 50 }}>
              <Spinner size={32} />
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: 'var(--surface-2)', borderBottom: '1px solid var(--border)', color: 'var(--text-2)' }}>
                    <th style={{ padding: '12px 18px', fontWeight: 600 }}>Area</th>
                    <th style={{ padding: '12px 18px', fontWeight: 600 }}>Zone</th>
                    <th style={{ padding: '12px 18px', fontWeight: 600 }}>Item Name</th>
                    <th style={{ padding: '12px 18px', fontWeight: 600, textAlign: 'right' }}>Quantity in Area</th>
                    <th style={{ padding: '12px 18px', fontWeight: 600 }}>Unit</th>
                    <th style={{ padding: '12px 18px', fontWeight: 600, textAlign: 'right' }}>Threshold</th>
                    <th style={{ padding: '12px 18px', fontWeight: 600, textAlign: 'center' }}>Stock Status</th>
                    <th style={{ padding: '12px 18px', fontWeight: 600 }}>Last Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredStocks.length === 0 ? (
                    <tr>
                      <td colSpan={8} style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-3)' }}>
                        No area stock records match the selected filters.
                      </td>
                    </tr>
                  ) : (
                    filteredStocks.map((stock) => (
                      <tr
                        key={stock.id}
                        style={{
                          borderBottom: '1px solid var(--border)',
                          background: stock.is_low ? '#fffbeb' : 'transparent',
                          transition: 'background 0.15s',
                        }}
                      >
                        <td style={{ padding: '12px 18px', fontWeight: 700, color: 'var(--text)' }}>
                          <span style={{ fontSize: 11, color: 'var(--text-3)', marginRight: 6 }}>#{stock.area_number}</span>
                          {stock.area_name}
                        </td>
                        <td style={{ padding: '12px 18px' }}>
                          <span
                            style={{
                              display: 'inline-block',
                              padding: '2px 8px',
                              borderRadius: 99,
                              fontSize: 11,
                              fontWeight: 700,
                              background: `${stock.zone_color || '#16a34a'}20`,
                              color: stock.zone_color || '#16a34a',
                            }}
                          >
                            {stock.zone_name || 'Zone'}
                          </span>
                        </td>
                        <td style={{ padding: '12px 18px', fontWeight: 600 }}>{stock.item_name}</td>
                        <td
                          style={{
                            padding: '12px 18px',
                            textAlign: 'right',
                            fontWeight: 800,
                            fontSize: 16,
                            color: stock.is_low ? '#b45309' : 'var(--text)',
                          }}
                        >
                          {stock.quantity}
                        </td>
                        <td style={{ padding: '12px 18px', color: 'var(--text-2)' }}>{stock.unit || '-'}</td>
                        <td style={{ padding: '12px 18px', textAlign: 'right', color: 'var(--text-3)' }}>
                          {stock.low_stock_threshold}
                        </td>
                        <td style={{ padding: '12px 18px', textAlign: 'center' }}>
                          {stock.is_low ? (
                            <span
                              style={{
                                padding: '3px 8px',
                                borderRadius: 6,
                                background: '#fee2e2',
                                color: '#991b1b',
                                fontSize: 11,
                                fontWeight: 700,
                              }}
                            >
                              ⚠️ Low Stock ({stock.quantity} left)
                            </span>
                          ) : (
                            <span
                              style={{
                                padding: '3px 8px',
                                borderRadius: 6,
                                background: '#dcfce7',
                                color: '#166534',
                                fontSize: 11,
                                fontWeight: 600,
                              }}
                            >
                              Sufficient
                            </span>
                          )}
                        </td>
                        <td style={{ padding: '12px 18px', fontSize: 11, color: 'var(--text-3)' }}>
                          {stock.last_updated ? new Date(stock.last_updated).toLocaleDateString('en-IN') : '-'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
    </AdminLayout>
  )
}
