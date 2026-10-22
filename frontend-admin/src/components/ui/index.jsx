// -- Button -------------------------------------------------------------------
export function Btn({
  children,
  onClick,
  variant = 'primary',
  size = 'md',
  disabled,
  style,
  type = 'button',
}) {
  const base = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    borderRadius: 9,
    fontWeight: 600,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.5 : 1,
    border: 'none',
    transition: 'all 0.15s',
    fontSize: size === 'sm' ? 12 : 13,
    padding: size === 'sm' ? '6px 12px' : size === 'lg' ? '12px 20px' : '9px 16px',
  }
  const variants = {
    primary: { background: 'var(--green-800)', color: '#fff' },
    secondary: {
      background: 'var(--surface-2)',
      color: 'var(--text)',
      border: '1px solid var(--border)',
    },
    danger: { background: '#dc2626', color: '#fff' },
    success: { background: '#16a34a', color: '#fff' },
    orange: { background: 'var(--orange-600)', color: '#fff' },
    ghost: {
      background: 'transparent',
      color: 'var(--text-2)',
      border: '1px solid var(--border)',
    },
  }
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      style={{ ...base, ...variants[variant], ...style }}
    >
      {children}
    </button>
  )
}

// -- Card ---------------------------------------------------------------------
export function Card({ children, style, onClick, noPad }) {
  return (
    <div
      onClick={onClick}
      style={{
        background: 'var(--surface)',
        borderRadius: 14,
        border: '1px solid var(--border)',
        padding: noPad ? 0 : '18px 20px',
        overflow: 'hidden',
        cursor: onClick ? 'pointer' : 'default',
        ...style,
      }}
    >
      {children}
    </div>
  )
}

// -- Badge / Status -----------------------------------------------------------
export function Badge({ value, style }) {
  const MAP = {
    pending: { bg: '#fff7ed', color: '#c2410c', text: 'Pending' },
    approved: { bg: '#d1fae5', color: '#065f46', text: 'Approved' },
    rejected: { bg: '#fee2e2', color: '#991b1b', text: 'Rejected' },
    pending_acceptance: { bg: '#dbeafe', color: '#1d4ed8', text: 'Pending Acceptance' },
    pending_admin_approval: { bg: '#fef3c7', color: '#92400e', text: 'Pending Admin' },
    declined: { bg: '#fee2e2', color: '#991b1b', text: 'Declined' },
    admin_rejected: { bg: '#fee2e2', color: '#991b1b', text: 'Admin Rejected' },
    issued: { bg: '#dbeafe', color: '#1d4ed8', text: 'Issued' },
    done: { bg: '#d1fae5', color: '#065f46', text: 'Done' },
    skipped: { bg: '#f3f4f6', color: '#4b5563', text: 'Skipped' },
    ongoing: { bg: '#dbeafe', color: '#1d4ed8', text: 'Ongoing' },
    completed: { bg: '#d1fae5', color: '#065f46', text: 'Completed' },
    present: { bg: '#d1fae5', color: '#065f46', text: 'Present' },
    absent: { bg: '#fee2e2', color: '#991b1b', text: 'Absent' },
    late: { bg: '#fef3c7', color: '#92400e', text: 'Late' },
    leave: { bg: '#dbeafe', color: '#1d4ed8', text: 'Leave' },
    low_stock: { bg: '#fef3c7', color: '#92400e', text: 'Low Stock' },
    out_of_stock: { bg: '#fee2e2', color: '#991b1b', text: 'Out of Stock' },
    in_stock: { bg: '#d1fae5', color: '#065f46', text: 'In Stock' },
    admin: { bg: '#ede9fe', color: '#5b21b6', text: 'Admin' },
    inventory_manager: { bg: '#fef3c7', color: '#92400e', text: 'Inv. Manager' },
    hk_inventory_manager: { bg: '#ecfeff', color: '#155e75', text: 'HK / Inv. Manager' },
    hostel_office: { bg: '#e0f2fe', color: '#075985', text: 'Hostel Office' },
    horticulture_manager: { bg: '#dcfce7', color: '#166534', text: 'Horti Manager' },
    supervisor: { bg: '#d1fae5', color: '#065f46', text: 'Supervisor' },
    caretaker: { bg: '#fff7ed', color: '#c2410c', text: 'Caretaker' },
    plant_engineer: { bg: '#ede9fe', color: '#6d28d9', text: 'Substation & WTP Engr' },
    electrical_supervisor: { bg: '#e0e7ff', color: '#3730a3', text: 'Substation Supervisor' },
    electrical_operator: { bg: '#ede9fe', color: '#4338ca', text: 'Substation Operator' },
    wtp_supervisor: { bg: '#e0f2fe', color: '#0369a1', text: 'WTP/STP Supervisor' },
    wtp_operator: { bg: '#e0f7fa', color: '#0e7490', text: 'WTP/STP Operator' },
    hvac_engineer: { bg: '#e0f2fe', color: '#0369a1', text: 'HVAC Engineer' },
    hvac_supervisor: { bg: '#fef3c7', color: '#b45309', text: 'HVAC Supervisor' },
    hvac_operator: { bg: '#ffedd5', color: '#c2410c', text: 'HVAC Operator' },
    urgent: { bg: '#fee2e2', color: '#991b1b', text: '⚡ Urgent' },
  }
  const m =
    MAP[value] ||
    MAP[String(value).toLowerCase()] || {
      bg: '#f3f4f6',
      color: '#4b5563',
      text: value,
    }
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '3px 9px',
        borderRadius: 99,
        fontSize: 11,
        fontWeight: 700,
        background: m.bg,
        color: m.color,
        whiteSpace: 'nowrap',
        ...style,
      }}
    >
      {m.text}
    </span>
  )
}

// -- Spinner ------------------------------------------------------------------
export function Spinner({ size = 24 }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        border: '2px solid var(--border)',
        borderTopColor: 'var(--green-700)',
        animation: 'spin 0.7s linear infinite',
      }}
    />
  )
}

// -- Icon Marks ---------------------------------------------------------------
// Visual metric icons should be semantic symbols, never exposed short-form text
// badges like HK, DN, HW, HO, WK, or IR.
const ICON_ALIASES = {
  HM: 'home',
  HO: 'home',
  DB: 'dashboard',
  AN: 'insights',
  PR: 'present',
  HT: 'horticulture',
  HK: 'housekeeping',
  IR: 'inventory',
  IN: 'inventory',
  US: 'users',
  WK: 'workers',
  HW: 'workers',
  AR: 'areas',
  TD: 'tasks',
  TT: 'tasks',
  OD: 'overdue',
  DN: 'done',
  PD: 'pending',
  AB: 'absent',
  LS: 'lowStock',
  OS: 'outOfStock',
  UA: 'assets',
  SR: 'stockRequests',
  IT: 'inventory',
  VL: 'value',
  AS: 'assets',
  CS: 'consumables',
  AI: 'inventory',
  IS: 'issued',
  SA: 'stockAdded',
  EC: 'value',
  UF: 'pending',
  PH: 'photos',
  VI: 'visible',
  PN: 'pending',
  AP: 'approved',
  RJ: 'rejected',
}

function inferIconName(icon, label = '') {
  const key = String(icon || '').trim()
  if (key && !/^[A-Z]{2,3}$/.test(key)) return key
  if (key && ICON_ALIASES[key]) return ICON_ALIASES[key]

  const text = String(label || '').toLowerCase()
  if (text.includes('substation') || text.includes('electrical') || text.includes('panel')) return 'substation'
  if (text.includes('wtp') || text.includes('stp') || text.includes('water')) return 'water'
  if (text.includes('hvac') || text.includes('chiller')) return 'hvac'
  if (text.includes('horticulture') || text.includes('zone')) return 'horticulture'
  if (text.includes('housekeeping') || text.includes('hostel task') || text.includes('hk task')) return 'housekeeping'
  if (text.includes('worker')) return 'workers'
  if (text.includes('area') || text.includes('section')) return 'areas'
  if (text.includes('inventory') || text.includes('item')) return 'inventory'
  if (text.includes('low stock')) return 'lowStock'
  if (text.includes('out of stock')) return 'outOfStock'
  if (text.includes('stock request')) return 'stockRequests'
  if (text.includes('present') || text.includes('completed') || text.includes('done') || text.includes('approved')) return 'done'
  if (text.includes('absent') || text.includes('rejected') || text.includes('overdue')) return 'overdue'
  if (text.includes('pending') || text.includes('due')) return 'pending'
  if (text.includes('asset') || text.includes('return')) return 'assets'
  if (text.includes('photo') || text.includes('gallery')) return 'photos'
  return 'dashboard'
}

const ICON_PATHS = {
  home: 'M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-9.5Z',
  dashboard: 'M4 5h7v7H4V5Zm9 0h7v4h-7V5ZM4 14h7v5H4v-5Zm9-3h7v8h-7v-8Z',
  insights: 'M4 19h18M7 16V9m5 7V5m5 11v-6',
  map: 'M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z',
  horticulture: 'M12 21c0-5 2-9 7-13-5 0-9 2-11 6-1-4 1-8 6-11-7 1-11 6-10 12 1 4 4 6 8 6Z',
  housekeeping: 'M5 20h14M8 20l1-8h6l1 8M10 12V5a2 2 0 1 1 4 0v7M7 16h10',
  inventory: 'M4 8l8-4 8 4-8 4-8-4Zm0 0v9l8 4 8-4V8M12 12v9',
  users: 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm7-1a3 3 0 1 0 0-6M3 21a6 6 0 0 1 12 0M14 18a5 5 0 0 1 7 3',
  workers: 'M8 7a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm8-2v10m-3-7h6M3 21a5 5 0 0 1 10 0',
  areas: 'M4 6h16v12H4V6Zm4 0v12m8-12v12M4 12h16',
  tasks: 'M6 6h12M6 12h12M6 18h8M3 6h.01M3 12h.01M3 18h.01',
  pending: 'M12 6v6l4 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z',
  done: 'M20 6 9 17l-5-5',
  approved: 'M20 6 9 17l-5-5',
  present: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4 21a8 8 0 0 1 16 0M17 8l2 2 4-4',
  overdue: 'M12 8v5M12 17h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z',
  lowStock: 'M12 3 2 21h20L12 3Zm0 7v5m0 3h.01',
  outOfStock: 'M6 6l12 12M18 6 6 18',
  stockRequests: 'M7 4h10v4H7V4Zm-2 7h14v9H5v-9Zm4 4h6',
  assets: 'M6 7h12v14H6V7Zm3-4h6v4H9V3Zm0 10h6',
  value: 'M7 7h10M12 7v14M9 11h4a3 3 0 0 1 0 6H8M15 3H9',
  consumables: 'M8 3h8v6a4 4 0 0 1-8 0V3Zm4 10v8M8 21h8',
  issued: 'M4 12h12M12 8l4 4-4 4M20 4v16',
  stockAdded: 'M12 5v14M5 12h14M4 4h16v16H4V4Z',
  photos: 'M4 7h3l2-3h6l2 3h3v14H4V7Zm8 13a5 5 0 1 0 0-10 5 5 0 0 0 0 10Z',
  visible: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z',
  substation: 'M13 2 3 14h9l-1 8 10-12h-9l1-8Z',
  water: 'M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z',
  hvac: 'M12 2v20M2 12h20M4.93 4.93l14.14 14.14M19.07 4.93L4.93 19.07M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z',
}

export function IconMark({ icon, label, color = 'var(--green-800)', size = 52, style }) {
  const name = inferIconName(icon, label)
  const path = ICON_PATHS[name] || ICON_PATHS.dashboard
  return (
    <span
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        borderRadius: 14,
        display: 'grid',
        placeItems: 'center',
        flexShrink: 0,
        color,
        background: `color-mix(in srgb, ${color} 12%, white)`,
        border: `1px solid color-mix(in srgb, ${color} 16%, white)`,
        ...style,
      }}
    >
      <svg width={Math.round(size * 0.5)} height={Math.round(size * 0.5)} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
        <path d={path} />
      </svg>
    </span>
  )
}

// -- Alert --------------------------------------------------------------------
export function Alert({ message, type = 'error' }) {
  if (!message) return null
  const colors = {
    error: { bg: '#fee2e2', border: '#fca5a5', color: '#991b1b' },
    info: { bg: '#dbeafe', border: '#93c5fd', color: '#1d4ed8' },
    success: { bg: '#d1fae5', border: '#6ee7b7', color: '#065f46' },
    warn: { bg: '#fef3c7', border: '#fde68a', color: '#92400e' },
  }
  const c = colors[type] || colors.error
  return (
    <div
      style={{
        padding: '10px 14px',
        borderRadius: 9,
        marginBottom: 14,
        background: c.bg,
        border: `1px solid ${c.border}`,
        color: c.color,
        fontSize: 13,
        fontWeight: 500,
      }}
    >
      {message}
    </div>
  )
}

// -- Modal --------------------------------------------------------------------
export function Modal({ open, onClose, title, children, footer, width = 480 }) {
  if (!open) return null
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        background: 'rgba(0,0,0,0.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--surface)',
          borderRadius: 16,
          width: '100%',
          maxWidth: width,
          maxHeight: '90vh',
          overflow: 'auto',
          boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            padding: '18px 22px',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <h2 style={{ fontWeight: 700, fontSize: 16 }}>{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="ui-modal-close-btn"
            aria-label="Close"
            style={{
              width: 32,
              height: 32,
              display: 'grid',
              placeItems: 'center',
              background: 'var(--modal-close-bg, transparent)',
              border: '1px solid transparent',
              borderRadius: 8,
              fontSize: 18,
              color: 'var(--modal-close-color, var(--text-3))',
              cursor: 'pointer',
              lineHeight: 1,
              transition: 'background 0.15s, color 0.15s, border-color 0.15s',
            }}
          >
            ✕
          </button>
        </div>
        <div style={{ padding: '20px 22px' }}>{children}</div>
        {footer && (
          <div
            style={{
              padding: '14px 22px',
              borderTop: '1px solid var(--border)',
              display: 'flex',
              justifyContent: 'flex-end',
              gap: 8,
            }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}

// -- Table --------------------------------------------------------------------
export function DataTable({ headers, rows, loading, emptyMsg = 'No data found.' }) {
  return (
    <div style={{ overflow: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr>
            {headers.map((h, i) => (
              <th
                key={i}
                style={{
                  padding: '10px 14px',
                  textAlign: 'left',
                  fontWeight: 700,
                  fontSize: 11,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  color: 'var(--text-3)',
                  borderBottom: '2px solid var(--border)',
                  whiteSpace: 'nowrap',
                }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr>
              <td colSpan={headers.length} style={{ padding: '40px', textAlign: 'center' }}>
                <div style={{ display: 'flex', justifyContent: 'center' }}>
                  <Spinner />
                </div>
              </td>
            </tr>
          ) : rows.length === 0 ? (
            <tr>
              <td colSpan={headers.length} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-3)' }}>
                {emptyMsg}
              </td>
            </tr>
          ) : (
            rows.map((row, i) => (
              <tr
                key={i}
                className="ui-data-row"
                style={{
                  borderBottom: '1px solid var(--border)',
                  background: i % 2 ? 'var(--surface-2)' : 'transparent',
                }}
              >
                {row.map((cell, j) => (
                  <td
                    key={j}
                    style={{
                      padding: '11px 14px',
                      color: 'var(--text-2)',
                      transition: 'background 0.15s ease',
                    }}
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}

// -- Field / Input / Select ---------------------------------------------------
export function Field({ label, children, required }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label
        style={{
          display: 'block',
          fontSize: 12,
          fontWeight: 600,
          color: 'var(--text-2)',
          marginBottom: 5,
        }}
      >
        {label}
        {required && <span style={{ color: 'var(--urgent)', marginLeft: 2 }}>*</span>}
      </label>
      {children}
    </div>
  )
}

const inputStyle = {
  width: '100%',
  padding: '9px 12px',
  border: '1.5px solid var(--border)',
  borderRadius: 8,
  fontSize: 13,
  background: 'var(--surface)',
  color: 'var(--text)',
  outline: 'none',
  fontFamily: 'inherit',
}

export function Input(props) {
  return <input {...props} style={{ ...inputStyle, ...props.style }} />
}

export function SelectField({ children, ...props }) {
  return (
    <select {...props} style={{ ...inputStyle, cursor: 'pointer', ...props.style }}>
      {children}
    </select>
  )
}

export function Textarea(props) {
  return <textarea {...props} style={{ ...inputStyle, resize: 'vertical', ...props.style }} />
}

// -- Stat Card ----------------------------------------------------------------
export function StatCard({
  label,
  value,
  icon,
  color = 'var(--green-800)',
  sub,
  onClick,
  style,
}) {
  return (
    <Card
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        transition: 'transform 0.15s, box-shadow 0.15s',
        ...style,
      }}
    >
      <IconMark icon={icon} label={label} color={color} style={{ marginRight: 16 }} />
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--text)', lineHeight: 1.1 }}>
          {value}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>{label}</div>
        {sub && <div style={{ fontSize: 11, color, marginTop: 2, fontWeight: 600 }}>{sub}</div>}
      </div>
    </Card>
  )
}

// -- Tabs ---------------------------------------------------------------------
export function Tabs({ tabs, active, onChange }) {
  const defaultCountStyle = (isActive) => ({
    background: isActive ? 'rgba(255,255,255,0.25)' : 'var(--border)',
    color: isActive ? '#fff' : 'var(--text-3)',
  })

  const toneCountStyle = (tone) => {
    if (tone === 'red') return { background: '#ef4444', color: '#fff' }
    if (tone === 'yellow') return { background: '#f59e0b', color: '#fff' }
    return null
  }

  return (
    <div
      className="ui-tabs"
      style={{
        display: 'flex',
        gap: 4,
        padding: '4px',
        background: 'var(--surface-2)',
        borderRadius: 11,
        border: '1px solid var(--border)',
        width: 'fit-content',
        maxWidth: '100%',
        overflowX: 'auto',
        overflowY: 'hidden',
        scrollbarWidth: 'thin',
        scrollbarColor: 'var(--border-2) transparent',
        WebkitOverflowScrolling: 'touch',
      }}
    >
      {tabs.map((tab) => {
        const isActive = active === tab.key
        const countStyle = toneCountStyle(tab.countTone) || defaultCountStyle(isActive)
        return (
        <button
          key={tab.key}
          onClick={() => onChange(tab.key)}
          style={{
            padding: '7px 16px',
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 600,
            background: isActive ? 'var(--green-800)' : 'transparent',
            color: isActive ? '#fff' : 'var(--text-3)',
            border: 'none',
            cursor: 'pointer',
            transition: 'all 0.15s',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            flexShrink: 0,
            whiteSpace: 'nowrap',
          }}
        >
          {tab.label}
          {tab.count != null && (
            <span
              style={{
                ...countStyle,
                borderRadius: 99,
                padding: '1px 6px',
                fontSize: 11,
                fontWeight: 700,
              }}
            >
              {tab.count}
            </span>
          )}
        </button>
        )
      })}
    </div>
  )
}

if (typeof document !== 'undefined' && !document.getElementById('ui-shared-styles')) {
  const style = document.createElement('style')
  style.id = 'ui-shared-styles'
  style.textContent = `
    @keyframes spin { to { transform: rotate(360deg); } }

    .ui-modal-close-btn:hover,
    .ui-modal-close-btn:focus-visible {
      --modal-close-bg: var(--surface-2);
      --modal-close-color: var(--text);
      border-color: var(--border);
    }

    .ui-modal-close-btn:focus-visible,
    .ui-interactive-card-link:focus-visible {
      outline: 2px solid rgba(45, 74, 62, 0.18);
      outline-offset: 3px;
    }

    .ui-tabs::-webkit-scrollbar {
      height: 6px;
    }

    .ui-tabs::-webkit-scrollbar-thumb {
      background: var(--border-2);
      border-radius: 999px;
    }

    .ui-tabs::-webkit-scrollbar-track {
      background: transparent;
    }

    .ui-data-row:hover td {
      background: rgba(45, 74, 62, 0.06);
    }

    .ui-two-pane-grid {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(280px, 360px);
      gap: 14px;
    }

    .ui-interactive-card-link {
      display: block;
      border-radius: 14px;
      transition: transform 0.15s ease, box-shadow 0.15s ease;
    }

    .ui-interactive-card-link:hover,
    .ui-interactive-card-link:focus-visible {
      transform: translateY(-2px);
      box-shadow: 0 14px 28px rgba(26, 60, 52, 0.1);
    }

    @media (max-width: 1100px) {
      .ui-two-pane-grid {
        grid-template-columns: minmax(0, 1fr);
      }
    }
  `
  document.head.appendChild(style)
}
