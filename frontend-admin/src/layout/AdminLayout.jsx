import Sidebar from '../components/Sidebar'

export default function AdminLayout({ children, title, subtitle, actions }) {
  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar />
      <main
        style={{
          marginLeft: 'var(--sidebar-w)',
          flex: 1,
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {title && (
          <div
            style={{
              padding: '20px 28px 16px',
              borderBottom: '1px solid var(--border)',
              background: 'var(--surface)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              position: 'sticky',
              top: 0,
              zIndex: 50,
            }}
          >
            <div>
              <h1 style={{ fontSize: 20, fontWeight: 800, color: 'var(--green-900)' }}>{title}</h1>
              {subtitle && (
                <p style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 2 }}>{subtitle}</p>
              )}
            </div>
            {actions && <div style={{ display: 'flex', gap: 8 }}>{actions}</div>}
          </div>
        )}
        <div style={{ flex: 1, padding: '20px 28px 40px', overflow: 'auto' }}>{children}</div>
      </main>
    </div>
  )
}
