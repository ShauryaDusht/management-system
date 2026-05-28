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
    housekeeping_manager: { bg: '#dbeafe', color: '#1d4ed8', text: 'HK Manager' },
    hk_inventory_manager: { bg: '#ecfeff', color: '#155e75', text: 'HK / Inv. Manager' },
    horticulture_manager: { bg: '#dcfce7', color: '#166534', text: 'Horti Manager' },
    supervisor: { bg: '#d1fae5', color: '#065f46', text: 'Supervisor' },
    caretaker: { bg: '#fff7ed', color: '#c2410c', text: 'Caretaker' },
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
        gap: 14,
        transition: 'transform 0.15s, box-shadow 0.15s',
        ...style,
      }}
    >
      <div
        style={{
          width: 46,
          height: 46,
          borderRadius: 12,
          background: color + '18',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 22,
          flexShrink: 0,
        }}
      >
        {icon}
      </div>
      <div>
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
