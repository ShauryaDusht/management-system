/**
 * AdminLayout.jsx  –  patched to support `fullscreen` prop
 *
 * Usage:
 *   <AdminLayout>                   // normal – padded content area (existing behaviour)
 *   <AdminLayout fullscreen>        // new    – children fill 100% with no padding
 *
 * Only GeoTrackerPage needs `fullscreen`.  All other pages remain unchanged.
 */

import { APP_LOGO_PATH, APP_NAME } from '../shared/constants'
import Sidebar from '../components/Sidebar'

export default function AdminLayout({ children, title, subtitle, actions, fullscreen = false }) {
  return (
    <div style={{ display: 'flex', minHeight: '100vh', width: '100%', maxWidth: '100vw', overflowX: 'hidden' }}>
      <Sidebar />
      <main
        style={{
          marginLeft: 'var(--sidebar-w)',
          flex: 1,
          width: 'calc(100% - var(--sidebar-w))',
          maxWidth: 'calc(100vw - var(--sidebar-w))',
          minWidth: 0,
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: fullscreen ? 'hidden' : undefined,
          position: fullscreen ? 'relative' : undefined,
        }}
      >
        {title && (
          <div
            style={{
              padding: 'var(--header-pad, 16px 28px)',
              borderBottom: '1px solid var(--border)',
              background: 'var(--surface)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              flexWrap: 'wrap',
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
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              {actions && <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>{actions}</div>}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '6px 12px',
                  border: '1px solid var(--border)',
                  borderRadius: 999,
                  background: '#f8faf9',
                }}
              >
                <img
                  src={APP_LOGO_PATH}
                  alt={APP_NAME}
                  style={{ width: 32, height: 32, borderRadius: 10, flexShrink: 0 }}
                />
                <div style={{ lineHeight: 1.15 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', color: 'var(--text-3)', textTransform: 'uppercase' }}>
                    App
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--green-900)' }}>
                    {APP_NAME}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 
          Normal mode:   padded scrollable area with desktop max-width container
          Fullscreen:    children fill the flex-1 parent completely, no padding
        */}
        {fullscreen ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative', minWidth: 0 }}>
            {children}
          </div>
        ) : (
          <div style={{ flex: 1, padding: 'var(--content-pad, 20px 28px 40px)', overflow: 'auto', minWidth: 0 }}>
            <div style={{ maxWidth: 'var(--content-max-w, 1680px)', margin: '0 auto', width: '100%', minWidth: 0 }}>
              {children}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
