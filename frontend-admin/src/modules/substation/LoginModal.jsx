import React, { useState } from 'react';
import { Lock, User, Key, AlertCircle, ArrowRight, ShieldCheck } from 'lucide-react';
import { ApiClient } from '../services/api';

export default function LoginModal({ onLoginSuccess }) {
  const [role, setRole] = useState('operator');
  const [name, setName] = useState(localStorage.getItem('sslog_operator') || '');
  const [password, setPassword] = useState('operator123');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleRoleSelect = (selectedRole) => {
    setRole(selectedRole);
    if (selectedRole === 'operator') setPassword('operator123');
    else if (selectedRole === 'supervisor') setPassword('supervisor123');
    else if (selectedRole === 'admin') setPassword('admin123');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const data = await ApiClient.login(role, password, name.trim());
      if (name.trim()) {
        try { localStorage.setItem('sslog_operator', name.trim()); } catch (_) {}
      }
      onLoginSuccess(data);
    } catch (err) {
      setError(err.message || 'Login failed. Please check credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-dialog">
        <div style={{ textAlign: 'center', marginBottom: '20px' }}>
          <div
            style={{
              width: '52px',
              height: '52px',
              borderRadius: '16px',
              background: 'linear-gradient(135deg, var(--accent-cyan), var(--accent-indigo))',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
              marginBottom: '12px',
              boxShadow: 'var(--glow-cyan)',
            }}
          >
            <ShieldCheck size={28} />
          </div>
          <h2 style={{ fontSize: '22px', color: 'var(--text-main)', marginBottom: '4px' }}>
            Substation Log Access
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>
            Campus Electrical Readings & Monitoring System
          </p>
        </div>

        {error && (
          <div className="banner bad" style={{ padding: '10px 14px', marginBottom: '16px' }}>
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="field-group" style={{ marginBottom: '14px' }}>
            <label className="field-label">Select Role</label>
            <div className="segmented-control" style={{ width: '100%' }}>
              <button
                type="button"
                className={`segmented-btn ${role === 'operator' ? 'active' : ''}`}
                style={{ flex: 1 }}
                onClick={() => handleRoleSelect('operator')}
              >
                Operator
              </button>
              <button
                type="button"
                className={`segmented-btn ${role === 'supervisor' ? 'active' : ''}`}
                style={{ flex: 1 }}
                onClick={() => handleRoleSelect('supervisor')}
              >
                Engineer
              </button>
              <button
                type="button"
                className={`segmented-btn ${role === 'admin' ? 'active' : ''}`}
                style={{ flex: 1 }}
                onClick={() => handleRoleSelect('admin')}
              >
                Admin
              </button>
            </div>
          </div>

          <div className="field-group" style={{ marginBottom: '14px' }}>
            <label className="field-label">
              <User size={13} /> Your Name
            </label>
            <input
              type="text"
              className="field-input"
              placeholder="e.g. Ravi Patel"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <div className="field-group" style={{ marginBottom: '18px' }}>
            <label className="field-label">
              <Key size={13} /> Password
            </label>
            <input
              type="password"
              className="field-input"
              placeholder="Enter password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <div
            style={{
              background: 'var(--bg-tertiary)',
              padding: '10px 12px',
              borderRadius: 'var(--radius-md)',
              fontSize: '12px',
              color: 'var(--text-muted)',
              marginBottom: '18px',
              display: 'flex',
              flexDirection: 'column',
              gap: '4px',
            }}
          >
            <div style={{ fontWeight: 600, color: 'var(--text-main)' }}>Default Credentials:</div>
            <div>• Operator: <code style={{ color: 'var(--accent-cyan)' }}>operator123</code></div>
            <div>• Engineer: <code style={{ color: 'var(--accent-cyan)' }}>supervisor123</code></div>
            <div>• Admin: <code style={{ color: 'var(--accent-cyan)' }}>admin123</code></div>
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            style={{ width: '100%', padding: '10px' }}
            disabled={loading}
          >
            {loading ? 'Authenticating…' : 'Sign in to Logbook'}
            {!loading && <ArrowRight size={15} />}
          </button>
        </form>
      </div>
    </div>
  );
}
