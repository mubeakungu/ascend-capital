import React, { useEffect, useState } from 'react';

function Icon({ name, size = 18 }) {
  const paths = {
    arrow: <><path d="M7 17 17 7M7 7h10v10" /></>,
    lock: <><rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></>,
  };

  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

async function requestApi(path, options = {}) {
  try {
    const response = await fetch(path, {
      ...options,
      credentials: 'same-origin',
      headers: {
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...options.headers,
      },
    });
    
    if (response.status === 204) return null;
    
    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.error || `API error: ${response.status}`);
    }
    return result;
  } catch (err) {
    console.error(`API request failed for ${path}:`, err);
    throw err;
  }
}

export function RegistrationPage({ onNavigate }) {
  const [formData, setFormData] = useState({ name: '', email: '', password: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [referralCode, setReferralCode] = useState('');
  const [referralSource, setReferralSource] = useState(''); // for display

  // Extract referral code from URL on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get('ref');
    if (ref) {
      setReferralCode(ref.trim().toUpperCase());
      setReferralSource(ref.trim().toUpperCase());
    }
  }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const payload = {
        name: formData.name,
        email: formData.email,
        password: formData.password,
      };

      // Include referral code if present
      if (referralCode) {
        payload.referralCode = referralCode;
      }

      const response = await requestApi('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      if (response && response.account) {
        // Success — navigate to dashboard
        onNavigate('/');
      }
    } catch (err) {
      setError(err.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="registration-shell">
      <style>{`
        :root {
          --primary-blue: #003366;
          --dark-blue: #001a33;
          --light-blue: #005299;
          --gold: #D4AF37;
          --light-gold: #E8C547;
          --accent-green: #7ec850;
          --text-light: #f5f5f5;
          --bg-dark: #0a0a0a;
        }

        .registration-shell {
          min-height: 100vh;
          background: linear-gradient(135deg, var(--dark-blue) 0%, var(--bg-dark) 100%);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif;
        }

        .registration-container {
          width: 100%;
          max-width: 480px;
        }

        .registration-header {
          text-align: center;
          margin-bottom: 32px;
        }

        .registration-logo {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 12px;
          margin-bottom: 16px;
        }

        .registration-logo img {
          width: 48px;
          height: 48px;
          border-radius: 50%;
        }

        .registration-logo-text {
          font-size: 22px;
          font-weight: 700;
          color: var(--text-light);
          line-height: 1;
        }

        .registration-card {
          background: linear-gradient(135deg, rgba(0, 51, 102, 0.8) 0%, rgba(10, 10, 10, 0.8) 100%);
          border: 1px solid rgba(212, 175, 55, 0.2);
          border-radius: 12px;
          padding: 32px;
          color: var(--text-light);
        }

        .registration-eyebrow {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          color: var(--gold);
          font-size: 9px;
          font-weight: 700;
          letter-spacing: 1.05px;
          margin-bottom: 12px;
        }

        .registration-eyebrow-line {
          width: 15px;
          height: 1px;
          background: var(--gold);
        }

        .registration-title {
          font-size: 28px;
          font-weight: 700;
          margin-bottom: 8px;
          color: var(--text-light);
        }

        .registration-subtitle {
          font-size: 14px;
          color: #aaa;
          margin-bottom: 24px;
          line-height: 1.5;
        }

        .registration-referral-notice {
          background: rgba(212, 175, 55, 0.1);
          border: 1px solid rgba(212, 175, 55, 0.3);
          border-radius: 8px;
          padding: 12px;
          margin-bottom: 24px;
          font-size: 12px;
          color: var(--gold);
        }

        .registration-referral-notice strong {
          display: block;
          margin-bottom: 4px;
          font-weight: 700;
        }

        .registration-form {
          display: grid;
          gap: 16px;
        }

        .registration-form-group {
          display: grid;
          gap: 6px;
        }

        .registration-label {
          font-size: 12px;
          font-weight: 600;
          color: var(--text-light);
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .registration-input {
          background: rgba(0, 0, 0, 0.3);
          border: 1px solid rgba(212, 175, 55, 0.2);
          border-radius: 6px;
          padding: 12px;
          color: var(--text-light);
          font-size: 14px;
          transition: all 0.2s;
        }

        .registration-input:focus {
          outline: none;
          border-color: var(--gold);
          background: rgba(0, 0, 0, 0.5);
        }

        .registration-input::placeholder {
          color: #666;
        }

        .registration-helper {
          font-size: 11px;
          color: #888;
          margin-top: 4px;
        }

        .registration-error {
          background: rgba(231, 76, 60, 0.1);
          border: 1px solid rgba(231, 76, 60, 0.5);
          border-radius: 6px;
          padding: 12px;
          color: #e74c3c;
          font-size: 13px;
          margin-bottom: 16px;
        }

        .registration-button {
          background: linear-gradient(135deg, var(--accent-green) 0%, #6ab844 100%);
          border: none;
          border-radius: 6px;
          padding: 12px;
          color: #000;
          font-size: 14px;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.2s;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
        }

        .registration-button:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 8px 16px rgba(126, 200, 80, 0.3);
        }

        .registration-button:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .registration-footer {
          text-align: center;
          margin-top: 20px;
          font-size: 13px;
          color: #aaa;
        }

        .registration-footer a {
          color: var(--gold);
          text-decoration: none;
          font-weight: 600;
          transition: color 0.2s;
        }

        .registration-footer a:hover {
          color: var(--light-gold);
        }

        .registration-security {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          margin-top: 16px;
          padding-top: 16px;
          border-top: 1px solid rgba(212, 175, 55, 0.1);
          color: #888;
          font-size: 11px;
        }

        .registration-security svg {
          color: var(--accent-green);
        }
      `}</style>

      <div className="registration-container">
        <div className="registration-header">
          <div className="registration-logo">
            <img src="/ascend-logo.jpg" alt="Ascend Capital" />
            <div className="registration-logo-text">ascend<br />capital</div>
          </div>
        </div>

        <div className="registration-card">
          <div className="registration-eyebrow">
            <span className="registration-eyebrow-line" />
            MEMBER ACCOUNT
          </div>
          <h1 className="registration-title">Create your account.</h1>
          <p className="registration-subtitle">
            Sign up to manage your profile and process real transactions.
          </p>

          {referralSource && (
            <div className="registration-referral-notice">
              <strong>✓ Referral code applied</strong>
              You're being referred by code <strong>{referralSource}</strong>. Complete your account to activate your referral benefits.
            </div>
          )}

          {error && (
            <div className="registration-error">
              {error}
            </div>
          )}

          <form className="registration-form" onSubmit={handleSubmit}>
            <div className="registration-form-group">
              <label className="registration-label">Full name</label>
              <input
                className="registration-input"
                type="text"
                name="name"
                placeholder="Your full name"
                value={formData.name}
                onChange={handleChange}
                required
              />
            </div>

            <div className="registration-form-group">
              <label className="registration-label">Email address</label>
              <input
                className="registration-input"
                type="email"
                name="email"
                placeholder="your.email@example.com"
                value={formData.email}
                onChange={handleChange}
                required
              />
            </div>

            <div className="registration-form-group">
              <label className="registration-label">Password</label>
              <input
                className="registration-input"
                type="password"
                name="password"
                placeholder="••••••••••••"
                value={formData.password}
                onChange={handleChange}
                required
              />
              <div className="registration-helper">Use at least 12 characters.</div>
            </div>

            <button
              className="registration-button"
              type="submit"
              disabled={loading}
            >
              {loading ? 'Creating account…' : 'Create account'}
              <Icon name="arrow" size={16} />
            </button>
          </form>

          <div className="registration-footer">
            Already registered? <a href="/login" onClick={(e) => { e.preventDefault(); onNavigate('/login'); }}>Sign in</a>
          </div>

          <div className="registration-security">
            <Icon name="lock" size={12} />
            Secure authentication · Real transactions
          </div>
        </div>
      </div>
    </div>
  );
}
