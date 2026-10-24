const pad = (n) => String(n).padStart(2, '0')

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

export function todayISO() {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function prevMonthOf(iso) {
  const [y, m] = String(iso || '').split('-').map(Number)
  if (!y || !m) return ''
  return m === 1 ? `${y - 1}-12` : `${y}-${pad(m - 1)}`
}

export function formatDMY(iso) {
  if (!iso) return ''
  const parts = String(iso).split('-')
  if (parts.length < 3) return iso
  const [y, m, d] = parts
  return `${d}.${m}.${y}`
}

export function monthLabel(ym, sep = '-') {
  const [y, m] = String(ym || '').split('-').map(Number)
  if (!y || !m) return ''
  return `${MONTHS[m - 1]}${sep}${y}`
}

export function monthRange(a, b, sep = '-', join = ' to ') {
  if (!a) return ''
  if (!b || b === a) return monthLabel(a, sep)
  const [x, y] = a <= b ? [a, b] : [b, a]
  return `${monthLabel(x, sep)}${join}${monthLabel(y, sep)}`
}

const ONES = [
  '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
  'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen',
]
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']

const twoDigits = (n) => {
  if (n < 20) return ONES[n]
  const t = TENS[Math.floor(n / 10)]
  const o = ONES[n % 10]
  return o ? `${t}-${o}` : t
}

const threeDigits = (n) => {
  const h = Math.floor(n / 100)
  const r = n % 100
  const parts = []
  if (h) parts.push(`${ONES[h]} Hundred`)
  if (r) parts.push(twoDigits(r))
  return parts.join(' ')
}

export function rupeesInWords(amount) {
  let n = Math.round(Number(amount) || 0)
  if (n <= 0) return 'Rupees Zero Only'
  const crore = Math.floor(n / 1e7); n %= 1e7
  const lakh = Math.floor(n / 1e5); n %= 1e5
  const thousand = Math.floor(n / 1e3); n %= 1e3
  const parts = []
  if (crore) parts.push(`${threeDigits(crore)} Crore`)
  if (lakh) parts.push(`${twoDigits(lakh)} Lakh`)
  if (thousand) parts.push(`${twoDigits(thousand)} Thousand`)
  if (n) parts.push(threeDigits(n))
  return `Rupees ${parts.join(' ')} Only`
}

export const inr = (n) =>
  Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export const inr0 = (n) =>
  Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })

export function calcNote({ units, rate, water, fixed, extras = [], isCancelled, is_cancelled }) {
  if (isCancelled || is_cancelled) {
    return { hasUnits: false, electricity: 0, water: 0, extrasTotal: 0, total: 0 }
  }
  const u = Number(units)
  const hasUnits = !fixed && units !== '' && units != null && !Number.isNaN(u)
  const electricity = hasUnits ? Math.round(u * (Number(rate) || 0)) : 0
  const waterAmt = Number(water) || 0
  const extrasTotal = (extras || []).reduce((sum, x) => sum + (Number(x.amount) || 0), 0)
  return { hasUnits, electricity, water: waterAmt, extrasTotal, total: electricity + waterAmt + extrasTotal }
}

export function splitName(full) {
  const s = String(full || '').trim()
  const i = s.indexOf(' (')
  return i === -1 ? { name: s, sub: '' } : { name: s.slice(0, i), sub: s.slice(i + 1) }
}

const roman = (n) => ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x', 'xi', 'xii', 'xiii', 'xiv', 'xv'][n - 1] || String(n)

export function buildNote(rec, settings = {}) {
  const isCancelled = Boolean(rec.isCancelled || rec.is_cancelled)
  const calc = calcNote(rec)
  const { name, sub } = splitName(rec.name)
  const monthSpaced = monthRange(rec.month, rec.monthTo, ' ', ' to ')

  const items = []
  if (!isCancelled) {
    if (!rec.fixed) items.push({ type: 'power' })
    if (calc.water) {
      const isWc = Boolean(rec.name && rec.name.includes('(WC)'))
      const waterLabel = isWc || !rec.fixed ? 'Water usages charges' : 'Fixed charges'
      items.push({ type: 'line', label: `${waterLabel}\u00a0\u00a0(${monthSpaced})`, amount: calc.water })
    }
    ;(rec.extras || [])
      .filter((x) => String(x.label || '').trim() || Number(x.amount))
      .forEach((x) => items.push({ type: 'line', label: String(x.label || '').trim(), amount: Number(x.amount) || 0 }))
    items.forEach((it, i) => { it.no = `(${roman(i + 1)})` })
  }

  const bank = Array.isArray(settings.bank) ? settings.bank.filter(([l, v]) => String(l || '').trim() || String(v || '').trim()) : []

  return {
    headline: settings.headline || 'Demand Note',
    paymentNote: settings.paymentNote || '',
    bank,
    signatory: settings.signatory || { name: 'Sujeet Kumar, SE', title: 'Estate Officer' },
    noteNo: isCancelled ? 'CANCELLED' : (rec.noteNo || ''),
    date: formatDMY(rec.date),
    name,
    sub,
    addressLines: String(rec.address || '').split('\n').filter((l) => l.trim()),
    monthHyphen: monthRange(rec.month, rec.monthTo, '-', ' to '),
    units: rec.units,
    rate: Number(rec.rate) || 0,
    fixed: !!rec.fixed,
    isCancelled,
    items,
    ...calc,
    totalWords: isCancelled ? 'Demand Note Cancelled — Rupees Zero Only' : rupeesInWords(calc.total),
  }
}

export function pdfFileName(noteNo, headline, shopName) {
  const digits = String(noteNo || '').split('/').pop().replace(/[^a-z0-9]/gi, '')
  const initials = (String(headline || '').match(/[A-Za-z0-9]+/g) || []).map((w) => w[0]).join('').toLowerCase()
  const slug = splitName(shopName).name.replace(/^m\/s\.?\s*/i, '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '')
  return [digits, initials, slug].filter(Boolean).join('-')
}

export function calcMeters(meters = []) {
  const rows = (meters || []).map((m) => {
    const filled = String(m.current ?? '').trim() !== '' && String(m.previous ?? '').trim() !== ''
    const units = filled ? Math.round((Number(m.current) - Number(m.previous)) * 1000) / 1000 : null
    const invalid = filled && (Number.isNaN(units) || units < 0)
    const amount = filled && !invalid ? Math.round(units * (Number(m.rate) || 0)) : 0
    return { ...m, filled, units, invalid, amount }
  })
  return {
    rows,
    total: rows.reduce((sum, r) => sum + r.amount, 0),
    complete: rows.length > 0 && rows.every((r) => r.filled && !r.invalid),
    hasInvalid: rows.some((r) => r.invalid),
  }
}

export function billingLabel(rec) {
  if (rec.periodType === 'range') {
    const from = rec.from || rec.from_date || ''
    const to = rec.to || rec.to_date || ''
    const [a, b] = from && to && from > to ? [to, from] : [from, to]
    return a && b && a !== b ? `${formatDMY(a)} to ${formatDMY(b)}` : formatDMY(a || b)
  }
  return monthRange(rec.month, rec.monthTo, ' ', ' to ')
}

export function buildElectricityNote(rec, settings = {}) {
  const calc = calcMeters(rec.meters)
  const bank = Array.isArray(settings.bank) ? settings.bank.filter(([l, v]) => String(l || '').trim() || String(v || '').trim()) : []

  return {
    headline: settings.headline || 'Demand Note',
    paymentNote: settings.paymentNote || '',
    bank,
    signatory: settings.signatory || { name: 'Sujeet Kumar, SE', title: 'Estate Officer' },
    noteNo: rec.noteNo || '',
    date: formatDMY(rec.date),
    toLine: (rec.toLine || '').trim() || rec.name,
    addressLines: String(rec.address || '').split('\n').filter((l) => l.trim()),
    intro: rec.intro || '',
    billing: billingLabel(rec),
    meters: calc.rows,
    multi: calc.rows.length > 1,
    total: calc.total,
    totalWords: rupeesInWords(calc.total),
    complete: calc.complete,
    hasInvalid: calc.hasInvalid,
  }
}

export function getExpiryStatus(expiryDateStr, alertDays = 30) {
  if (!expiryDateStr || !String(expiryDateStr).trim()) {
    return { status: 'none', label: 'No expiry set', days: null, formattedDate: '' }
  }
  const clean = String(expiryDateStr).trim()
  const parts = clean.split('-')
  if (parts.length < 3) {
    return { status: 'none', label: 'Invalid date', days: null, formattedDate: clean }
  }

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const expiry = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]))
  expiry.setHours(0, 0, 0, 0)

  const diffTime = expiry.getTime() - today.getTime()
  const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24))
  const formatted = `${parts[2]}/${parts[1]}/${parts[0]}`

  if (diffDays < 0) {
    const overdue = Math.abs(diffDays)
    return {
      status: 'expired',
      days: diffDays,
      overdueDays: overdue,
      label: overdue === 1 ? 'Expired yesterday' : `Expired (${overdue}d ago)`,
      badgeText: `Expired (${overdue}d ago)`,
      fullText: `Expired on ${formatted} (${overdue} days ago)`,
      color: '#dc2626',
      bg: '#fee2e2',
      border: '#fca5a5',
      formattedDate: formatted,
    }
  }

  if (diffDays === 0) {
    return {
      status: 'expired',
      days: 0,
      overdueDays: 0,
      label: 'Expires today',
      badgeText: 'Expires today!',
      fullText: `Agreement expires today (${formatted})!`,
      color: '#dc2626',
      bg: '#fee2e2',
      border: '#fca5a5',
      formattedDate: formatted,
    }
  }

  const threshold = Number(alertDays) || 30
  if (diffDays <= threshold) {
    return {
      status: 'expiring',
      days: diffDays,
      label: diffDays === 1 ? 'Expires tomorrow' : `Expires in ${diffDays}d`,
      badgeText: `Expiring in ${diffDays}d`,
      fullText: `Expires on ${formatted} (in ${diffDays} days)`,
      color: '#b45309',
      bg: '#fef3c7',
      border: '#fcd34d',
      formattedDate: formatted,
    }
  }

  return {
    status: 'active',
    days: diffDays,
    label: `Valid (${diffDays}d left)`,
    badgeText: `Exp: ${formatted}`,
    fullText: `Valid until ${formatted} (${diffDays} days left)`,
    color: '#15803d',
    bg: '#dcfce7',
    border: '#86efac',
    formattedDate: formatted,
  }
}

export function parseFlexibleDate(str) {
  if (!str || typeof str !== 'string') return null
  const clean = str.trim()
  if (!clean || clean === '-' || clean.toLowerCase() === 'present') return null

  const dmyMatch = clean.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{2,4})$/)
  if (dmyMatch) {
    const day = parseInt(dmyMatch[1], 10)
    const monthStr = dmyMatch[2].toLowerCase()
    let year = parseInt(dmyMatch[3], 10)
    if (year < 100) year += 2000
    const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
    const monthIdx = months.indexOf(monthStr)
    if (monthIdx >= 0) {
      return new Date(year, monthIdx, day)
    }
  }

  const isoMatch = clean.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (isoMatch) {
    return new Date(parseInt(isoMatch[1], 10), parseInt(isoMatch[2], 10) - 1, parseInt(isoMatch[3], 10))
  }

  const dmyNumMatch = clean.match(/^(\d{2})-(\d{2})-(\d{4})$/)
  if (dmyNumMatch) {
    return new Date(parseInt(dmyNumMatch[3], 10), parseInt(dmyNumMatch[2], 10) - 1, parseInt(dmyNumMatch[1], 10))
  }

  const d = new Date(clean)
  return isNaN(d.getTime()) ? null : d
}

export function calcStayedDuration(startDateStr, endDateStr = null) {
  const start = parseFlexibleDate(startDateStr)
  if (!start) return ''
  const end = endDateStr ? (parseFlexibleDate(endDateStr) || new Date()) : new Date()

  let years = end.getFullYear() - start.getFullYear()
  let months = end.getMonth() - start.getMonth()
  let days = end.getDate() - start.getDate()

  if (days < 0) {
    months -= 1
  }
  if (months < 0) {
    years -= 1
    months += 12
  }

  if (years > 0 && months > 0) return `${years}y ${months}m`
  if (years > 0) return `${years}y`
  if (months > 0) return `${months}m`
  const diffDays = Math.max(1, Math.round((end - start) / (1000 * 60 * 60 * 24)))
  return `${diffDays}d`
}

export function calcHousingExpiry(expiryText, alertDays = 30) {
  if (!expiryText || typeof expiryText !== 'string') return null
  const clean = expiryText.trim()
  const lower = clean.toLowerCase()
  if (lower.includes('poe') || lower.includes('relocation') || lower === '-') {
    return null
  }

  const dateMatch = clean.match(/(\d{1,2}-[A-Za-z]{3}-\d{2,4})|(\d{4}-\d{2}-\d{2})|(\d{1,2}-\d{1,2}-\d{4})/)
  if (!dateMatch) return null

  const expDate = parseFlexibleDate(dateMatch[0])
  if (!expDate) return null

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  expDate.setHours(0, 0, 0, 0)

  const diffTime = expDate.getTime() - today.getTime()
  const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24))

  if (diffDays < 0) {
    const overdue = Math.abs(diffDays)
    return {
      isExpired: true,
      overdueDays: overdue,
      badgeText: `Expired (${overdue}d ago)`,
    }
  }
  if (diffDays <= alertDays) {
    return {
      isExpiringSoon: true,
      daysLeft: diffDays,
      badgeText: `Expiring in ${diffDays}d`,
    }
  }
  return null
}
