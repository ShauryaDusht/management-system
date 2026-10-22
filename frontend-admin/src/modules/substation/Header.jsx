import React from 'react';
import { Zap, Activity, Shield, FileText, BarChart3, Sun, Moon, LogOut, CheckCircle2 } from 'lucide-react';

export default function Header({
  user,
  mode,
  setMode,
  theme,
  setTheme,
  dbState,
  onSignOut,
}) {
  const isOperator = user?.role === 'operator';
  const isSupervisor = user?.role === 'supervisor';
  const isAdmin = user?.role === 'admin';

  return (
    <header className="app-header">
      <div className="brand-section">
        <div className="brand-icon-wrap">
          <Zap size={22} className="text-white fill-current" />
        </div>
        <div>
          <div className="brand-title">Substation Log</div>
          <div className="brand-subtitle">Campus Electrical Monitoring</div>
        </div>
      </div>

      <nav className="nav-tabs" aria-label="Main Navigation">
        {(isOperator || isAdmin) && (
          <button
            className={`nav-tab-btn ${mode === 'operator' ? 'active' : ''}`}
            onClick={() => setMode('operator')}
          >
            <Activity size={15} />
            <span>Log Entry</span>
          </button>
        )}

        {(isSupervisor || isAdmin) && (
          <button
            className={`nav-tab-btn ${mode === 'supervisor' ? 'active' : ''}`}
            onClick={() => setMode('supervisor')}
          >
            <Shield size={15} />
            <span>{isAdmin ? 'Substations & Layout' : 'Engineer Review & Logs'}</span>
          </button>
        )}

        {(isSupervisor || isAdmin) && (
          <>
            <button
              className={`nav-tab-btn ${mode === 'reports' ? 'active' : ''}`}
              onClick={() => setMode('reports')}
            >
              <BarChart3 size={15} />
              <span>Consumption Reports</span>
            </button>
            <button
              className={`nav-tab-btn ${mode === 'flash' ? 'active' : ''}`}
              onClick={() => setMode('flash')}
            >
              <FileText size={15} />
              <span>R-01 Flash Report</span>
            </button>
          </>
        )}
      </nav>

      <div className="header-actions">
        <div className="status-indicator" title={`Database: ${dbState}`}>
          <div
            className={`status-dot ${
              dbState === 'ready' ? '' : dbState === 'connecting' ? 'warn' : 'bad'
            }`}
          />
          <span>{dbState === 'ready' ? 'Live Sync' : dbState === 'connecting' ? 'Syncing…' : 'Offline'}</span>
        </div>

        {user && (
          <div className="user-badge">
            <span className="font-medium text-slate-200">{user.name || user.role}</span>
            <span className={`role-pill ${user.role}`}>{user.role}</span>
          </div>
        )}

        <button
          className="btn btn-ghost"
          style={{ padding: '6px 10px', borderRadius: 'var(--radius-full)' }}
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          title="Toggle Dark / Light Theme"
          aria-label="Toggle theme"
        >
          {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
        </button>

        <button
          className="btn btn-ghost"
          style={{ padding: '6px 10px', borderRadius: 'var(--radius-full)' }}
          onClick={onSignOut}
          title="Sign Out"
          aria-label="Sign out"
        >
          <LogOut size={16} />
        </button>
      </div>
    </header>
  );
}
