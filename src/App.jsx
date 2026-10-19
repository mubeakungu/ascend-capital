import React, { useEffect, useState } from 'react';
import { ReferralPage } from './referral-page';

const DEPOSIT_PLANS = [
  { id: 1, name: 'Starter', amount: 100, dailyReturn: 2, duration: 30, roi: 60 },
  { id: 2, name: 'Growth', amount: 500, dailyReturn: 2.5, duration: 30, roi: 75 },
  { id: 3, name: 'Pro', amount: 1000, dailyReturn: 3, duration: 30, roi: 90 },
  { id: 4, name: 'Elite', amount: 5000, dailyReturn: 3.5, duration: 30, roi: 105 },
];

const TIER_REWARDS = [
  { name: 'Star 1', direct: 5, team: null, reward: '$80', rate: '5%' },
  { name: 'Star 2', direct: 7, team: 13, reward: '$150', rate: '6%' },
  { name: 'Star 3', direct: 8, team: 25, reward: '$250', rate: '7%' },
  { name: 'Star 4', direct: 9, team: 40, reward: '$400', rate: '8%' },
  { name: 'Star 5', direct: 10, team: 70, reward: '$700', rate: '10%' },
  { name: 'Star 6', direct: 11, team: 150, reward: '$1,000', rate: '12%' },
  { name: 'Star 7', direct: 12, team: 400, reward: '$2,500 + House', rate: '14%' },
  { name: 'Star 8', direct: 13, team: 700, reward: '$4,500 + Mazda CX-5', rate: '16%' },
  { name: 'Crown Leader', direct: 14, team: 1000, reward: '$7,000 + Mercedes E300', rate: '18%' },
];

function Icon({ name, size = 18 }) {
  const paths = {
    arrow: <><path d="M7 17 17 7M7 7h10v10" /></>,
    copy: <><rect x="8" y="8" width="13" height="13" rx="2" /><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    users: <><path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="10" cy="7" r="4" /><path d="M20 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></>,
    star: <><polygon points="12 2 15.09 10.26 23.77 10.5 17.88 16.46 20.49 25.13 12 20.35 3.51 25.13 6.12 16.46 0.23 10.5 8.91 10.26" /></>,
    trending: <><path d="M3 3v18h18" /><polyline points="7 14 11 10 15 14 19 8" /></>,
    gift: <><polygon points="12 2 14 6 18 6 15 9 16 13 12 10 8 13 9 9 6 6 10 6" /></>,
    menu: <><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" /></>,
  };

  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
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
    if (!response.ok) throw new Error(result.error || `API error: ${response.status}`);
    return result;
  } catch (err) {
    console.error(`API request failed for ${path}:`, err);
    throw err;
  }
}

function LoginPage({ onNavigate, onLoginSuccess }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleLogin(e) {
    e.preventDefault();
    if (!email || !password) {
      setError('Email and password required');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const result = await requestApi('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });

      onLoginSuccess(result);
    } catch (err) {
      setError(err.message || 'Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={styles.authContainer}>
      <style>{`
        * { margin: 0; padding: 0; box-sizing: border-box; }
        :root {
          --gold: #D4AF37;
          --dark-blue: #001a33;
          --text: #f5f5f5;
          --muted: #aaa;
          --bg: #0a0a0a;
          --card-bg: rgba(0, 26, 51, 0.6);
        }
      `}</style>
      <div style={styles.authCard}>
        <div style={styles.brandSection}>
          <img src="/ascend-logo.jpg" alt="Ascend Capital" style={styles.brandLogo} />
          <h1 style={styles.brandTitle}>ascend<span style={{ color: '#D4AF37' }}>capital</span></h1>
        </div>

        <h2 style={styles.formTitle}>Sign In</h2>
        <p style={styles.formSubtitle}>Access your trading dashboard and referral program</p>

        <form onSubmit={handleLogin} style={styles.form}>
          {error && <div style={styles.errorBox}>{error}</div>}

          <div style={styles.formGroup}>
            <label style={styles.label}>Email Address</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              style={styles.input}
              disabled={loading}
            />
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              style={styles.input}
              disabled={loading}
            />
          </div>

          <button type="submit" style={styles.primaryButton} disabled={loading}>
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>

        <div style={styles.divider}></div>

        <div style={styles.callToAction}>
          <p style={styles.ctaText}>Don't have an account?</p>
          <button
            onClick={() => onNavigate('/register')}
            style={styles.secondaryButton}
            disabled={loading}
          >
            Create Account
          </button>
        </div>
      </div>
    </div>
  );
}

function RegisterPage({ onNavigate, onLoginSuccess }) {
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    password: '',
    confirmPassword: '',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [referralCode, setReferralCode] = useState('');

  useEffect(() => {
    // Extract referral code from URL query parameter
    const params = new URLSearchParams(window.location.search);
    const ref = params.get('ref');
    if (ref) {
      setReferralCode(ref);
    }
  }, []);

  async function handleRegister(e) {
    e.preventDefault();
    
    if (!formData.firstName || !formData.lastName || !formData.email || !formData.phone || !formData.password) {
      setError('All fields are required');
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (formData.password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const result = await requestApi('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          firstName: formData.firstName,
          lastName: formData.lastName,
          email: formData.email,
          phone: formData.phone,
          password: formData.password,
          referralCode: referralCode || undefined, // Include referral code if present
        }),
      });

      onLoginSuccess(result);
    } catch (err) {
      setError(err.message || 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={styles.authContainer}>
      <div style={styles.authCard}>
        <div style={styles.brandSection}>
          <img src="/ascend-logo.jpg" alt="Ascend Capital" style={styles.brandLogo} />
          <h1 style={styles.brandTitle}>ascend<span style={{ color: '#D4AF37' }}>capital</span></h1>
        </div>

        <h2 style={styles.formTitle}>Create Account</h2>
        <p style={styles.formSubtitle}>Start your trading journey and earn with referrals</p>

        {referralCode && (
          <div style={styles.referralBanner}>
            ✨ Joined with referral code: <strong>{referralCode}</strong>
          </div>
        )}

        <form onSubmit={handleRegister} style={styles.form}>
          {error && <div style={styles.errorBox}>{error}</div>}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div style={styles.formGroup}>
              <label style={styles.label}>First Name</label>
              <input
                type="text"
                value={formData.firstName}
                onChange={(e) => setFormData({...formData, firstName: e.target.value})}
                placeholder="John"
                style={styles.input}
                disabled={loading}
              />
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>Last Name</label>
              <input
                type="text"
                value={formData.lastName}
                onChange={(e) => setFormData({...formData, lastName: e.target.value})}
                placeholder="Doe"
                style={styles.input}
                disabled={loading}
              />
            </div>
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>Email Address</label>
            <input
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({...formData, email: e.target.value})}
              placeholder="you@example.com"
              style={styles.input}
              disabled={loading}
            />
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>Phone Number</label>
            <input
              type="tel"
              value={formData.phone}
              onChange={(e) => setFormData({...formData, phone: e.target.value})}
              placeholder="+1 (555) 123-4567"
              style={styles.input}
              disabled={loading}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div style={styles.formGroup}>
              <label style={styles.label}>Password</label>
              <input
                type="password"
                value={formData.password}
                onChange={(e) => setFormData({...formData, password: e.target.value})}
                placeholder="••••••••"
                style={styles.input}
                disabled={loading}
              />
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>Confirm Password</label>
              <input
                type="password"
                value={formData.confirmPassword}
                onChange={(e) => setFormData({...formData, confirmPassword: e.target.value})}
                placeholder="••••••••"
                style={styles.input}
                disabled={loading}
              />
            </div>
          </div>

          <button type="submit" style={styles.primaryButton} disabled={loading}>
            {loading ? 'Creating account…' : 'Create Account'}
          </button>
        </form>

        <div style={styles.divider}></div>

        <div style={styles.callToAction}>
          <p style={styles.ctaText}>Already have an account?</p>
          <button
            onClick={() => onNavigate('/login')}
            style={styles.secondaryButton}
            disabled={loading}
          >
            Sign In
          </button>
        </div>
      </div>
    </div>
  );
}

const styles = {
  authContainer: {
    minHeight: '100vh',
    background: 'linear-gradient(135deg, #001a33 0%, #0a0a0a 100%)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '20px',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },
  authCard: {
    background: 'rgba(0, 26, 51, 0.6)',
    border: '1px solid rgba(212, 175, 55, 0.3)',
    borderRadius: '16px',
    padding: '40px',
    backdropFilter: 'blur(10px)',
    width: '100%',
    maxWidth: '480px',
  },
  brandSection: {
    textAlign: 'center',
    marginBottom: '32px',
  },
  brandLogo: {
    width: '50px',
    height: '50px',
    borderRadius: '50%',
    marginBottom: '12px',
  },
  brandTitle: {
    fontSize: '24px',
    fontWeight: '700',
    color: '#f5f5f5',
  },
  formTitle: {
    fontSize: '20px',
    fontWeight: '700',
    color: '#f5f5f5',
    marginBottom: '8px',
  },
  formSubtitle: {
    fontSize: '13px',
    color: '#aaa',
    marginBottom: '24px',
  },
  form: {
    width: '100%',
  },
  formGroup: {
    marginBottom: '16px',
  },
  label: {
    display: 'block',
    fontSize: '12px',
    fontWeight: '600',
    color: '#D4AF37',
    marginBottom: '8px',
    textTransform: 'uppercase',
    letterSpacing: '0.8px',
  },
  input: {
    width: '100%',
    padding: '12px 16px',
    background: 'rgba(0, 0, 0, 0.3)',
    border: '1px solid rgba(212, 175, 55, 0.2)',
    borderRadius: '8px',
    color: '#f5f5f5',
    fontSize: '14px',
    fontFamily: 'inherit',
    transition: 'all 0.2s',
  },
  primaryButton: {
    width: '100%',
    padding: '12px',
    background: '#D4AF37',
    color: '#001a33',
    border: 'none',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s',
    marginTop: '8px',
  },
  secondaryButton: {
    width: '100%',
    padding: '12px',
    background: 'transparent',
    color: '#D4AF37',
    border: '1px solid #D4AF37',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  errorBox: {
    background: 'rgba(231, 76, 60, 0.1)',
    border: '1px solid rgba(231, 76, 60, 0.5)',
    borderRadius: '8px',
    padding: '12px',
    color: '#ff6b6b',
    fontSize: '13px',
    marginBottom: '16px',
  },
  referralBanner: {
    background: 'rgba(212, 175, 55, 0.15)',
    border: '1px solid rgba(212, 175, 55, 0.3)',
    borderRadius: '8px',
    padding: '12px',
    color: '#D4AF37',
    fontSize: '12px',
    marginBottom: '20px',
    textAlign: 'center',
  },
  divider: {
    height: '1px',
    background: 'rgba(212, 175, 55, 0.2)',
    margin: '24px 0',
  },
  callToAction: {
    textAlign: 'center',
  },
  ctaText: {
    fontSize: '13px',
    color: '#aaa',
    marginBottom: '12px',
  },
};

export default function App() {
  const [currentPage, setCurrentPage] = useState('/');
  const [account, setAccount] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check if user is already logged in on app load
    async function checkAuth() {
      try {
        const result = await requestApi('/api/auth/me');
        if (result) {
          setAccount(result);
          setCurrentPage('/');
        } else {
          // Not authenticated, redirect to login
          setCurrentPage('/login');
        }
      } catch (err) {
        // Not authenticated
        setCurrentPage('/login');
      } finally {
        setLoading(false);
      }
    }

    checkAuth();
  }, []);

  function handleNavigate(path) {
    setCurrentPage(path);
  }

  function handleLoginSuccess(accountData) {
    setAccount(accountData);
    setCurrentPage('/');
  }

  function handleLogout() {
    setAccount(null);
    setCurrentPage('/login');
    requestApi('/api/auth/logout', { method: 'POST' }).catch(console.error);
  }

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #001a33 0%, #0a0a0a 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#f5f5f5',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }}>
        Loading your dashboard…
      </div>
    );
  }

  // If not authenticated, show login/register pages
  if (!account) {
    if (currentPage === '/register') {
      return <RegisterPage onNavigate={handleNavigate} onLoginSuccess={handleLoginSuccess} />;
    }
    return <LoginPage onNavigate={handleNavigate} onLoginSuccess={handleLoginSuccess} />;
  }

  // If authenticated and on referral page
  if (currentPage === '/referral') {
    return <ReferralPage account={account} onNavigate={handleNavigate} />;
  }

  // Main dashboard (placeholder - integrate with your existing dashboard)
  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #001a33 0%, #0a0a0a 100%)',
      color: '#f5f5f5',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      padding: '20px',
    }}>
      <style>{`
        @media (max-width: 640px) {
          body { margin: 0; }
        }
      `}</style>
      
      <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '40px',
          gap: '20px',
          flexWrap: 'wrap',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <img src="/ascend-logo.jpg" alt="Ascend Capital" style={{ width: '40px', height: '40px', borderRadius: '50%' }} />
            <h1 style={{ fontSize: '20px', fontWeight: '700' }}>ascend<span style={{ color: '#D4AF37' }}>capital</span></h1>
          </div>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <button
              onClick={() => handleNavigate('/referral')}
              style={{
                padding: '10px 18px',
                border: '1px solid #D4AF37',
                borderRadius: '6px',
                background: 'transparent',
                color: '#D4AF37',
                fontSize: '12px',
                fontWeight: '600',
                cursor: 'pointer',
                transition: 'all 0.2s',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <Icon name="users" size={14} /> Referral Program
            </button>
            <button
              onClick={handleLogout}
              style={{
                padding: '10px 18px',
                border: '1px solid #D4AF37',
                borderRadius: '6px',
                background: 'transparent',
                color: '#D4AF37',
                fontSize: '12px',
                fontWeight: '600',
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
            >
              Sign Out
            </button>
          </div>
        </div>

        <div style={{
          background: 'rgba(0, 26, 51, 0.6)',
          border: '1px solid rgba(212, 175, 55, 0.3)',
          borderRadius: '16px',
          padding: '40px',
          backdropFilter: 'blur(10px)',
          textAlign: 'center',
        }}>
          <h2 style={{ fontSize: '24px', fontWeight: '700', marginBottom: '12px' }}>
            Welcome, {account.firstName} {account.lastName}!
          </h2>
          <p style={{ color: '#aaa', marginBottom: '30px' }}>
            Your trading dashboard and full interface will be integrated here. Use the menu above to access your referral program.
          </p>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
            gap: '20px',
          }}>
            {DEPOSIT_PLANS.map((plan) => (
              <div
                key={plan.id}
                style={{
                  background: 'rgba(0, 0, 0, 0.3)',
                  border: '1px solid rgba(212, 175, 55, 0.2)',
                  borderRadius: '12px',
                  padding: '20px',
                  textAlign: 'left',
                }}
              >
                <h3 style={{ color: '#D4AF37', fontWeight: '600', marginBottom: '8px' }}>{plan.name}</h3>
                <p style={{ color: '#aaa', fontSize: '12px', marginBottom: '12px' }}>
                  Investment: ${plan.amount}
                </p>
                <p style={{ fontSize: '14px', marginBottom: '8px' }}>
                  Daily Return: <span style={{ color: '#D4AF37', fontWeight: '600' }}>{plan.dailyReturn}%</span>
                </p>
                <p style={{ fontSize: '14px' }}>
                  Total ROI: <span style={{ color: '#64c864', fontWeight: '600' }}>{plan.roi}%</span>
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
