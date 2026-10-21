import React, { useEffect, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import DownloadAndroidButton from './components/DownloadAndroidButton';

const plans = [
  { deposit: 300, earning: '8', dailyIncome: 8 },
  { deposit: 400, earning: '11', dailyIncome: 11 },
  { deposit: 500, earning: '15', dailyIncome: 15 },
  { deposit: 750, earning: '25', dailyIncome: 25 },
  { deposit: 1000, earning: '35', dailyIncome: 35 },
  { deposit: 2000, earning: '70', dailyIncome: 70 },
  { deposit: 5000, earning: '180', dailyIncome: 180 },
  { deposit: 10000, earning: '370', dailyIncome: 370 },
  { deposit: 20000, earning: '750', dailyIncome: 750 },
  { deposit: 35000, earning: '1,400', dailyIncome: 1400 },
];

const ranks = [
  { name: 'Star 1', direct: 5, team: null, reward: '$80', weeklySalary: null },
  { name: 'Star 2', direct: 7, team: 13, reward: '$150', weeklySalary: '$100' },
  { name: 'Star 3', direct: 8, team: 25, reward: '$250', weeklySalary: '$200' },
  { name: 'Star 4', direct: 9, team: 40, reward: '$400', weeklySalary: '$300' },
  { name: 'Star 5', direct: 10, team: 70, reward: '$700', weeklySalary: '$450' },
  { name: 'Star 6', direct: 11, team: 150, reward: '$1,000', weeklySalary: '$900' },
  { name: 'Star 7', direct: 12, team: 400, reward: '$2,500 + house', weeklySalary: '$1,500' },
  { name: 'Star 8', direct: 13, team: 700, reward: '$4,500 + Mazda CX-5', weeklySalary: '$2,500' },
  { name: 'Crown Leader', direct: 14, team: 1000, reward: '$7,000 + Mercedes-Benz E300', weeklySalary: '$5,000' },
];

const navItems = [
  { id: 'overview', label: 'Overview', icon: 'grid' },
  { id: 'deposits', label: 'Deposit plans', icon: 'chart' },
  { id: 'referrals', label: 'Referrals & ranks', icon: 'users' },
  { id: 'rewards', label: 'Prime hour', icon: 'clock' },
];

function generateTradingData() {
  const today = new Date();
  const data = [];
  const currencies = [
    { name: 'EUR/USD', baseProfit: 1.2 },
    { name: 'GBP/USD', baseProfit: 1.5 },
    { name: 'XAU/USD', baseProfit: 2.1 },
    { name: 'BTC/USD', baseProfit: 3.2 },
  ];

  for (let i = 14; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    const dayStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

    const dataPoint = { date: dayStr };
    currencies.forEach(currency => {
      const volatility = (Math.random() - 0.5) * 0.4;
      const profit = currency.baseProfit * (1 + volatility) * (1 + i * 0.02);
      dataPoint[currency.name.replace('/', '')] = Math.round(profit * 100) / 100;
    });
    data.push(dataPoint);
  }
  return data;
}

function getTimeGreeting() {
  const now = new Date();
  const hours = now.getHours();

  if (hours >= 5 && hours < 12) {
    return 'Good morning';
  } else if (hours >= 12 && hours < 13) {
    return 'Good noon';
  } else if (hours >= 13 && hours < 18) {
    return 'Good afternoon';
  } else {
    return 'Good evening';
  }
}

function maskAddress(address) {
  if (!address || address.length < 12) return address;
  return address.slice(0, 4) + '•'.repeat(address.length - 8) + address.slice(-4);
}

function Icon({ name, size = 18 }) {
  const paths = {
    grid: <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>,
    chart: <><path d="M3 3v18h18" /><path d="m7 14 4-4 4 3 6-7" /></>,
    users: <><path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="10" cy="7" r="4" /><path d="M20 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    arrow: <><path d="M7 17 17 7M7 7h10v10" /></>,
    wallet: <><rect x="3" y="5" width="18" height="15" rx="2" /><path d="M3 9h18M16 15h.01" /><path d="M6 5V3h12v2" /></>,
    plus: <><path d="M12 5v14M5 12h14" /></>,
    withdraw: <><path d="M12 19V5M5 12l7-7 7 7" /></>,
    copy: <><rect x="8" y="8" width="13" height="13" rx="2" /><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    close: <><path d="m18 6-12 12M6 6l12 12" /></>,
    shield: <><path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11" /><path d="m9 12 2 2 4-4" /></>,
    spark: <><path d="m12 3 1.9 5.8L20 11l-6.1 2.2L12 19l-1.9-5.8L4 11l6.1-2.2L12 3Z" /><path d="m19 14 1.3 2.7L23 18l-2.7 1.3L19 22l-1.3-2.7L15 18l2.7-1.3L19 14Z" /></>,
    menu: <><path d="M4 6h16M4 12h16M4 18h16" /></>,
    trending: <><path d="M3 3v18h18" /><polyline points="7 14 11 10 15 14 19 8" /></>,
    link: <><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></>,
  };

  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

async function requestApi(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    credentials: 'include',
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
  });
  if (response.status === 204) return null;

  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'The account request failed.');
  return result;
}

function PasswordToggleInput({ label, value, onChange, error, required = false, showPassword, onToggle, autoComplete = 'current-password' }) {
  return (
    <label className="account-field" style={{position: 'relative'}}>
      {label}
      <input
        type={showPassword ? 'text' : 'password'}
        autoComplete={autoComplete}
        minLength={6}
        maxLength={128}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required={required}
        style={{paddingRight: '40px'}}
      />
      <button
        type="button"
        onClick={onToggle}
        aria-label={showPassword ? 'Hide password' : 'Show password'}
        tabIndex={-1}
        style={{
          position: 'absolute',
          right: '12px',
          top: '50%',
          transform: 'translateY(-50%)',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: '6px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#6b7280',
          transition: 'color 0.2s ease',
          marginTop: '22px'
        }}
        onMouseEnter={(e) => e.target.style.color = '#374151'}
        onMouseLeave={(e) => e.target.style.color = '#6b7280'}
      >
        {showPassword ? (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        ) : (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
            <line x1="1" y1="1" x2="23" y2="23" />
          </svg>
        )}
      </button>
    </label>
  );
}

function AuthPage({ mode, name, email, password, phone, pin, error, storageMode, referralCode, onNameChange, onEmailChange, onPasswordChange, onPhoneChange, onPinChange, onSubmit, onNavigate, showPassword, onTogglePasswordVisibility }) {
  const registering = mode === 'register';

  return (
    <main className="standalone-shell">
      <a className="brand standalone-brand" href="/" onClick={(event) => { event.preventDefault(); onNavigate('/'); }}>
        <img src="/ascend-logo.jpg" alt="Ascend Capital" className="brand-logo" style={{width: '40px', height: '40px', borderRadius: '50%'}} />
        <span className="brand-name">ascend<span>capital</span></span>
      </a>
      <section className="standalone-card">
        <div className="eyebrow"><span className="eyebrow-line" /> MEMBER ACCOUNT</div>
        <h1>{registering ? 'Create your account' : 'Welcome back'}<span className="title-period">.</span></h1>
        <p className="standalone-description">Sign in to manage your member profile and process real transactions.</p>
        {registering && referralCode && (
          <div className="referral-notice" role="note">
            <Icon name="link" size={16} />
            <div>
              <strong>Referral code detected</strong>
              <span>You're registering with referral code: <code>{referralCode}</code></span>
            </div>
          </div>
        )}
        {storageMode === 'ephemeral' && <div className="storage-warning" role="note"><strong>Temporary account storage</strong><span>This free hosting setup can erase account data when the service restarts. Do not reuse a password from another service.</span></div>}
        <form onSubmit={onSubmit}>
          {registering && <label className="account-field">Full name<input type="text" autoComplete="name" minLength={2} maxLength={80} value={name} onChange={(event) => onNameChange(event.target.value)} required /></label>}
          <label className="account-field">Email address<input type="email" autoComplete="email" maxLength={254} value={email} onChange={(event) => onEmailChange(event.target.value)} required /></label>
          {registering && (
            <>
              <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px'}}>
                <label className="account-field">Phone<input type="tel" autoComplete="tel" placeholder="+254 7XX XXX XXX" value={phone} onChange={(event) => onPhoneChange(event.target.value)} /></label>
                <label className="account-field">PIN (6 digits)<input type="text" inputMode="numeric" maxLength={6} placeholder="000000" value={pin} onChange={(event) => onPinChange(event.target.value)} /></label>
              </div>
            </>
          )}
          <>
            <PasswordToggleInput
              label="Password"
              value={password}
              onChange={onPasswordChange}
              showPassword={showPassword}
              onToggle={onTogglePasswordVisibility}
              autoComplete={registering ? 'new-password' : 'current-password'}
              required
            />
            {registering && <span className="field-hint">Use at least 6 characters.</span>}
          </>
          {error && <div className="modal-message" role="alert">{error}</div>}
          <button className="button button-primary modal-submit" type="submit">{registering ? 'Create account' : 'Sign in'} <Icon name="arrow" size={15} /></button>
        </form>
        <button className="account-switch" onClick={() => onNavigate(registering ? '/login' : '/register')}>{registering ? 'Already registered? Sign in' : 'New here? Create an account'}</button>
        <p className="modal-footnote"><Icon name="shield" size={13} /> Secure authentication · Real transactions</p>
      </section>
    </main>
  );
}

function AdminPage({ account, accountLoading, onNavigate }) {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editingId, setEditingId] = useState('');
  const [editedName, setEditedName] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (accountLoading) return undefined;
    if (account?.role !== 'admin') {
      setLoading(false);
      return undefined;
    }

    let cancelled = false;
    requestApi('/api/admin/accounts')
      .then(({ accounts: members }) => {
        if (!cancelled) setAccounts(members);
      })
      .catch((requestError) => {
        if (!cancelled) setError(requestError.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [account, accountLoading]);

  async function saveName(id) {
    setError('');
    setSaving(true);
    try {
      const result = await requestApi(`/api/admin/accounts/${encodeURIComponent(id)}/profile`, {
        method: 'PATCH',
        body: JSON.stringify({ name: editedName }),
      });
      setAccounts((current) => current.map((member) => member.id === id ? result.account : member));
      setEditingId('');
      setEditedName('');
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="standalone-shell">
      <a className="brand standalone-brand" href="/" onClick={(event) => { event.preventDefault(); onNavigate('/'); }}>
        <img src="/ascend-logo.jpg" alt="Ascend Capital" className="brand-logo" style={{width: '40px', height: '40px', borderRadius: '50%'}} />
        <span className="brand-name">ascend<span>capital</span></span>
      </a>
      <section className="admin-page-card">
        <div className="eyebrow"><span className="eyebrow-line" /> MEMBER ACCOUNT ADMINISTRATION</div>
        <h1>Manage member profiles<span className="title-period">.</span></h1>
        <p className="standalone-description">Administrators can view member accounts and update member display names. This area has no deposit, withdrawal, wallet, payout, or fund-approval controls.</p>
        <div className="admin-restriction"><Icon name="shield" size={16} /><span>Profile administration only · Financial operations are not supported.</span></div>
        {accountLoading || loading ? <p className="admin-empty">Loading account directory…</p>
          : account?.role !== 'admin' ? <div className="modal-message">Sign in with an administrator account to manage member profiles.</div>
            : error && accounts.length === 0 ? <div className="modal-message" role="alert">{error}</div>
              : (
                <>
                  {error && <div className="modal-message" role="alert">{error}</div>}
                  <div className="admin-table-wrap">
                    <table className="admin-table">
                      <thead><tr><th>MEMBER</th><th>EMAIL</th><th>ROLE</th><th>CREATED</th><th>ACTION</th></tr></thead>
                      <tbody>{accounts.map((member) => (
                        <tr key={member.id}>
                          <td>{editingId === member.id
                            ? <input className="admin-name-input" aria-label={`Name for ${member.email}`} value={editedName} onChange={(event) => setEditedName(event.target.value)} maxLength={80} />
                            : member.name}</td>
                          <td>{member.email}</td>
                          <td><span className={`admin-role ${member.role === 'admin' ? 'admin-role-active' : ''}`}>{member.role}</span></td>
                          <td>{new Date(member.createdAt).toLocaleDateString()}</td>
                          <td>{member.role === 'admin' ? <span className="admin-protected">Protected</span> : editingId === member.id
                            ? <button className="admin-action" disabled={saving} onClick={() => saveName(member.id)}>{saving ? 'Saving…' : 'Save'}</button>
                            : <button className="admin-action" onClick={() => { setEditingId(member.id); setEditedName(member.name); }}>Edit name</button>}</td>
                        </tr>
                      ))}</tbody>
                    </table>
                  </div>
                  {accounts.length === 0 && <p className="admin-empty">No member accounts yet.</p>}
                </>
              )}
        <button className="button button-secondary admin-back" onClick={() => onNavigate('/')}>Return to dashboard</button>
      </section>
    </main>
  );
}

// ✅ NEW COMPONENT: Display referred members with their details
function ReferredMembersList() {
  const [referrals, setReferrals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    requestApi('/api/referrals/list')
      .then(({ referrals: members }) => {
        if (!cancelled) {
          setReferrals(Array.isArray(members) ? members : []);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err.message);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <div style={{ padding: '20px', textAlign: 'center', color: '#aaa' }}>
        <p>Loading your network…</p>
      </div>
    );
  }

  if (referrals.length === 0) {
    return null;
  }

  return (
    <div>
      <div style={{ marginBottom: '12px' }}>
        <span style={{ fontSize: '12px', color: '#888', textTransform: 'uppercase', letterSpacing: '0.5px' }}>YOUR NETWORK</span>
        <h3 style={{ marginTop: '4px', marginBottom: '0' }}>Referred members</h3>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '12px', margin: '16px 0' }}>
        {referrals.map((member) => (
          <div
            key={member.id}
            style={{
              background: 'rgba(212, 175, 55, 0.05)',
              border: '1px solid rgba(212, 175, 55, 0.15)',
              borderRadius: '8px',
              padding: '14px',
            }}
          >
            <div style={{ marginBottom: '10px' }}>
              <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-light)', marginBottom: '3px' }}>
                {member.name}
              </div>
              <div style={{ fontSize: '11px', color: '#999', wordBreak: 'break-all' }}>
                {member.email}
              </div>
            </div>
            <div style={{ borderTop: '1px solid rgba(212, 175, 55, 0.1)', paddingTop: '10px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontSize: '12px' }}>
                <span style={{ color: '#aaa' }}>Deposits</span>
                <span style={{ fontWeight: '600', color: 'var(--gold)' }}>
                  ${member.totalDeposits.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px' }}>
                <span style={{ color: '#888' }}>Joined</span>
                <span style={{ color: '#bbb' }}>
                  {new Date(member.signedUpAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TradingGraph({ balance, totalDeposits }) {
  const data = generateTradingData();
  const hasDeposits = totalDeposits > 0;

  return (
    <section className="trading-graph-section">
      <div className="section-heading">
        <div><div className="eyebrow"><span className="eyebrow-line" /> MARKET PERFORMANCE</div><h2>Currency trading profits</h2><p className="section-subtitle">Daily profit tracking across major currency pairs linked to your deposits.</p></div>
        <span className="count-tag">15 days <span className="count-dot" /></span>
      </div>
      {hasDeposits ? (
        <div className="graph-container">
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={data} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
              <defs>
                <linearGradient id="colorEUR" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#D4AF37" stopOpacity={0.8}/>
                  <stop offset="95%" stopColor="#D4AF37" stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="colorGBP" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#005299" stopOpacity={0.8}/>
                  <stop offset="95%" stopColor="#005299" stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="colorXAU" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#E8C547" stopOpacity={0.8}/>
                  <stop offset="95%" stopColor="#E8C547" stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="colorBTC" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#FF9900" stopOpacity={0.8}/>
                  <stop offset="95%" stopColor="#FF9900" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(212, 175, 55, 0.2)" />
              <XAxis dataKey="date" stroke="#888" style={{ fontSize: '12px' }} />
              <YAxis stroke="#888" style={{ fontSize: '12px' }} />
              <Tooltip
                contentStyle={{ backgroundColor: '#1a1a1a', border: '1px solid #D4AF37', borderRadius: '8px' }}
                labelStyle={{ color: '#D4AF37' }}
                formatter={(value) => `$${value.toFixed(2)}`}
              />
              <Legend wrapperStyle={{ paddingTop: '20px' }} />
              <Line type="monotone" dataKey="EURUSD" stroke="#D4AF37" strokeWidth={2} dot={false} name="EUR/USD" isAnimationActive={true} />
              <Line type="monotone" dataKey="GBPUSD" stroke="#005299" strokeWidth={2} dot={false} name="GBP/USD" isAnimationActive={true} />
              <Line type="monotone" dataKey="XAUUSD" stroke="#E8C547" strokeWidth={2} dot={false} name="XAU/USD" isAnimationActive={true} />
              <Line type="monotone" dataKey="BTCUSD" stroke="#FF9900" strokeWidth={2} dot={false} name="BTC/USD" isAnimationActive={true} />
            </LineChart>
          </ResponsiveContainer>
          <div className="graph-stats">
            <div className="stat-item">
              <span className="stat-label">Linked deposit</span>
              <span className="stat-value">${totalDeposits.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">15-day avg profit</span>
              <span className="stat-value gold">+$45.32</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">Best performer</span>
              <span className="stat-value">BTC/USD</span>
            </div>
          </div>
        </div>
      ) : (
        <div className="graph-placeholder">
          <Icon name="chart" size={48} />
          <p>Make a deposit to see your trading performance across currency pairs.</p>
        </div>
      )}
    </section>
  );
}

function App() {
  const [route, setRoute] = useState(() => window.location.pathname);
  const [activeNav, setActiveNav] = useState('overview');
  const [modal, setModal] = useState(null);
  const [amount, setAmount] = useState('');
  const [destination, setDestination] = useState('');
  const [demoActivity, setDemoActivity] = useState([]);
  const [binanceWalletAddress, setBinanceWalletAddress] = useState('');
  const [walletAddressLoading, setWalletAddressLoading] = useState(true);
  const [walletAddressError, setWalletAddressError] = useState('');
  const [walletCopied, setWalletCopied] = useState(false);
  const [notice, setNotice] = useState('');
  const [mobileMenu, setMobileMenu] = useState(false);
  const [account, setAccount] = useState(null);
  const [storageMode, setStorageMode] = useState('checking');
  const [accountLoading, setAccountLoading] = useState(true);
  const [accountDialog, setAccountDialog] = useState(false);
  const [accountMode, setAccountMode] = useState(() => window.location.pathname === '/register' ? 'register' : 'login');
  const [accountName, setAccountName] = useState('');
  const [accountEmail, setAccountEmail] = useState('');
  const [accountPassword, setAccountPassword] = useState('');
  const [accountPhone, setAccountPhone] = useState('');
  const [accountPin, setAccountPin] = useState('');
  const [accountError, setAccountError] = useState('');
  const [accountMessage, setAccountMessage] = useState('');
  const [referralCode, setReferralCode] = useState('');
  const [balance, setBalance] = useState(0);
  const [totalDeposits, setTotalDeposits] = useState(0);
  const [dailyIncome, setDailyIncome] = useState(0);
  const [referralEarnings, setReferralEarnings] = useState(0);
  const [referralBonusFromThisDeposit, setReferralBonusFromThisDeposit] = useState(0);
  const [transactionLoading, setTransactionLoading] = useState(false);
  const [isPrimeHourActive, setIsPrimeHourActive] = useState(false);
  const [timeGreeting, setTimeGreeting] = useState(getTimeGreeting());
  const [weeklyData, setWeeklyData] = useState(null);
  const [weeklyLoading, setWeeklyLoading] = useState(false);
  const [referralStats, setReferralStats] = useState(null);
  const [referralStatsLoading, setReferralStatsLoading] = useState(false);
  const [earningsActive, setEarningsActive] = useState(false);
  const [earningsStartTime, setEarningsStartTime] = useState(null);
  const [lastDepositTime, setLastDepositTime] = useState(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showAccountPassword, setShowAccountPassword] = useState(false);
  const [adminCurrentPassword, setAdminCurrentPassword] = useState('');
  const [adminNewPassword, setAdminNewPassword] = useState('');
  const [adminConfirmPassword, setAdminConfirmPassword] = useState('');
  // ✅ ADD: New state variables for daily trade claim
  const [canClaimTrade, setCanClaimTrade] = useState(false);
  const [claimTradeLoading, setClaimTradeLoading] = useState(false);
  const [tradeClaimMessage, setTradeClaimMessage] = useState('');
  const [isTradingHourActive, setIsTradingHourActive] = useState(false);
  const [nextTradingTime, setNextTradingTime] = useState('');

  useEffect(() => {
    const interval = setInterval(() => {
      setTimeGreeting(getTimeGreeting());
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    function checkPrimeHour() {
      const now = new Date();
      const hours = now.getHours();
      const minutes = now.getMinutes();

      const currentMinutes = hours * 60 + minutes;
      const primeStart = 3 * 60 + 45;
      const primeEnd = 4 * 60 + 15;

      setIsPrimeHourActive(currentMinutes >= primeStart && currentMinutes < primeEnd);
    }

    checkPrimeHour();
    const interval = setInterval(checkPrimeHour, 30000);
    return () => clearInterval(interval);
  }, []);

  // ✅ ADD: Check trading hours (1:00 PM - 1:30 PM EAT)
  useEffect(() => {
    function checkTradingHours() {
      const now = new Date();
      const hours = now.getHours();
      const minutes = now.getMinutes();

      const currentMinutes = hours * 60 + minutes;
      const tradingStart = 13 * 60; // 1:00 PM (13:00 in 24-hour format)
      const tradingEnd = 13 * 60 + 30; // 1:30 PM (13:30 in 24-hour format)

      const isActive = currentMinutes >= tradingStart && currentMinutes < tradingEnd;
      setIsTradingHourActive(isActive);

      if (!isActive) {
        // Calculate next trading time
        let nextTime = new Date(now);
        if (currentMinutes >= tradingEnd) {
          // Trading window passed for today, set for tomorrow at 1:00 PM
          nextTime.setDate(nextTime.getDate() + 1);
          nextTime.setHours(13, 0, 0, 0);
        } else {
          // Trading window hasn't started yet today
          nextTime.setHours(13, 0, 0, 0);
        }

        const timeStr = nextTime.toLocaleString('en-US', {
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          hour12: true
        });
        setNextTradingTime(timeStr);
      }
    }

    checkTradingHours();
    const interval = setInterval(checkTradingHours, 30000);
    return () => clearInterval(interval);
  }, []);

  // ✅ REMOVED: Automatic earnings activation - now manual claim only during 1:00 PM - 1:30 PM EAT trading window
  // All earnings are claimed manually through the claim button during trading hours

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const refCode = params.get('ref') || params.get('referral') || '';
    if (refCode) {
      setReferralCode(refCode);
    }
  }, []);

  // ✅ ADD: New function to fetch claim eligibility
  async function fetchCanClaimTrade() {
    if (!account || totalDeposits === 0) {
      setCanClaimTrade(false);
      return;
    }
    try {
      const result = await requestApi('/api/trading/can-claim-today');
      setCanClaimTrade(result.canClaim || false);
    } catch (error) {
      console.error('Failed to fetch claim status:', error);
      setCanClaimTrade(false);
    }
  }

  // ✅ ADD: New function to claim daily trade
  async function claimDailyTrade() {
    if (!account || totalDeposits === 0 || claimTradeLoading) {
      setTradeClaimMessage('Cannot claim trade at this time.');
      return;
    }

    setClaimTradeLoading(true);
    setTradeClaimMessage('');

    try {
      const result = await requestApi('/api/trading/claim-daily-trade', {
        method: 'POST',
        body: JSON.stringify({}),
      });

      setTradeClaimMessage(result.message || 'Trade claimed successfully! Your profit has been added to your balance.');
      setCanClaimTrade(false);

      // Refresh balance after successful claim
      await fetchAccountBalance();
    } catch (error) {
      setTradeClaimMessage(`Error: ${error.message}`);
      setCanClaimTrade(true);
    } finally {
      setClaimTradeLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    requestApi('/api/public-config')
      .then(({ binanceWalletAddress: address }) => {
        if (!cancelled) setBinanceWalletAddress(typeof address === 'string' ? address.trim() : '');
      })
      .catch((error) => {
        if (!cancelled) setWalletAddressError(error.message);
      })
      .finally(() => {
        if (!cancelled) setWalletAddressLoading(false);
      });

    requestApi('/api/health')
      .then(({ accountStorage }) => {
        if (!cancelled) setStorageMode(accountStorage);
      })
      .catch(() => {
        if (!cancelled) setStorageMode('unknown');
      });

    requestApi('/api/auth/me')
      .then(({ account: currentAccount }) => {
        if (cancelled) return;
        setAccount(currentAccount);
        setAccountName(currentAccount?.name ?? '');
        setAccountEmail(currentAccount?.email ?? '');
        setAccountPhone(currentAccount?.phone ?? '');
        if (currentAccount) {
          fetchAccountBalance();
          fetchTransactionHistory();
          fetchWeeklySalary();
          fetchReferralCode();
          fetchReferralStats();
          // ✅ ADD: Fetch claim status on login
          fetchCanClaimTrade();
        }
      })
      .catch((error) => {
        if (!cancelled) setAccountError(`Account service is unavailable: ${error.message}`);
      })
      .finally(() => {
        if (!cancelled) setAccountLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  async function fetchAccountBalance() {
    try {
      const result = await requestApi('/api/transactions');
      setBalance(result.balance || 0);
      setTotalDeposits(result.balance || 0);

      if (result.lastDepositTime) {
        setLastDepositTime(result.lastDepositTime);
      }

      // ✅ UPDATED: Calculate daily income for manual claiming - not tied to automatic activation
      const depositAmount = result.balance || 0;
      const matchingPlan = plans.find((plan) => plan.deposit === depositAmount);
      const dailyIncomeValue = matchingPlan ? matchingPlan.dailyIncome : 0;
      setDailyIncome(dailyIncomeValue);
    } catch (error) {
      console.error('Failed to fetch balance:', error);
    }
  }

  async function fetchTransactionHistory() {
    try {
      const result = await requestApi('/api/transactions');
      const transactions = (result.transactions || []).map((tx) => ({
        id: tx.id,
        type: tx.type === 'deposit' ? 'Deposit' : 'Withdrawal',
        amount: tx.amount,
        createdAt: new Date(tx.createdAt).toLocaleTimeString(),
        status: tx.status,
      }));
      setDemoActivity(transactions.slice(0, 5));
    } catch (error) {
      console.error('Failed to fetch transaction history:', error);
    }
  }

  async function fetchWeeklySalary() {
    if (!account) return;
    setWeeklyLoading(true);
    try {
      const result = await requestApi('/api/referrals/weekly-salary');
      setWeeklyData({
        tier: result?.tier || null,
        weeklySalary: typeof result?.weeklySalary === 'number' ? result.weeklySalary : 0,
        directCount: typeof result?.directCount === 'number' ? result.directCount : 0,
        teamTotal: typeof result?.teamTotal === 'number' ? result.teamTotal : 0,
        totalEarned: typeof result?.totalEarned === 'number' ? result.totalEarned : 0,
        recentPayments: Array.isArray(result?.recentPayments) ? result.recentPayments : [],
        message: result?.message || null,
      });
    } catch (error) {
      console.error('Failed to fetch weekly salary:', error);
      setWeeklyData({
        tier: null,
        weeklySalary: 0,
        directCount: 0,
        teamTotal: 0,
        totalEarned: 0,
        recentPayments: [],
        message: 'Unable to load salary information.',
      });
    } finally {
      setWeeklyLoading(false);
    }
  }

  async function fetchReferralCode() {
    if (!account) return;
    try {
      const result = await requestApi('/api/referrals/code');
      setAccount((prev) => ({...prev, referralCode: result.code}));
    } catch (error) {
      console.error('Failed to fetch referral code:', error);
    }
  }

  async function fetchReferralStats() {
    if (!account) return;
    setReferralStatsLoading(true);
    try {
      const result = await requestApi('/api/referrals/stats');
      setReferralStats(result);

      let bonusAmount = 0;

      if (typeof result.totalEarned === 'number') {
        bonusAmount = Math.floor(result.totalEarned);
      } else {
        const totalReferralDeposits =
          result.totalReferralDeposits ||
          result.referralDepositsTotal ||
          result.totalDepositsFromReferrals ||
          result.totalDeposits ||
          0;
        bonusAmount = Math.floor(totalReferralDeposits * 0.05);
      }

      setReferralEarnings(bonusAmount);
    } catch (error) {
      console.error('Failed to fetch referral stats:', error);
      setReferralStats(null);
      setReferralEarnings(0);
    } finally {
      setReferralStatsLoading(false);
    }
  }

  useEffect(() => {
    if (account) {
      fetchWeeklySalary();
      const timer = setTimeout(() => {
        fetchReferralStats();
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [account]);

  useEffect(() => {
    function syncRoute() {
      setRoute(window.location.pathname);
      setActiveNav(window.location.pathname === '/referrals' ? 'referrals' : window.location.pathname === '/admin' ? 'admin' : 'overview');
    }
    window.addEventListener('popstate', syncRoute);
    return () => window.removeEventListener('popstate', syncRoute);
  }, []);

  const currentPage = activeNav === 'admin' ? 'Member admin' : navItems.find((item) => item.id === activeNav)?.label ?? 'Overview';

  function openModal(kind, preset = '') {
    setAmount(preset);
    setDestination('');
    setWalletCopied(false);
    setNotice('');
    setModal(kind);
  }

  async function copyBinanceWalletAddress() {
    if (walletAddressLoading) {
      setNotice('The Binance wallet address is still loading. Please try again shortly.');
      return;
    }
    if (walletAddressError) {
      setNotice(`Could not load the Binance wallet address: ${walletAddressError}`);
      return;
    }
    if (!binanceWalletAddress) {
      setNotice('Binance wallet address is not configured. Set BINANCE_WALLET_ADDRESS in Render.');
      return;
    }

    try {
      await navigator.clipboard.writeText(binanceWalletAddress);
      setWalletCopied(true);
      setNotice('Binance wallet address copied.');
    } catch {
      setNotice('Could not copy the wallet address. Select and copy it manually.');
    }
  }

  async function submitShowcaseAction(event) {
    event.preventDefault();
    const value = Number(amount);

    if (!account) {
      setNotice('You must be signed in to perform transactions.');
      return;
    }

    if (!Number.isFinite(value) || value <= 0) {
      setNotice('Enter an amount greater than $0.');
      return;
    }

    if (modal === 'withdraw' && value < 40) {
      setNotice('The minimum withdrawal amount is $40.');
      return;
    }

    if (modal === 'withdraw' && value > balance) {
      setNotice('Insufficient balance for this withdrawal.');
      return;
    }

    if (modal === 'withdraw' && destination.trim().length < 8) {
      setNotice('Enter a wallet address with at least 8 characters.');
      return;
    }

    setTransactionLoading(true);
    try {
      const result = await requestApi('/api/transactions', {
        method: 'POST',
        body: JSON.stringify({
          type: modal === 'withdraw' ? 'withdrawal' : 'deposit',
          amount: value,
          reference: modal === 'withdraw' ? destination.trim() : `Deposit-${Date.now()}`,
        }),
      });

      const txData = result.transaction || {};
      const entry = {
        id: txData.id || `${Date.now()}-${Math.random()}`,
        type: modal === 'withdraw' ? 'Withdrawal' : 'Deposit',
        amount: value,
        createdAt: new Date().toLocaleTimeString(),
        status: txData.status || 'pending',
      };

      setDemoActivity((current) => [entry, ...current].slice(0, 5));
      const newBalance = balance + (modal === 'withdraw' ? -value : value);
      setBalance(newBalance);

      if (modal === 'deposit') {
        setTotalDeposits(value);

        const now = new Date();
        setLastDepositTime(now.toISOString());

        // ✅ UPDATED: Calculate daily income based on deposit amount for manual claiming during 1:00 PM - 1:30 PM EAT
        const matchingPlan = plans.find((plan) => plan.deposit === value);
        const dailyIncomeValue = matchingPlan ? matchingPlan.dailyIncome : 0;
        setDailyIncome(dailyIncomeValue);
      }

      setModal(null);
      setAmount('');
      setDestination('');
      setNotice(`${entry.type} of $${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} processed successfully.`);

      if (account) {
        await fetchAccountBalance();
        await fetchReferralStats();
        // ✅ ADD: Refresh claim status after deposit/withdrawal
        await fetchCanClaimTrade();
      }
    } catch (error) {
      setNotice(`Transaction failed: ${error.message}`);
    } finally {
      setTransactionLoading(false);
    }
  }

  function openAccountDialog(mode = null) {
    if (mode) {
      setAccountMode(mode);
    } else {
      setAccountMode(account ? 'profile' : 'login');
    }
    setAccountName(account?.name ?? '');
    setAccountEmail(account?.email ?? '');
    setAccountPassword('');
    setAccountPhone(account?.phone ?? '');
    setAccountPin('');
    setAccountError('');
    setAccountMessage('');
    setAdminCurrentPassword('');
    setAdminNewPassword('');
    setAdminConfirmPassword('');
    setAccountDialog(true);
  }

  function openAdminPasswordDialog() {
    setAccountMode('admin-password');
    setAdminCurrentPassword('');
    setAdminNewPassword('');
    setAdminConfirmPassword('');
    setAccountError('');
    setAccountMessage('');
    setAccountDialog(true);
  }

  async function submitAccount(event) {
    event.preventDefault();
    setAccountError('');
    setAccountMessage('');

    try {
      if (accountMode === 'admin-password') {
        if (!adminCurrentPassword || !adminNewPassword || !adminConfirmPassword) {
          setAccountError('All password fields are required.');
          return;
        }
        if (adminNewPassword.length < 6 || adminNewPassword.length > 128) {
          setAccountError('New password must be between 6 and 128 characters.');
          return;
        }
        if (adminNewPassword !== adminConfirmPassword) {
          setAccountError('New password and confirmation do not match.');
          return;
        }
        if (adminCurrentPassword === adminNewPassword) {
          setAccountError('New password must be different from the current password.');
          return;
        }

        const result = await requestApi('/api/admin/auth/password', {
          method: 'POST',
          body: JSON.stringify({
            currentPassword: adminCurrentPassword,
            newPassword: adminNewPassword,
          }),
        });

        setAdminCurrentPassword('');
        setAdminNewPassword('');
        setAdminConfirmPassword('');
        setAccountMessage('Password changed successfully. You will need to sign in again.');

        setTimeout(() => logout(), 2000);
        return;
      }

      if (accountMode === 'profile') {
        const result = await requestApi('/api/auth/profile', {
          method: 'PATCH',
          body: JSON.stringify({ name: accountName }),
        });
        setAccount(result.account);
        setAccountName(result.account.name);
        setAccountMessage('Profile updated.');
        return;
      }

      const register = accountMode === 'register';
      const result = await requestApi(`/api/auth/${register ? 'register' : 'login'}`, {
        method: 'POST',
        body: JSON.stringify({
          ...(register ? { name: accountName } : {}),
          email: accountEmail,
          password: accountPassword,
          ...(register && accountPhone ? { phone: accountPhone } : {}),
          ...(register && accountPin ? { pin: accountPin } : {}),
          ...(register && referralCode ? { referralCode } : {}),
        }),
      });
      const accountWithReferral = {...result.account};
      setAccount(accountWithReferral);
      setAccountName(result.account.name);
      setAccountEmail(result.account.email);
      setAccountPhone(result.account.phone ?? '');
      setAccountPassword('');
      setAccountPin('');
      setAccountDialog(false);

      if (result.account) {
        await fetchAccountBalance();
        await fetchTransactionHistory();
        await fetchWeeklySalary();
        await fetchReferralCode();
        await fetchReferralStats();
        // ✅ ADD: Fetch claim status after login
        await fetchCanClaimTrade();
      }

      if (route === '/login' || route === '/register') navigate(result.account.role === 'admin' ? '/admin' : '/');
      setNotice(register ? 'Your account has been created.' : 'You are signed in.');
    } catch (error) {
      setAccountError(error.message);
    }
  }

  async function logout() {
    try {
      await requestApi('/api/auth/logout', { method: 'POST', body: '{}' });
      setAccount(null);
      setAccountName('');
      setAccountEmail('');
      setAccountPhone('');
      setAccountPassword('');
      setAccountPin('');
      setAccountMode('login');
      setAccountMessage('');
      setAccountDialog(false);
      setBalance(0);
      setTotalDeposits(0);
      setDailyIncome(0);
      setReferralEarnings(0);
      setDemoActivity([]);
      setWeeklyData(null);
      setReferralStats(null);
      setLastDepositTime(null);
      setEarningsActive(false);
      setCanClaimTrade(false);
      setTradeClaimMessage('');
      setIsTradingHourActive(false);
      setNextTradingTime('');
      setNotice('You are signed out.');
    } catch (error) {
      setAccountError(error.message);
    }
  }

  function navigate(id) {
    if (id === '/login' || id === '/register' || id === '/referrals' || id === '/admin' || id === '/') {
      window.history.pushState({}, '', id);
      setRoute(id);
      if (id === '/login' || id === '/register') setAccountMode(id.slice(1));
      setActiveNav(id === '/referrals' ? 'referrals' : id === '/admin' ? 'admin' : 'overview');
      setMobileMenu(false);
      setAccountError('');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    setActiveNav(id);
    setMobileMenu(false);
    if (id === 'referrals') {
      navigate('/referrals');
      return;
    }
    if (id !== 'overview') {
      window.setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  if (!account && !accountLoading) {
    return <AuthPage
      mode={accountMode}
      name={accountName}
      email={accountEmail}
      password={accountPassword}
      phone={accountPhone}
      pin={accountPin}
      error={accountError}
      storageMode={storageMode}
      referralCode={referralCode}
      onNameChange={setAccountName}
      onEmailChange={setAccountEmail}
      onPasswordChange={setAccountPassword}
      onPhoneChange={setAccountPhone}
      onPinChange={setAccountPin}
      onSubmit={submitAccount}
      onNavigate={navigate}
      showPassword={showPassword}
      onTogglePasswordVisibility={() => setShowPassword(!showPassword)}
    />;
  }

  if (route === '/admin' && account) {
    return <AdminPage account={account} accountLoading={accountLoading} onNavigate={navigate} />;
  }

  return (
    <div className="app-shell">
      <style>{`
        * {
          box-sizing: border-box;
        }

        :root {
          --primary-blue: #003366;
          --dark-blue: #001a33;
          --light-blue: #005299;
          --gold: #D4AF37;
          --light-gold: #E8C547;
          --dark-gold: #AA8C2C;
          --text-light: #f5f5f5;
          --text-dark: #003366;
          --bg-dark: #0a0a0a;
          --bg-card: #1a1a1a;
          --border: #D4AF37;
        }

        .brand-logo {
          width: 40px;
          height: 40px;
          border-radius: 50%;
          object-fit: cover;
        }

        .pending-earnings {
          font-size: 12px;
          color: var(--gold);
          font-weight: 500;
        }

        .graph-placeholder {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 16px;
          padding: 60px 20px;
          text-align: center;
          color: var(--text-light);
        }

        .graph-placeholder small {
          display: block;
          color: var(--gold);
          font-size: 12px;
          margin-top: 8px;
        }

        .referral-notice {
          background: rgba(212, 175, 55, 0.1);
          border: 2px solid var(--gold);
          border-radius: 8px;
          padding: 16px;
          margin: 16px 0;
          display: flex;
          gap: 12px;
          align-items: flex-start;
          color: var(--gold);
        }

        .referral-notice > svg {
          flex-shrink: 0;
          margin-top: 2px;
        }

        .referral-notice strong {
          display: block;
          margin-bottom: 4px;
        }

        .referral-notice code {
          background: rgba(0, 0, 0, 0.3);
          padding: 2px 6px;
          border-radius: 4px;
          font-family: monospace;
          font-size: 12px;
        }

        @media (max-width: 480px) {
          .referral-notice {
            flex-direction: column;
            padding: 12px;
          }
        }

        .balance-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
          gap: 20px;
          margin: 30px 0;
        }

        @media (max-width: 768px) {
          .balance-grid {
            grid-template-columns: 1fr;
            gap: 16px;
            margin: 20px 0;
          }
        }

        @media (max-width: 480px) {
          .balance-grid {
            gap: 12px;
            margin: 16px 0;
          }
        }

        .plans-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
          gap: 16px;
          margin: 30px 0;
        }

        @media (max-width: 768px) {
          .plans-grid {
            grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
            gap: 12px;
            margin: 20px 0;
          }
        }

        @media (max-width: 480px) {
          .plans-grid {
            grid-template-columns: 1fr;
            gap: 10px;
            margin: 16px 0;
          }
        }

        .action-buttons {
          display: flex;
          flex-wrap: wrap;
          gap: 12px;
          margin-top: 20px;
        }

        @media (max-width: 768px) {
          .action-buttons {
            flex-direction: column;
            gap: 10px;
            margin-top: 16px;
          }

          .action-buttons .button {
            width: 100%;
          }

          .action-buttons a {
            width: 100% !important;
          }
        }

        @media (max-width: 480px) {
          .action-buttons {
            gap: 8px;
            margin-top: 12px;
          }
        }

        .action-buttons a {
          flex: 1;
          min-width: 150px;
        }

        .section-heading {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 30px;
          gap: 20px;
        }

        @media (max-width: 768px) {
          .section-heading {
            flex-direction: column;
            margin-bottom: 20px;
            gap: 16px;
          }

          .section-heading > div {
            width: 100%;
          }

          .count-tag {
            align-self: flex-start;
          }
        }

        @media (max-width: 480px) {
          .section-heading {
            margin-bottom: 16px;
            gap: 12px;
          }
        }

        .graph-stats {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
          gap: 16px;
          margin-top: 20px;
        }

        @media (max-width: 768px) {
          .graph-stats {
            grid-template-columns: repeat(2, 1fr);
            gap: 12px;
            margin-top: 16px;
          }
        }

        @media (max-width: 480px) {
          .graph-stats {
            grid-template-columns: 1fr;
            gap: 10px;
            margin-top: 12px;
          }
        }

        .rank-table-wrap {
          overflow-x: auto;
          border-radius: 8px;
          border: 2px solid rgba(212, 175, 55, 0.3);
          margin: 20px 0;
        }

        .rank-table {
          width: 100%;
          font-size: 14px;
        }

        @media (max-width: 768px) {
          .rank-table-wrap {
            margin: 16px 0;
          }

          .rank-table {
            font-size: 12px;
          }

          .rank-table th, .rank-table td {
            padding: 12px 8px;
          }

          .rank-number {
            display: none;
          }
        }

        @media (max-width: 480px) {
          .rank-table-wrap {
            margin: 12px 0;
            border-radius: 4px;
          }

          .rank-table {
            font-size: 10px;
          }

          .rank-table th, .rank-table td {
            padding: 6px 3px;
          }

          .reward-value {
            display: none;
          }
        }

        .sidebar {
          max-width: 280px;
        }

        @media (max-width: 768px) {
          .sidebar {
            max-width: 100%;
            width: 100%;
            height: 100vh;
          }

          .sidebar.sidebar-open {
            position: fixed;
            left: 0;
            top: 0;
            z-index: 1000;
            background: var(--bg-dark);
          }
        }

        .main-content {
          flex: 1;
        }

        .page-content {
          padding: 20px;
        }

        @media (max-width: 768px) {
          .page-content {
            padding: 16px;
          }
        }

        @media (max-width: 480px) {
          .page-content {
            padding: 12px;
          }
        }

        .button {
          padding: 12px 20px;
          border-radius: 6px;
          font-size: 14px;
          transition: all 0.2s ease;
        }

        @media (max-width: 768px) {
          .button {
            padding: 11px 18px;
            font-size: 13px;
          }
        }

        @media (max-width: 480px) {
          .button {
            padding: 10px 14px;
            font-size: 12px;
            border-radius: 4px;
          }
        }

        .modal {
          max-width: 90vw;
          max-height: 90vh;
          overflow-y: auto;
          padding: 0;
          border-radius: 8px;
        }

        @media (max-width: 768px) {
          .modal {
            max-width: 92vw;
            max-height: 92vh;
            border-radius: 8px;
          }
        }

        @media (max-width: 480px) {
          .modal {
            max-width: 96vw;
            max-height: 96vh;
            border-radius: 6px;
          }
        }

        .modal-icon {
          margin-bottom: 16px;
        }

        @media (max-width: 480px) {
          .modal-icon {
            margin-bottom: 12px;
          }
        }

        h1 {
          font-size: 28px;
          margin: 0 0 12px 0;
        }

        @media (max-width: 768px) {
          h1 {
            font-size: 24px;
          }
        }

        @media (max-width: 480px) {
          h1 {
            font-size: 20px;
          }
        }

        h2 {
          font-size: 24px;
          margin: 0 0 8px 0;
        }

        @media (max-width: 768px) {
          h2 {
            font-size: 20px;
          }
        }

        @media (max-width: 480px) {
          h2 {
            font-size: 18px;
          }
        }

        h3 {
          font-size: 18px;
        }

        @media (max-width: 480px) {
          h3 {
            font-size: 16px;
          }
        }

        p {
          font-size: 14px;
          line-height: 1.6;
        }

        @media (max-width: 480px) {
          p {
            font-size: 13px;
          }
        }

        .standalone-shell {
          min-height: 100vh;
          padding: 20px;
        }

        @media (max-width: 480px) {
          .standalone-shell {
            padding: 16px;
          }
        }

        .standalone-card {
          max-width: 400px;
          margin: 40px auto;
          padding: 30px;
          background: var(--bg-card);
          border: 2px solid rgba(212, 175, 55, 0.3);
          border-radius: 8px;
        }

        @media (max-width: 768px) {
          .standalone-card {
            margin: 30px auto;
            padding: 24px;
            border-radius: 8px;
          }
        }

        @media (max-width: 480px) {
          .standalone-card {
            margin: 16px auto;
            padding: 16px;
            max-width: 100%;
            border-radius: 6px;
          }
        }

        .section-block {
          margin: 30px 0;
          padding: 20px;
        }

        @media (max-width: 768px) {
          .section-block {
            margin: 20px 0;
            padding: 16px;
          }
        }

        @media (max-width: 480px) {
          .section-block {
            margin: 12px 0;
            padding: 12px;
          }
        }

        /* ✅ ADD: CSS for daily trade claim card */
        .daily-trade-claim-card {
          background: rgba(212, 175, 55, 0.08);
          border: 2px solid rgba(212, 175, 55, 0.3);
          border-radius: 8px;
          padding: 24px;
          margin: 20px 0;
          text-align: center;
        }

        .daily-trade-claim-card h3 {
          color: var(--gold);
          margin: 0 0 8px 0;
          font-size: 20px;
        }

        .daily-trade-claim-card p {
          color: #aaa;
          margin: 0 0 16px 0;
          font-size: 14px;
        }

        .daily-trade-claim-card button {
          background: var(--gold);
          color: #000;
          border: none;
          padding: 12px 32px;
          border-radius: 6px;
          font-weight: 600;
          font-size: 14px;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .daily-trade-claim-card button:hover:not(:disabled) {
          background: var(--light-gold);
          transform: translateY(-2px);
        }

        .daily-trade-claim-card button:disabled {
          background: #666;
          color: #999;
          cursor: not-allowed;
          opacity: 0.6;
        }

        /* ✅ ADD: CSS for daily trade claim message */
        .daily-trade-claim-message {
          margin-top: 16px;
          padding: 12px 16px;
          background: rgba(212, 175, 55, 0.15);
          border-left: 3px solid var(--gold);
          border-radius: 4px;
          color: var(--gold);
          font-size: 13px;
          font-weight: 500;
        }

        @media (max-width: 480px) {
          .daily-trade-claim-card {
            padding: 16px;
            margin: 16px 0;
          }

          .daily-trade-claim-card h3 {
            font-size: 18px;
          }

          .daily-trade-claim-card button {
            padding: 10px 24px;
            font-size: 13px;
          }
        }
      `}</style>

      <aside className={`sidebar ${mobileMenu ? 'sidebar-open' : ''}`}>
        <a className="brand" href="#overview" onClick={(event) => { event.preventDefault(); navigate('overview'); }}>
          <img src="/ascend-logo.jpg" alt="Ascend Capital" style={{width: '32px', height: '32px', borderRadius: '50%', marginRight: '8px'}} />
          <span className="brand-name">ascend<span>capital</span></span>
        </a>

        <div className="workspace-label">WORKSPACE</div>
        <nav className="main-nav" aria-label="Main navigation">
          {[...navItems, ...(account?.role === 'admin' ? [{ id: '/admin', label: 'Member admin', icon: 'users' }] : [])].map((item) => (
            <button className={`nav-item ${activeNav === item.id || (item.id === '/admin' && activeNav === 'admin') ? 'nav-active' : ''}`} key={item.id} onClick={() => navigate(item.id)}>
              <Icon name={item.icon} />
              <span>{item.label}</span>
              {activeNav === item.id && <span className="nav-indicator" />}
            </button>
          ))}
        </nav>

        <div className="sidebar-spacer" />
        <div className="sidebar-card">
          <div className="sidebar-card-icon"><Icon name="shield" size={17} /></div>
          <div className="sidebar-card-title">Your account</div>
          <p>{account ? `Signed in as ${account.email}.` : 'Create an account or sign in to manage your profile.'}</p>
          <button onClick={() => openAccountDialog()}>{account ? 'Manage profile' : 'Sign in or register'} <Icon name="arrow" size={13} /></button>
        </div>
        <div className="sidebar-footer"><span className="online-dot" /> All systems operational</div>
      </aside>

      {mobileMenu && <button className="mobile-overlay" aria-label="Close menu" onClick={() => setMobileMenu(false)} />}

      <main className="main-content" id="overview">
        <header className="topbar">
          <button className="mobile-menu-button" aria-label="Open navigation" onClick={() => setMobileMenu(!mobileMenu)}><Icon name={mobileMenu ? 'close' : 'menu'} /></button>
          <div className="breadcrumbs"><span>Workspace</span><span className="crumb-slash">/</span><strong>{currentPage}</strong></div>
          <div className="topbar-right">
            <span className="secure-label"><Icon name="shield" size={14} /> Secure dashboard</span>
            <button className="avatar" aria-label={account ? 'Manage account' : 'Sign in'} onClick={() => openAccountDialog()}>{account ? account.name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase() : 'AC'}</button>
          </div>
        </header>

        <div className="page-content">
          <section className="welcome-row">
            <div>
              <div className="eyebrow"><span className="eyebrow-line" /> MEMBER DASHBOARD</div>
              <h1>{account ? `${timeGreeting}, ${account.name.split(/\s+/)[0]}` : `${timeGreeting}`}<span className="title-period">.</span></h1>
              <p className="welcome-subtitle">Here's your Ascend Capital account at a glance.</p>
              <div className="header-wallet">
                <span className="header-wallet-label"><Icon name="wallet" size={14} /> PRIME WALLET ADDRESS</span>
                <code>{walletAddressError ? 'Address unavailable' : walletAddressLoading ? 'Loading wallet address…' : binanceWalletAddress ? maskAddress(binanceWalletAddress) : 'Not configured in Render'}</code>
                <button type="button" onClick={copyBinanceWalletAddress} disabled={walletAddressLoading || Boolean(walletAddressError) || !binanceWalletAddress} aria-label="Copy prime wallet address">
                  <Icon name={walletCopied ? 'check' : 'copy'} size={14} /> {walletCopied ? 'Copied' : 'Copy'}
                </button>
              </div>
            </div>
            <button className="date-chip"><span className="date-dot" /> Member overview</button>
          </section>

          <section className="balance-grid" aria-label="Wallet balances">
            <article className="balance-card balance-primary">
              <div className="card-topline">
                <span className="balance-label">Ascend wallet</span>
                <span className="balance-icon"><Icon name="wallet" size={18} /></span>
              </div>
              <div className="balance-value"><span className="currency">$</span>{balance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
              <div className="balance-bottom"><span className="balance-caption">Available balance</span><span className="balance-pill"><span /> USD</span></div>
            </article>
            <article className="balance-card">
              <div className="card-topline">
                <span className="balance-label">Total deposits</span>
                <span className="balance-icon subdued"><Icon name="trending" size={18} /></span>
              </div>
              <div className="balance-value"><span className="currency">$</span>{totalDeposits.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
              <div className="balance-bottom"><span className="balance-caption">Active investments</span><span className="muted-metric">{totalDeposits === 0 ? 'No activity yet' : 'Earning'}</span></div>
            </article>
            <article className="balance-card">
              <div className="card-topline">
                <span className="balance-label">Daily trade income</span>
                <span className="balance-icon subdued"><Icon name="spark" size={18} /></span>
              </div>
              <div className="balance-value gold-accent"><span className="currency">$</span>{totalDeposits > 0 ? dailyIncome : '0'}</div>
              <div className="balance-bottom">
                <span className="balance-caption">Claimable during trading hours</span>
                <span style={{ fontSize: '11px', color: '#D4AF37', fontWeight: '500' }}>1:00 PM - 1:30 PM EAT</span>
              </div>
            </article>
          </section>

          {/* Daily income card removed - now showing claim button during 1:00 PM - 1:30 PM trading window */}

          {account && totalDeposits > 0 && (
            <div className="daily-trade-claim-card">
              <h3>Claim Your Trade Today</h3>
              <p>Manually claim your daily trading profit from your active deposits</p>
              <p style={{ fontSize: '12px', color: '#888', marginBottom: '12px' }}>
                Trading hours: 1:00 PM - 1:30 PM EAT
              </p>
              <button onClick={claimDailyTrade} disabled={!canClaimTrade || claimTradeLoading || !isTradingHourActive}>
                {claimTradeLoading ? 'Processing...' : !isTradingHourActive ? `Trading Opens ${nextTradingTime}` : canClaimTrade ? 'Claim Daily Trade' : 'Already Claimed Today'}
              </button>
              {tradeClaimMessage && <div className="daily-trade-claim-message">{tradeClaimMessage}</div>}
              {!isTradingHourActive && (
                <div style={{ marginTop: '12px', fontSize: '12px', color: '#888' }}>
                  Next trading window opens at {nextTradingTime}
                </div>
              )}
            </div>
          )}

          {totalDeposits > 0 && (
            <TradingGraph balance={balance} totalDeposits={totalDeposits} />
          )}

          <section className="action-row" aria-label="Wallet actions">
            <div className="action-copy"><div className="action-heading"><span className="action-spark"><Icon name="spark" size={16} /></span>Ready to get started?</div><div className="action-description">Choose a plan to deposit into your account.</div></div>
            <div className="action-buttons">
              <button className="button button-secondary" onClick={() => openModal('withdraw')} disabled={!account}><Icon name="withdraw" size={16} /> Withdraw</button>
              <button className="button button-primary" onClick={() => navigate('deposits')} disabled={!account}><Icon name="plus" size={17} /> Make a deposit</button>
              <a href="/downloads/ascend-capital.apk" download className="button button-primary" style={{textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px'}}><Icon name="plus" size={17} /> Download Android App</a>
            </div>
          </section>

          <section className="section-block" id="deposits">
            <div className="section-heading">
              <div><div className="eyebrow"><span className="eyebrow-line" /> DEPOSIT PLANS</div><h2>Deposit plans</h2><p className="section-subtitle">Real deposits processed directly to your account balance.</p></div>
              <span className="count-tag">10 plans <span className="count-dot" /></span>
            </div>
            <div className="plans-grid">
              {plans.map((plan, index) => (
                <article className={`plan-card ${index === 5 ? 'plan-featured' : ''}`} key={plan.deposit}>
                  {index === 5 && <span className="popular-tag">POPULAR</span>}
                  <div className="plan-index">PLAN {String(index + 1).padStart(2, '0')}</div>
                  <div className="plan-deposit"><span>$</span>{plan.deposit.toLocaleString('en-US')}</div>
                  <div className="plan-divider" />
                  <div className="plan-earning-label">Daily trade income</div>
                  <div className="plan-earning"><span>$</span>{plan.earning}</div>
                  <div className="daily-earnings-hint">${plan.dailyIncome}/day</div>
                  <button className={`plan-button ${index === 5 ? 'plan-button-featured' : ''}`} onClick={() => openModal('deposit', String(plan.deposit))} disabled={!account}>{account ? 'Choose plan' : 'Sign in first'} <Icon name="arrow" size={14} /></button>
                </article>
              ))}
            </div>
            <div className="notice-bar"><span className="notice-icon"><Icon name="shield" size={16} /></span><p><strong>Real transactions:</strong> All deposits and withdrawals affect your actual account balance. Daily income starts tomorrow at 10:00 AM. Minimum withdrawal is $40.</p></div>
          </section>

          <section className="referral-layout" id="referrals">
            <div className="section-block rank-section">
              <div className="section-heading">
                <div><div className="eyebrow"><span className="eyebrow-line" /> REFERRAL PROGRAM</div><h2>Earn rewards by referring friends</h2><p className="section-subtitle">Invite friends to join and earn commissions on their first deposit plus weekly tier salaries.</p></div>
              </div>
              <div className="referral-banner" style={{background: 'linear-gradient(135deg, rgba(212, 175, 55, 0.1) 0%, rgba(212, 175, 55, 0.05) 100%)', border: '2px solid rgba(212, 175, 55, 0.4)'}}>
                <div className="referral-banner-content">
                  <div className="referral-banner-label"><Icon name="users" size={15} /> YOUR REFERRAL LINK</div>
                  <div className="referral-banner-title" style={{fontSize: '16px', marginBottom: '12px'}}>Share your link and earn 5% from each friend's first deposit</div>
                  <div style={{fontSize: '13px', color: '#aaa', marginBottom: '12px'}}>
                    {referralEarnings > 0
                      ? `You've earned $${referralEarnings} from referral bonuses (5% of first deposits)`
                      : 'Example: Friend deposits $2000 → You earn $100 (5%)'}
                  </div>
                  {account?.referralCode ? (
                    <div style={{background: 'rgba(0, 0, 0, 0.5)', padding: '12px', borderRadius: '6px', fontFamily: 'monospace', fontSize: '14px', fontWeight: '600', color: 'var(--gold)', marginBottom: '12px', wordBreak: 'break-all'}}>
                      {`${window.location.origin}/?ref=${account.referralCode}`}
                    </div>
                  ) : (
                    <p style={{color: '#aaa', fontSize: '13px', marginBottom: '12px'}}>Generate your referral code to start earning...</p>
                  )}
                </div>
                <button
                  className="copy-button referral-code-example"
                  style={{cursor: 'pointer', padding: '8px 14px', background: 'var(--gold)', color: '#000', border: 'none', borderRadius: '4px', fontWeight: '600', fontSize: '12px'}}
                  onClick={async () => {
                    if (!account?.referralCode) {
                      try {
                        const result = await requestApi('/api/referrals/code');
                        setAccount({...account, referralCode: result.code});
                        setNotice(`Referral code created: ${result.code}`);
                      } catch (error) {
                        setNotice(`Error: ${error.message}`);
                      }
                    } else {
                      const link = `${window.location.origin}/?ref=${account.referralCode}`;
                      navigator.clipboard.writeText(link).then(() => {
                        setNotice('Referral link copied to clipboard!');
                      }).catch(() => {
                        setNotice('Could not copy link. Select and copy manually.');
                      });
                    }
                  }}
                >
                  <Icon name="copy" size={14} style={{marginRight: '6px'}} />{account?.referralCode ? 'Copy link' : 'Generate code'}
                </button>
              </div>
              {!referralStatsLoading && referralStats && (
                <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '16px', marginBottom: '30px'}}>
                  <article style={{padding: '16px', background: 'rgba(212, 175, 55, 0.1)', borderRadius: '6px', borderLeft: '3px solid var(--gold)'}}>
                    <span style={{fontSize: '11px', color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.5px'}}>Your tier</span>
                    <div style={{fontSize: '20px', fontWeight: '700', color: 'var(--gold)', marginTop: '6px'}}>
                      {referralStats.tier || 'Unranked'}
                    </div>
                  </article>
                  <article style={{padding: '16px', background: 'rgba(212, 175, 55, 0.1)', borderRadius: '6px', borderLeft: '3px solid var(--gold)'}}>
                    <span style={{fontSize: '11px', color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.5px'}}>Direct referrals</span>
                    <div style={{fontSize: '20px', fontWeight: '700', color: 'var(--gold)', marginTop: '6px'}}>
                      {typeof referralStats.directReferrals === 'number' ? referralStats.directReferrals : 0}
                    </div>
                  </article>
                  <article style={{padding: '16px', background: 'rgba(212, 175, 55, 0.1)', borderRadius: '6px', borderLeft: '3px solid var(--gold)'}}>
                    <span style={{fontSize: '11px', color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.5px'}}>Commission rate</span>
                    <div style={{fontSize: '20px', fontWeight: '700', color: 'var(--gold)', marginTop: '6px'}}>
                      {typeof referralStats.commissionRate === 'number' ? `${(referralStats.commissionRate * 100).toFixed(0)}%` : '0%'}
                    </div>
                  </article>
                  <article style={{padding: '16px', background: 'rgba(212, 175, 55, 0.1)', borderRadius: '6px', borderLeft: '3px solid var(--gold)'}}>
                    <span style={{fontSize: '11px', color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.5px'}}>Total earned</span>
                    <div style={{fontSize: '20px', fontWeight: '700', color: 'var(--gold)', marginTop: '6px'}}>
                      ${typeof referralStats.totalEarnings === 'number' ? referralStats.totalEarnings.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2}) : '0.00'}
                    </div>
                  </article>
                </div>
              )}

              {/* ✅ SHOW REFERRED MEMBERS LIST */}
              {account && (
                <ReferredMembersList />
              )}

              <div className="rank-table-wrap">
                <table className="rank-table">
                  <thead><tr><th>RANK</th><th>DIRECT REFERRALS</th><th>TEAM TOTAL</th><th>REWARD</th><th>WEEKLY SALARY</th></tr></thead>
                  <tbody>{ranks.map((rank, index) => (
                    <tr key={rank.name} style={{background: referralStats?.tier === rank.name ? 'rgba(212, 175, 55, 0.1)' : 'transparent'}}>
                      <td><span className="rank-number">{String(index + 1).padStart(2, '0')}</span><strong>{rank.name}</strong></td>
                      <td>{rank.direct} <span className="table-muted">direct</span></td>
                      <td>{rank.team === null ? <span className="table-dash">—</span> : rank.team}</td>
                      <td className="reward-cell">{rank.reward}{rank.name === 'Star 8' && <span className="reward-value"> · $27,000 value</span>}{rank.name === 'Crown Leader' && <span className="reward-value"> · $46,000 value</span>}{rank.name === 'Star 7' && <span className="reward-value"> · $80,000 house</span>}</td>
                      <td className="salary-cell" style={{color: 'var(--gold)', fontWeight: '600'}}>{rank.weeklySalary ? rank.weeklySalary : '—'}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
              <p className="team-note">Your current tier is highlighted above. Qualify for higher tiers by recruiting more direct referrals or building your team total.</p>
            </div>

            <aside className={`bonus-card ${!isPrimeHourActive ? 'prime-hour-card inactive' : 'prime-hour-card'}`} id="rewards">
              <div className="bonus-top"><span className="bonus-icon"><Icon name="clock" size={19} /></span><span className={`prime-hour-status ${isPrimeHourActive ? 'active' : 'inactive'}`}><span className="prime-hour-status-dot" /> {isPrimeHourActive ? 'ACTIVE NOW' : 'INACTIVE'}</span></div>
              <div className="bonus-eyebrow">TIME-LIMITED WINDOW</div>
              <h3>Prime hour<span>.</span></h3>
              <div className="bonus-time">3:45 <span>—</span> 4:15 <small>AM</small></div>
              <p className="bonus-description">{isPrimeHourActive ? 'Prime hour is currently active. Deposits made now are eligible for this bonus.' : 'Prime hour is only active from 3:45 AM to 4:15 AM. Please return during this window to deposit.'}</p>
              {isPrimeHourActive && (
                <>
                  <div className="bonus-details">
                    <div><span>Minimum deposit</span><strong>$50</strong></div>
                    <div><span>Stated reward</span><strong className="green-text">$5</strong></div>
                    <div><span>Withdrawal minimum</span><strong>$50</strong></div>
                  </div>
                  <div className="bonus-qualification"><span className="qualification-icon"><Icon name="check" size={13} /></span><span>You should have traded in Ascend for at least 3 days and invite at least 1 person who has invested in Ascend.</span></div>
                  <button className="bonus-button" onClick={() => openModal('deposit', '50')} disabled={!account}>{account ? 'Make a Prime hour deposit' : 'Sign in first'} <Icon name="arrow" size={15} /></button>
                </>
              )}
            </aside>
          </section>

          {account && (
            <section className="weekly-salary-section" style={{marginTop: '40px', padding: '20px', background: 'rgba(212, 175, 55, 0.05)', borderRadius: '8px', border: '2px solid rgba(212, 175, 55, 0.2)'}}>
              <div className="section-heading">
                <div>
                  <div className="eyebrow"><span className="eyebrow-line" /> TIER BENEFITS</div>
                  <h2>Weekly tier salary</h2>
                  <p className="section-subtitle">Automatic weekly salary based on your current tier. Star 2 and above earn weekly.</p>
                </div>
              </div>

              {weeklyLoading ? (
                <p style={{textAlign: 'center', color: 'var(--text-light)'}}>Loading salary information...</p>
              ) : weeklyData ? (
                <>
                  <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px', marginBottom: '20px'}}>
                    <article style={{padding: '16px', background: 'rgba(0, 0, 0, 0.3)', borderRadius: '6px', borderLeft: '3px solid var(--gold)'}}>
                      <span style={{fontSize: '12px', color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.5px'}}>Current tier</span>
                      <div style={{fontSize: '24px', fontWeight: '700', color: 'var(--gold)', marginTop: '4px'}}>
                        {weeklyData.tier ? weeklyData.tier : 'Not qualified'}
                      </div>
                      <span style={{fontSize: '12px', color: '#666', marginTop: '8px', display: 'block'}}>
                        Direct: {typeof weeklyData.directCount === 'number' ? weeklyData.directCount : 0} · Team: {typeof weeklyData.teamTotal === 'number' ? weeklyData.teamTotal : 0}
                      </span>
                    </article>
                    <article style={{padding: '16px', background: 'rgba(0, 0, 0, 0.3)', borderRadius: '6px', borderLeft: '3px solid var(--gold)'}}>
                      <span style={{fontSize: '12px', color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.5px'}}>Weekly salary</span>
                      <div style={{fontSize: '24px', fontWeight: '700', color: 'var(--gold)', marginTop: '4px'}}>
                        {typeof weeklyData.weeklySalary === 'number' && weeklyData.weeklySalary > 0
                          ? `$${weeklyData.weeklySalary.toLocaleString('en-US')}`
                          : 'None'}
                      </div>
                      <span style={{fontSize: '12px', color: '#666', marginTop: '8px', display: 'block'}}>Paid every Monday</span>
                    </article>
                    <article style={{padding: '16px', background: 'rgba(0, 0, 0, 0.3)', borderRadius: '6px', borderLeft: '3px solid var(--gold)'}}>
                      <span style={{fontSize: '12px', color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.5px'}}>Total earned</span>
                      <div style={{fontSize: '24px', fontWeight: '700', color: 'var(--gold)', marginTop: '4px'}}>
                        ${typeof weeklyData.totalEarned === 'number'
                          ? weeklyData.totalEarned.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})
                          : '0.00'}
                      </div>
                      <span style={{fontSize: '12px', color: '#666', marginTop: '8px', display: 'block'}}>All-time salaries</span>
                    </article>
                  </div>

                  {Array.isArray(weeklyData.recentPayments) && weeklyData.recentPayments.length > 0 && (
                    <div style={{marginTop: '20px'}}>
                      <h3 style={{fontSize: '16px', marginBottom: '12px', color: 'var(--text-light)'}}>Recent payments</h3>
                      <div style={{display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '300px', overflowY: 'auto'}}>
                        {weeklyData.recentPayments.map((payment, idx) => (
                          <div key={idx} style={{display: 'flex', justifyContent: 'space-between', padding: '10px', background: 'rgba(0, 0, 0, 0.4)', borderRadius: '4px', fontSize: '13px'}}>
                            <span>{String(payment.week || 'Week')}</span>
                            <span style={{color: 'var(--gold)', fontWeight: '600'}}>
                              +${typeof payment.amount === 'number'
                                ? payment.amount.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})
                                : '0.00'}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {!weeklyData.tier && (
                    <div style={{padding: '16px', background: 'rgba(212, 175, 55, 0.1)', borderRadius: '6px', border: '1px solid rgba(212, 175, 55, 0.3)', marginTop: '20px', color: '#aaa', fontSize: '13px'}}>
                      {weeklyData.message || 'You need to reach Star 2 tier (7 direct referrals or 13 team members) to earn weekly salary.'}
                    </div>
                  )}
                </>
              ) : (
                <p style={{textAlign: 'center', color: '#666', padding: '20px'}}>Unable to load salary information.</p>
              )}
            </section>
          )}

          <section className="bottom-notice">
            <span className="notice-icon"><Icon name="wallet" size={16} /></span>
            <div><strong>Live transaction processing</strong><p>All deposits and withdrawals are real and immediately affect your account balance. Withdrawals require minimum $40 and a valid wallet address. Earnings start the next day at 10:00 AM.</p></div>
            <button onClick={() => openModal('withdraw')} disabled={!account}>{account ? 'Request withdrawal' : 'Sign in first'} <Icon name="arrow" size={14} /></button>
          </section>

          <section className="activity-section" aria-live="polite">
            <div className="activity-heading"><div><div className="eyebrow"><span className="eyebrow-line" /> TRANSACTION HISTORY</div><h2>Recent activity</h2></div><span className="activity-counter">{demoActivity.length} {demoActivity.length === 1 ? 'transaction' : 'transactions'}</span></div>
            {demoActivity.length === 0
              ? <p className="activity-empty">Your deposits and withdrawals will appear here.</p>
              : <div className="activity-list">{demoActivity.map((entry) => <article className="activity-item" key={entry.id}><span className={`activity-type ${entry.type === 'Deposit' ? 'activity-deposit' : 'activity-withdraw'}`}>{entry.type}</span><strong>${entry.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong><span>{entry.createdAt}</span><span className={`activity-status ${entry.status === 'completed' ? 'status-completed' : 'status-pending'}`}>{entry.status.toUpperCase()}</span></article>)}</div>}
          </section>

          <footer className="page-footer"><span>© 2026 Ascend Capital</span><span><span className="footer-dot" /> Real transactions · Live account tracking</span></footer>
        </div>
      </main>

      {notice && !modal && <div className="toast" role="status">{notice}<button aria-label="Dismiss" onClick={() => setNotice('')}><Icon name="close" size={15} /></button></div>}
      {modal && (
        <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setModal(null); }}>
          <section className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
            <button className="modal-close" aria-label="Close dialog" onClick={() => setModal(null)}><Icon name="close" size={18} /></button>
            <div className="modal-icon"><Icon name={modal === 'withdraw' ? 'withdraw' : 'wallet'} size={20} /></div>
            <div className="eyebrow"><span className="eyebrow-line" /> REAL TRANSACTION</div>
            <h2 id="modal-title">{modal === 'withdraw' ? 'Request a withdrawal' : 'Make a deposit'}</h2>
            <p className="modal-subtitle">This will be processed immediately against your account balance.</p>
            <form onSubmit={submitShowcaseAction}>
              <label className="amount-label" htmlFor="showcase-amount">{modal === 'withdraw' ? 'Withdrawal amount' : 'Deposit amount'}</label>
              <div className="amount-input-wrap"><span>$</span><input id="showcase-amount" type="number" min={modal === 'withdraw' ? '40' : '1'} step="0.01" value={amount} onChange={(event) => { setAmount(event.target.value); setNotice(''); }} placeholder="0.00" required disabled={transactionLoading} /></div>
              {modal === 'withdraw' ? (
                <>
                  <label className="account-field showcase-field">Destination wallet address<input type="text" autoComplete="off" value={destination} onChange={(event) => { setDestination(event.target.value); setNotice(''); }} placeholder="Enter wallet address" required disabled={transactionLoading} /></label>
                  <div className="showcase-fee"><span>Estimated fee (16%)</span><strong>${(Number(amount || 0) * 0.16).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></div>
                </>
              ) : (
                <div className="deposit-wallet-card">
                  <span className="deposit-wallet-label"><Icon name="wallet" size={14} /> PRIME WALLET ADDRESS</span>
                  <code>{walletAddressError ? 'Address unavailable' : walletAddressLoading ? 'Loading wallet address…' : binanceWalletAddress ? maskAddress(binanceWalletAddress) : 'Not configured in Render'}</code>
                  {binanceWalletAddress
                    ? <button type="button" className="wallet-copy-button" onClick={copyBinanceWalletAddress}><Icon name={walletCopied ? 'check' : 'copy'} size={14} /> {walletCopied ? 'Copied' : 'Copy address'}</button>
                    : <span className="wallet-config-hint">{walletAddressError ? 'Could not load the Render wallet configuration.' : walletAddressLoading ? 'Loading wallet configuration…' : 'Set BINANCE_WALLET_ADDRESS in Render.'}</span>}
                  <p>Send funds to this address to complete your deposit.</p>
                </div>
              )}
              {notice && <div className="modal-message" role="status">{notice}</div>}
              <button className="button button-primary modal-submit" type="submit" disabled={transactionLoading}>{transactionLoading ? 'Processing…' : 'Continue'} <Icon name="arrow" size={15} /></button>
              <p className="modal-footnote"><Icon name="shield" size={13} /> This transaction is real and will affect your account</p>
            </form>
          </section>
        </div>
      )}
      {accountDialog && (
        <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setAccountDialog(false); }}>
          <section className="modal account-modal" role="dialog" aria-modal="true" aria-labelledby="account-modal-title">
            <button className="modal-close" aria-label="Close dialog" onClick={() => setAccountDialog(false)}><Icon name="close" size={18} /></button>
            <div className="modal-icon"><Icon name="users" size={20} /></div>
            <div className="eyebrow"><span className="eyebrow-line" /> MEMBER ACCOUNT</div>
            <h2 id="account-modal-title">
              {accountMode === 'admin-password' ? 'Change password' : accountMode === 'profile' ? 'Your profile' : accountMode === 'register' ? 'Create your account' : 'Sign in'}
            </h2>
            <p className="modal-subtitle">
              {accountMode === 'admin-password' ? 'Update your administrator account password.' : accountMode === 'profile' ? 'Update the profile name linked to your account.' : 'Create an account to manage your member profile and process transactions.'}
            </p>
            <form onSubmit={submitAccount}>
              {accountMode === 'admin-password' && (
                <>
                  <PasswordToggleInput
                    label="Current Password"
                    value={adminCurrentPassword}
                    onChange={setAdminCurrentPassword}
                    showPassword={showPassword}
                    onToggle={() => setShowPassword(!showPassword)}
                    autoComplete="current-password"
                    required
                  />
                  <PasswordToggleInput
                    label="New Password"
                    value={adminNewPassword}
                    onChange={setAdminNewPassword}
                    showPassword={showPassword}
                    onToggle={() => setShowPassword(!showPassword)}
                    autoComplete="new-password"
                    required
                  />
                  <PasswordToggleInput
                    label="Confirm New Password"
                    value={adminConfirmPassword}
                    onChange={setAdminConfirmPassword}
                    showPassword={showPassword}
                    onToggle={() => setShowPassword(!showPassword)}
                    autoComplete="new-password"
                    required
                  />
                  <span className="field-hint">Use at least 6 characters.</span>
                </>
              )}
              {accountMode !== 'login' && accountMode !== 'admin-password' && (
                <label className="account-field">Full name
                  <input type="text" autoComplete="name" minLength={2} maxLength={80} value={accountName} onChange={(event) => setAccountName(event.target.value)} required />
                </label>
              )}
              {accountMode === 'register' && (
                <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px'}}>
                  <label className="account-field">Phone number
                    <input type="tel" placeholder="+254 7XX XXX XXX" value={accountPhone} onChange={(event) => setAccountPhone(event.target.value)} />
                  </label>
                  <label className="account-field">PIN (6 digits)
                    <input type="text" inputMode="numeric" maxLength={6} placeholder="000000" value={accountPin} onChange={(event) => setAccountPin(event.target.value)} />
                  </label>
                </div>
              )}
              {accountMode !== 'profile' && accountMode !== 'admin-password' && (
                <label className="account-field">Email address
                  <input type="email" autoComplete="email" maxLength={254} value={accountEmail} onChange={(event) => setAccountEmail(event.target.value)} required />
                </label>
              )}
              {accountMode === 'profile' && (
                <label className="account-field">Email address
                  <input type="email" value={accountEmail} readOnly />
                </label>
              )}
              {accountMode !== 'profile' && accountMode !== 'admin-password' && (
                <>
                  <PasswordToggleInput
                    label="Password"
                    value={accountPassword}
                    onChange={setAccountPassword}
                    showPassword={showAccountPassword}
                    onToggle={() => setShowAccountPassword(!showAccountPassword)}
                    autoComplete={accountMode === 'register' ? 'new-password' : 'current-password'}
                    required
                  />
                  <span className="field-hint">Use at least 6 characters.</span>
                </>
              )}
              {accountError && <div className="modal-message" role="alert">{accountError}</div>}
              {accountMessage && <div className="modal-message modal-success" role="status">{accountMessage}</div>}
              <button className="button button-primary modal-submit" type="submit">
                {accountMode === 'admin-password' ? 'Change password' : accountMode === 'profile' ? 'Save profile' : accountMode === 'register' ? 'Create account' : 'Sign in'}
                <Icon name="arrow" size={15} />
              </button>
              {accountMode === 'profile' ? (
                <button className="account-switch logout-button" type="button" onClick={logout}>Sign out</button>
              ) : accountMode === 'admin-password' ? (
                <button className="account-switch" type="button" onClick={() => setAccountDialog(false)}>Cancel</button>
              ) : (
                <button className="account-switch" type="button" onClick={() => { setAccountMode(accountMode === 'login' ? 'register' : 'login'); setAccountError(''); setAccountMessage(''); }}>{accountMode === 'login' ? 'New here? Create an account' : 'Already registered? Sign in'}</button>
              )}
              <p className="modal-footnote"><Icon name="shield" size={13} /> Secure authentication · Real transaction processing</p>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}

export default App;
