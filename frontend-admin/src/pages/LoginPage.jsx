import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { useAuth } from '../context/AuthContext'
import { APP_LOGO_PATH, APP_NAME, APP_TAGLINE } from '../shared/constants'

function getLandingRoute(user) {
  const role = user?.role
  if (
    role === 'plant_engineer' ||
    role === 'electrical_supervisor' ||
    role === 'supervisor' ||
    role === 'electrical_operator' ||
    role === 'operator'
  ) {
    return '/substation'
  }
  if (
    role === 'wtp_supervisor' ||
    role === 'wtp_operator'
  ) {
    return '/wtp'
  }
  if (
    role === 'hvac_engineer' ||
    role === 'hvac_supervisor' ||
    role === 'hvac_operator'
  ) {
    return '/hvac'
  }
  return '/dashboard'
}

export default function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()

  const [form, setForm] = useState({ username: '', password: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  const handleChange = (e) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }))
    if (error) setError('')
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const user = await login(form.username.trim(), form.password)
      navigate(getLandingRoute(user), { replace: true })
    } catch (err) {
      if (err?.code === 'NON_ADMIN') {
        navigate('/unauthorized', { replace: true })
        return
      }
      setError(err.response?.data?.detail || 'Invalid username or password.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-bg">
        <span className="orb orb-a" />
        <span className="orb orb-b" />
        <span className="orb orb-c" />
      </div>

      <div className="auth-layout">
        <section className="auth-left">
          <div className="badge">IIT Gandhinagar</div>
          <div className="brand-lockup">
            <img src={APP_LOGO_PATH} alt={APP_NAME} className="brand-logo" />
            <div>
              <div className="brand-kicker">{APP_TAGLINE}</div>
              <h1>{APP_NAME}</h1>
            </div>
          </div>
          <p>
            Unified operations workspace for inventory, housekeeping, horticulture, reporting, and user administration.
          </p>

          <div className="feature-grid">
            <div>
              <strong>Inventory</strong>
              <span>Stock, requests, and issue flow</span>
            </div>
            <div>
              <strong>Housekeeping</strong>
              <span>Tasks, attendance, and relievers</span>
            </div>
            <div>
              <strong>Horticulture</strong>
              <span>Zone and supervisor controls</span>
            </div>
            <div>
              <strong>Reports</strong>
              <span>Weekly and monthly exports</span>
            </div>
          </div>

          <small>Authorized staff access only.</small>
        </section>

        <section className="auth-right">
          <header>
            <h2>Welcome Back</h2>
            <p>Login with your {APP_NAME.toLowerCase()} account.</p>
          </header>

          <form onSubmit={handleSubmit} className="auth-form">
            <label>
              Username
              <input
                type="text"
                name="username"
                value={form.username}
                onChange={handleChange}
                required
                autoFocus
                placeholder="Enter username"
              />
            </label>

            <label>
              Password
              <div className="password-wrap">
                <input
                  type={showPassword ? 'text' : 'password'}
                  name="password"
                  value={form.password}
                  onChange={handleChange}
                  required
                  placeholder="Enter password"
                />
                <button type="button" onClick={() => setShowPassword((v) => !v)}>
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
            </label>

            {error ? <div className="error-box">{error}</div> : null}

            <button type="submit" className="submit-btn" disabled={loading}>
              {loading ? 'Signing in...' : 'Login to Portal'}
            </button>
          </form>

          <footer>
            <div>Need help? Contact system admin.</div>
            <div style={{ marginTop: 6 }}>
              Field staff? <a href="/portal/login/">Use the Staff Portal</a>
            </div>
          </footer>
        </section>
      </div>

      <style>{`
        .auth-page {
          min-height: 100vh;
          padding: 20px;
          display: grid;
          place-items: center;
          overflow: hidden;
          position: relative;
          background: linear-gradient(155deg, #f1eee8 0%, #e9e3d9 55%, #f4f2ed 100%);
        }

        .auth-bg {
          position: absolute;
          inset: 0;
          pointer-events: none;
        }

        .orb {
          position: absolute;
          border-radius: 999px;
          filter: blur(8px);
          opacity: 0.8;
          animation: float 7s ease-in-out infinite;
        }

        .orb-a {
          width: 380px;
          height: 380px;
          left: -120px;
          top: -90px;
          background: radial-gradient(circle at 35% 35%, rgba(61, 107, 85, 0.35), rgba(61, 107, 85, 0));
        }

        .orb-b {
          width: 320px;
          height: 320px;
          right: -70px;
          top: 18%;
          background: radial-gradient(circle at 35% 35%, rgba(194, 98, 42, 0.3), rgba(194, 98, 42, 0));
          animation-delay: 1.6s;
        }

        .orb-c {
          width: 340px;
          height: 340px;
          right: 12%;
          bottom: -120px;
          background: radial-gradient(circle at 35% 35%, rgba(26, 60, 52, 0.3), rgba(26, 60, 52, 0));
          animation-delay: 2.4s;
        }

        .auth-layout {
          position: relative;
          width: 100%;
          max-width: 1020px;
          min-height: 620px;
          display: grid;
          grid-template-columns: 1.1fr 0.9fr;
          border: 1px solid var(--border);
          border-radius: 22px;
          overflow: hidden;
          background: var(--surface);
          box-shadow: 0 28px 70px rgba(16, 24, 40, 0.18);
        }

        .auth-left {
          background: linear-gradient(145deg, #1a3c34 0%, #2d4a3e 42%, #3d6b55 100%);
          color: #fff;
          padding: 42px;
          display: flex;
          flex-direction: column;
        }

        .badge {
          width: fit-content;
          padding: 5px 11px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.24);
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.08em;
          background: rgba(255, 255, 255, 0.08);
          margin-bottom: 14px;
          color: #fef3c7;
        }

        .auth-left h1 {
          margin: 0;
          font-size: clamp(28px, 3vw, 40px);
          line-height: 1.08;
          letter-spacing: -0.02em;
        }

        .brand-lockup {
          display: flex;
          align-items: center;
          gap: 16px;
        }

        .brand-logo {
          width: 82px;
          height: 82px;
          border-radius: 24px;
          background: rgba(255, 255, 255, 0.98);
          padding: 4px;
          box-shadow: 0 14px 28px rgba(8, 22, 18, 0.24);
          flex-shrink: 0;
        }

        .brand-kicker {
          margin-bottom: 8px;
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.08em;
          color: rgba(255, 255, 255, 0.72);
          text-transform: uppercase;
        }

        .auth-left p {
          margin: 12px 0 24px;
          font-size: 14px;
          color: rgba(255, 255, 255, 0.82);
          max-width: 420px;
        }

        .feature-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 10px;
        }

        .feature-grid > div {
          border: 1px solid rgba(255, 255, 255, 0.2);
          border-radius: 11px;
          background: rgba(255, 255, 255, 0.08);
          padding: 10px 11px;
          display: grid;
          gap: 4px;
        }

        .feature-grid strong {
          font-size: 13px;
          font-weight: 700;
        }

        .feature-grid span {
          font-size: 11px;
          color: rgba(255, 255, 255, 0.78);
          line-height: 1.35;
        }

        .auth-left small {
          margin-top: auto;
          font-size: 12px;
          color: rgba(255, 255, 255, 0.74);
        }

        .auth-right {
          background: #fdfcf9;
          padding: 38px 30px;
          display: flex;
          flex-direction: column;
        }

        .auth-right header h2 {
          margin: 0;
          color: var(--green-900);
          font-size: 30px;
          letter-spacing: -0.02em;
        }

        .auth-right header p {
          margin: 8px 0 18px;
          font-size: 13px;
          color: var(--text-3);
        }

        .auth-form {
          display: grid;
          gap: 14px;
        }

        .auth-form label {
          font-size: 12px;
          font-weight: 700;
          color: var(--text-2);
          display: grid;
          gap: 6px;
        }

        .auth-form input {
          width: 100%;
          border: 1.5px solid #d1cdc4;
          border-radius: 10px;
          padding: 12px 14px;
          font-size: 14px;
          background: #fff;
          outline: none;
          transition: border-color 0.15s, box-shadow 0.15s;
        }

        .auth-form input:focus {
          border-color: #3d6b55;
          box-shadow: 0 0 0 3px rgba(77, 140, 110, 0.14);
        }

        .password-wrap {
          position: relative;
        }

        .password-wrap input {
          padding-right: 82px;
        }

        .password-wrap button {
          position: absolute;
          right: 8px;
          top: 50%;
          transform: translateY(-50%);
          border: 1px solid var(--border);
          border-radius: 8px;
          background: #fff;
          padding: 6px 10px;
          font-size: 11px;
          font-weight: 700;
          color: var(--text-2);
        }

        .error-box {
          background: #fee2e2;
          border: 1px solid #fca5a5;
          border-radius: 10px;
          color: #991b1b;
          font-size: 13px;
          font-weight: 600;
          padding: 10px 12px;
        }

        .submit-btn {
          border: none;
          border-radius: 10px;
          background: linear-gradient(135deg, #2d4a3e, #1a3c34);
          color: #fff;
          padding: 12px 14px;
          font-size: 14px;
          font-weight: 700;
          transition: transform 0.15s, filter 0.15s;
        }

        .submit-btn:hover:not(:disabled) {
          transform: translateY(-1px);
          filter: brightness(1.05);
        }

        .submit-btn:disabled {
          opacity: 0.72;
          cursor: not-allowed;
        }

        .auth-right footer {
          margin-top: auto;
          border-top: 1px solid var(--border);
          padding-top: 12px;
          font-size: 12px;
          color: var(--text-3);
        }

        @media (max-width: 960px) {
          .auth-layout {
            max-width: 520px;
            min-height: auto;
            grid-template-columns: 1fr;
          }

          .auth-left {
            padding: 28px 24px;
          }

          .brand-lockup {
            align-items: flex-start;
          }

          .brand-logo {
            width: 68px;
            height: 68px;
            border-radius: 20px;
          }

          .feature-grid {
            grid-template-columns: 1fr;
          }

          .auth-right {
            padding: 28px 24px;
          }
        }

        @keyframes float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-10px); }
        }
      `}</style>
    </div>
  )
}
