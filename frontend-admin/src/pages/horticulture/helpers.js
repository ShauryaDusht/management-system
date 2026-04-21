import { asList } from '../../shared/utils'

export function toDisplayName(entity, fallback = '-') {
  if (!entity) return fallback
  return entity.full_name
    || entity.supervisor_name
    || entity.worker_name
    || `${entity.first_name || ''} ${entity.last_name || ''}`.trim()
    || entity.username
    || fallback
}

export function formatDate(value, fallback = '-') {
  if (!value) return fallback
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return date.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

export function formatDateTime(value, fallback = '-') {
  if (!value) return fallback
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return date.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function getZoneTone(colorName) {
  const key = String(colorName || '').trim().toLowerCase()
  const map = {
    red: { accent: '#dc2626', soft: '#fee2e2', text: '#991b1b' },
    blue: { accent: '#2563eb', soft: '#dbeafe', text: '#1d4ed8' },
    black: { accent: '#111827', soft: '#e5e7eb', text: '#1f2937' },
  }
  return map[key] || { accent: 'var(--green-800)', soft: '#dcfce7', text: '#166534' }
}

export function taskChipStyle(urgency) {
  if (urgency === 'overdue') {
    return { background: '#fee2e2', color: '#991b1b', border: '#fecaca' }
  }
  if (urgency === 'due_soon') {
    return { background: '#fef3c7', color: '#92400e', border: '#fde68a' }
  }
  return { background: '#d1fae5', color: '#065f46', border: '#a7f3d0' }
}

export function humanizeStatus(value) {
  const key = String(value || '').trim().toLowerCase()
  if (!key) return '-'
  if (key === 'half_day') return 'Half Day'
  if (key === 'not_submitted') return 'Not Submitted'
  return key
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

export function humanizeSeason(value) {
  return humanizeStatus(value)
}

export function priorityZoneCards(zoneStatus) {
  const list = asList(zoneStatus)
  const preferred = ['Zone Red', 'Zone Blue', 'Zone Black']
  const map = new Map(list.map((zone) => [zone.zone_name, zone]))
  const matched = preferred.map((name) => map.get(name)).filter(Boolean)
  if (matched.length === preferred.length) return matched
  return list.slice(0, 3)
}
