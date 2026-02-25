// ── Badge ────────────────────────────────────────────────────
export function Badge({ children, color = 'gray' }) {
  const colors = {
    gray:   'bg-slate-100 text-slate-600',
    blue:   'bg-blue-100 text-blue-700',
    green:  'bg-emerald-100 text-emerald-700',
    yellow: 'bg-amber-100 text-amber-700',
    red:    'bg-red-100 text-red-700',
    purple: 'bg-purple-100 text-purple-700',
    teal:   'bg-teal-100 text-teal-700',
  }
  return (
    <span className={`inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full ${colors[color]}`}>
      {children}
    </span>
  )
}

// ── Status Badge ─────────────────────────────────────────────
const STATUS_COLOR = {
  pending:  'yellow',
  approved: 'blue',
  rejected: 'red',
  issued:   'green',
  in_stock:     'green',
  low_stock:    'yellow',
  out_of_stock: 'red',
  asset:      'purple',
  consumable: 'teal',
  admin:      'blue',
  manager:    'purple',
  supervisor: 'teal',
}

export function StatusBadge({ value }) {
  const color = STATUS_COLOR[value] || 'gray'
  const label = value?.replace(/_/g, ' ')
  return <Badge color={color}>{label}</Badge>
}

// ── Spinner ──────────────────────────────────────────────────
export function Spinner({ className = 'h-8 w-8' }) {
  return (
    <div className={`animate-spin rounded-full border-2 border-slate-200 border-t-blue-600 ${className}`} />
  )
}

// ── Page Header ──────────────────────────────────────────────
export function PageHeader({ title, subtitle, action }) {
  return (
    <div className="flex items-center justify-between mb-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">{title}</h1>
        {subtitle && <p className="text-sm text-slate-500 mt-0.5">{subtitle}</p>}
      </div>
      {action && <div>{action}</div>}
    </div>
  )
}

// ── Button ───────────────────────────────────────────────────
export function Button({ children, onClick, variant = 'primary', size = 'md', disabled, type = 'button', className = '' }) {
  const base = 'inline-flex items-center gap-2 font-medium rounded-lg transition focus:outline-none focus:ring-2 focus:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed'
  const variants = {
    primary:  'bg-blue-600 hover:bg-blue-700 text-white focus:ring-blue-500',
    danger:   'bg-red-600 hover:bg-red-700 text-white focus:ring-red-500',
    ghost:    'bg-transparent hover:bg-slate-100 text-slate-700 focus:ring-slate-300',
    outline:  'border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 focus:ring-slate-300',
    success:  'bg-emerald-600 hover:bg-emerald-700 text-white focus:ring-emerald-500',
  }
  const sizes = {
    sm: 'text-xs px-3 py-1.5',
    md: 'text-sm px-4 py-2',
    lg: 'text-sm px-5 py-2.5',
  }
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`${base} ${variants[variant]} ${sizes[size]} ${className}`}
    >
      {children}
    </button>
  )
}

// ── Modal ────────────────────────────────────────────────────
export function Modal({ open, onClose, title, children, footer }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
        onClick={onClose}
      />
      {/* Panel */}
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="font-semibold text-slate-900">{title}</h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 transition"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="overflow-y-auto flex-1 px-6 py-4">{children}</div>
        {footer && (
          <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-3">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Form Field ───────────────────────────────────────────────
export function Field({ label, error, children }) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1.5">{label}</label>
      {children}
      {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
    </div>
  )
}

export function Input({ className = '', ...props }) {
  return (
    <input
      className={`w-full px-3.5 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition ${className}`}
      {...props}
    />
  )
}

export function Select({ className = '', children, ...props }) {
  return (
    <select
      className={`w-full px-3.5 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition bg-white ${className}`}
      {...props}
    >
      {children}
    </select>
  )
}

export function Textarea({ className = '', ...props }) {
  return (
    <textarea
      className={`w-full px-3.5 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition resize-none ${className}`}
      {...props}
    />
  )
}

// ── Table ────────────────────────────────────────────────────
export function Table({ columns, data, emptyMessage = 'No data found.' }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100">
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={`px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide ${col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'}`}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-5 py-12 text-center text-slate-400 text-sm">
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              data.map((row, i) => (
                <tr key={row.id ?? i} className="border-b border-slate-50 hover:bg-slate-50 transition">
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={`px-5 py-3 text-slate-700 ${col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : ''}`}
                    >
                      {col.render ? col.render(row) : row[col.key]}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Alert ────────────────────────────────────────────────────
export function Alert({ type = 'error', message }) {
  if (!message) return null
  const styles = {
    error:   'bg-red-50 border-red-200 text-red-700',
    success: 'bg-emerald-50 border-emerald-200 text-emerald-700',
    info:    'bg-blue-50 border-blue-200 text-blue-700',
  }
  return (
    <div className={`border rounded-lg px-4 py-3 text-sm ${styles[type]}`}>
      {message}
    </div>
  )
}
