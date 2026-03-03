import { Alert, Badge, Btn, Card, DataTable, Field, Input, Modal, SelectField, Spinner, Textarea } from './ui/index'

export * from './ui/index'

// Compatibility exports for legacy imports.
export const Button = Btn
export const Select = SelectField

export function StatusBadge({ value }) {
  return <Badge value={value} />
}

export function PageHeader({ title, subtitle, action }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, gap: 8 }}>
      <div>
        <h1 style={{ fontSize: 20, fontWeight: 800 }}>{title}</h1>
        {subtitle ? <p style={{ fontSize: 13, color: 'var(--text-3)' }}>{subtitle}</p> : null}
      </div>
      {action}
    </div>
  )
}

export function Table({ columns, data, emptyMessage = 'No data found.' }) {
  return (
    <DataTable
      headers={columns.map((c) => c.label)}
      rows={data.map((row) =>
        columns.map((col) => (col.render ? col.render(row) : row[col.key]))
      )}
      emptyMsg={emptyMessage}
    />
  )
}

export { Alert, Card, Field, Input, Modal, SelectField, Spinner, Textarea }
