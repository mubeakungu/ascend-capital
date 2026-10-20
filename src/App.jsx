import React, { useCallback, useEffect, useMemo, useState } from 'react';

const CURRENCY = 'USD';

const money = (n) =>
  `${CURRENCY} ${Number(n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const when = (iso) => {
  if (!iso) return '—';
  const date = new Date(iso);
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
  return isMobile
    ? date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : date.toLocaleString();
};

async function api(path, { method = 'GET', body } = {}) {
  const init = { method, credentials: 'same-origin' };
  if (method !== 'GET') {
    init.headers = { 'Content-Type': 'application/json' };
    init.body = JSON.stringify(body ?? {});
  }
  const res = await fetch(`/api${path}`, init);
  const data = res.status === 204 ? {} : await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || 'Request failed.');
    err.status = res.status;
    throw err;
  }
  return data;
}

function useLoad(loader, deps) {
  const [state, setState] = useState({ data: null, error: '', loading: true });
  const run = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: '' }));
    try {
      setState({ data: await loader(), error: '', loading: false });
    } catch (e) {
      setState({ data: null, error: e.message, loading: false });
    }
  }, deps);
  useEffect(() => { run(); }, [run]);
  return [state, run];
}

function Notice({ notice }) {
  if (!notice) return null;
  return <p className={`notice ${notice.bad ? 'bad' : ''}`}>{notice.text}</p>;
}

function StatCard({ icon, label, value, subtext, color }) {
  return (
    <div className={`stat-card ${color || ''}`}>
      {icon && <span className="stat-icon">{icon}</span>}
      <div>
        <p className="stat-label">{label}</p>
        <p className="stat-value">{value}</p>
        {subtext && <p className="stat-sub">{subtext}</p>}
      </div>
    </div>
  );
}

// ============================================================================
// SIGN IN / AUTH
// ============================================================================

function SignIn({ onSignIn }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [logo, setLogo] = useState(null);

  useEffect(() => {
    fetch('/api/public/logo')
      .then((r) => r.ok && r.blob())
      .then((blob) => blob && setLogo(URL.createObjectURL(blob)))
      .catch(() => {});
  }, []);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const data = await api('/auth/login', {
        method: 'POST',
        body: { email, password },
      });
      onSignIn(data.account);
    } catch (err) {
      setError(err.message);
    }
    setBusy(false);
  }

  return (
    <div className="login-container">
      <form className="login-card" onSubmit={submit}>
        {logo && <img src={logo} alt="Logo" className="logo" />}
        <h1>Ascend Capital</h1>
        <p className="subtitle">Trading Platform</p>
        <h2>Sign In</h2>

        <label>Email</label>
        <input
          type="email"
          autoComplete="username"
          placeholder="your@email.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />

        <label>Password</label>
        <input
          type="password"
          autoComplete="current-password"
          placeholder="••••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />

        {error && <p className="error">{error}</p>}
        <button className="btn btn-primary" disabled={busy} type="submit">
          {busy ? 'Signing in…' : 'Sign In'}
        </button>
      </form>
    </div>
  );
}

// ============================================================================
// DASHBOARD MAIN
// ============================================================================

function Dashboard() {
  const [account, setAccount] = useState(null);
  const [{ data, error, loading }, reload] = useLoad(async () => {
    const acc = await api('/account');
    const activity = await api('/account/activity');
    return { account: acc, activity };
  }, []);

  const [notice, setNotice] = useState(null);
  const [canClaimTrade, setCanClaimTrade] = useState(false);
  const [claimTradeLoading, setClaimTradeLoading] = useState(false);
  const [tradeClaimMessage, setTradeClaimMessage] = useState('');

  useEffect(() => {
    if (data?.account) {
      setAccount(data.account);
    }
  }, [data]);

  async function fetchCanClaimTrade() {
    try {
      const result = await api('/trading/can-claim-today');
      setCanClaimTrade(result.canClaimToday);
      setTradeClaimMessage(
        result.alreadyClaimedToday
          ? 'Already claimed today'
          : result.hasActiveDeposit
          ? `Available: ${money(result.dailyProfitAmount)}`
          : 'No active deposit'
      );
    } catch (err) {
      setTradeClaimMessage('Error checking status');
    }
  }

  async function claimDailyTrade() {
    setClaimTradeLoading(true);
    try {
      const result = await api('/trading/claim-daily-trade', { method: 'POST' });
      setNotice({ text: `Trade claimed! Profit: ${money(result.profitAmount)}` });
      setCanClaimTrade(false);
      setTradeClaimMessage('Already claimed today');
      reload();
    } catch (err) {
      setNotice({ text: err.message, bad: true });
    }
    setClaimTradeLoading(false);
  }

  useEffect(() => {
    fetchCanClaimTrade();
  }, []);

  async function signOut() {
    try {
      await api('/auth/logout', { method: 'POST' });
      setAccount(null);
    } catch (err) {
      console.error('Logout error:', err);
    }
  }

  if (loading && !data) {
    return <p className="loading">Loading…</p>;
  }

  if (error) {
    return <p className="error">{error}</p>;
  }

  const activity = data?.activity || {};
  const trades = activity.trades || [];
  const deposits = activity.deposits || [];

  return (
    <div className="dashboard">
      <header className="top-bar">
        <div className="brand">
          <h1><b>ascend</b> capital</h1>
        </div>
        <div className="user-section">
          <span className="user-email">{account?.email}</span>
          <button className="btn btn-ghost" onClick={signOut}>
            Sign out
          </button>
        </div>
      </header>

      <main className="main-content">
        <Notice notice={notice} />

        {/* Balance & Stats */}
        <section className="stats-section">
          <h2>Account Overview</h2>
          <div className="stats-grid">
            <StatCard
              label="Account Balance"
              value={money(account?.balance || 0)}
              color="primary"
            />
            <StatCard
              label="Total Deposits"
              value={money(activity.totalDeposits || 0)}
              color="accent"
            />
            <StatCard
              label="Referral Earnings"
              value={money(activity.referralEarnings || 0)}
              color="success"
            />
            <StatCard
              label="Total Traded"
              value={trades.length}
              color="info"
            />
          </div>
        </section>

        {/* Daily Trade Claim */}
        <section className="trade-section">
          <h2>Daily Auto Trade</h2>
          <div className="trade-card">
            <div className="trade-info">
              <h3>Claim Your Trade Today</h3>
              <p className="trade-status">{tradeClaimMessage}</p>
            </div>
            <button
              className={`btn ${canClaimTrade ? 'btn-primary' : 'btn-disabled'}`}
              onClick={claimDailyTrade}
              disabled={!canClaimTrade || claimTradeLoading}
            >
              {claimTradeLoading ? 'Processing…' : 'Claim Trade'}
            </button>
          </div>
        </section>

        {/* Trading Activity */}
        <section className="activity-section">
          <h2>Trading Activity</h2>
          {trades.length > 0 ? (
            <div className="scroll">
              <table className="table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Deposit</th>
                    <th>Profit</th>
                  </tr>
                </thead>
                <tbody>
                  {trades.map((t) => (
                    <tr key={t.id}>
                      <td>{when(t.profitDate)}</td>
                      <td className="num">{money(t.depositAmount)}</td>
                      <td className="num positive">+{money(t.profitAmount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="empty">No trades yet. Make a deposit to start trading.</p>
          )}
        </section>

        {/* Deposits */}
        <section className="deposits-section">
          <h2>Your Deposits</h2>
          {deposits.length > 0 ? (
            <div className="scroll">
              <table className="table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Amount</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {deposits.map((d) => (
                    <tr key={d.id}>
                      <td>{when(d.createdAt)}</td>
                      <td className="num">{money(d.amount)}</td>
                      <td>
                        <span className={`badge ${d.status}`}>{d.status}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="empty">No deposits yet. Contact support to make a deposit.</p>
          )}
        </section>
      </main>
    </div>
  );
}

// ============================================================================
// MAIN APP
// ============================================================================

export default function App() {
  const [account, setAccount] = useState(undefined);

  useEffect(() => {
    api('/account')
      .then((acc) => setAccount(acc))
      .catch(() => setAccount(null));
  }, []);

  if (account === undefined) {
    return <p className="loading">Loading…</p>;
  }

  if (!account) {
    return <SignIn onSignIn={setAccount} />;
  }

  return (
    <>
      <Dashboard />
      <style>{CSS}</style>
    </>
  );
}

const CSS = `
* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

:root {
  --bg: #0b100e;
  --card: #111815;
  --line: #1f2a24;
  --text: #e8efe9;
  --muted: #8a9a90;
  --accent: #b5ee6a;
  --bad: #ff8a7a;
  --good: #5bc0ff;
  --success: #90ee90;
  --warn: #f2c46d;
}

body {
  background: var(--bg);
  color: var(--text);
  font-family: 'DM Sans', system-ui, sans-serif;
  font-size: 14px;
  line-height: 1.45;
}

h1, h2, h3, h4, h5, h6 {
  font-family: Manrope, 'DM Sans', sans-serif;
  margin: 0;
}

h2 {
  font-size: 20px;
  margin-bottom: 16px;
}

h3 {
  font-size: 15px;
  margin-bottom: 8px;
}

a {
  color: var(--accent);
  text-decoration: none;
}

a:hover {
  text-decoration: underline;
}

/* Buttons */
.btn {
  background: var(--accent);
  color: var(--bg);
  border: 0;
  border-radius: 6px;
  padding: 10px 16px;
  font: 600 12px inherit;
  cursor: pointer;
  white-space: nowrap;
  min-height: 44px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.btn:hover:not(:disabled) {
  opacity: 0.9;
}

.btn:disabled {
  opacity: 0.5;
  cursor: default;
}

.btn-ghost {
  background: transparent;
  color: var(--text);
  border: 1px solid var(--line);
}

.btn-ghost:hover:not(:disabled) {
  background: var(--card);
}

.btn-primary {
  background: var(--accent);
}

.btn-disabled {
  background: var(--muted);
  cursor: not-allowed;
  opacity: 0.5;
}

.btn-danger {
  background: var(--bad);
}

/* Forms */
input, select, textarea {
  background: var(--card);
  border: 1px solid var(--line);
  color: var(--text);
  border-radius: 8px;
  padding: 12px;
  font: inherit;
  width: 100%;
  min-height: 44px;
}

input:focus, select:focus, textarea:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 2px rgba(181, 238, 106, 0.1);
}

label {
  display: block;
  margin: 12px 0 6px;
  color: var(--muted);
  font-size: 12px;
  font-weight: 500;
}

/* Notices & Alerts */
.notice {
  background: #16221b;
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 12px;
  margin: 16px 0;
  font-size: 13px;
}

.notice.bad {
  background: #201513;
  border-color: #4a2a26;
  color: var(--bad);
}

.error {
  color: var(--bad);
  margin: 8px 0;
  font-size: 13px;
}

.loading {
  padding: 40px 20px;
  text-align: center;
  color: var(--muted);
}

.empty {
  padding: 20px;
  text-align: center;
  color: var(--muted);
  font-size: 13px;
}

/* Tables */
.scroll {
  overflow-x: auto;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--card);
  margin: 12px 0;
  -webkit-overflow-scrolling: touch;
}

.table {
  width: 100%;
  border-collapse: collapse;
  min-width: 500px;
}

.table th {
  text-align: left;
  color: var(--muted);
  font-weight: 600;
  font-size: 11px;
  padding: 12px;
  border-bottom: 1px solid var(--line);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.table td {
  padding: 12px;
  border-bottom: 1px solid var(--line);
  vertical-align: top;
  font-size: 13px;
}

.table tr:last-child td {
  border-bottom: 0;
}

.table .num {
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
  text-align: right;
}

.table .num.positive {
  color: var(--accent);
}

/* Badges */
.badge {
  display: inline-block;
  background: var(--line);
  color: var(--text);
  padding: 4px 10px;
  border-radius: 4px;
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
}

.badge.approved {
  background: #1a3a2e;
  color: var(--accent);
}

.badge.pending {
  background: #3a3a2a;
  color: var(--warn);
}

.badge.rejected {
  background: #3a2a20;
  color: var(--bad);
}

/* Layout */
.login-container {
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: 20px;
  background: var(--bg);
}

.login-card {
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 40px;
  width: 100%;
  max-width: 420px;
}

.login-card .logo {
  max-height: 50px;
  width: auto;
  object-fit: contain;
  margin-bottom: 20px;
}

.login-card h1 {
  font-size: 24px;
  margin-bottom: 4px;
}

.login-card h1 b {
  color: var(--accent);
}

.login-card .subtitle {
  color: var(--muted);
  font-size: 12px;
  margin-bottom: 32px;
  text-transform: uppercase;
  letter-spacing: 0.1em;
}

.login-card h2 {
  font-size: 18px;
  margin: 24px 0 16px;
}

.login-card .btn {
  width: 100%;
  margin-top: 16px;
}

.dashboard {
  min-height: 100vh;
  background: var(--bg);
}

.top-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding: 12px 20px;
  border-bottom: 1px solid var(--line);
  background: var(--card);
  flex-wrap: wrap;
}

.brand h1 {
  font-size: 18px;
  font-weight: 600;
}

.brand h1 b {
  color: var(--accent);
}

.user-section {
  display: flex;
  align-items: center;
  gap: 12px;
}

.user-email {
  color: var(--muted);
  font-size: 12px;
}

.main-content {
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px;
}

section {
  margin-bottom: 32px;
}

/* Stats */
.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 12px;
}

.stat-card {
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: 10px;
  padding: 16px;
  display: flex;
  gap: 12px;
}

.stat-card.primary {
  border-color: var(--accent);
}

.stat-card.accent {
  border-color: var(--good);
}

.stat-card.success {
  border-color: var(--success);
}

.stat-card.info {
  border-color: var(--line);
}

.stat-icon {
  font-size: 24px;
  flex-shrink: 0;
}

.stat-label {
  color: var(--muted);
  font-size: 11px;
  text-transform: uppercase;
  margin: 0 0 4px;
}

.stat-value {
  font: 700 18px Manrope, sans-serif;
  margin: 0;
  color: var(--accent);
}

.stat-sub {
  color: var(--muted);
  font-size: 11px;
  margin: 4px 0 0;
}

/* Trade Card */
.trade-card {
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: 10px;
  padding: 20px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
}

.trade-info h3 {
  font-size: 16px;
  margin-bottom: 6px;
}

.trade-status {
  color: var(--muted);
  font-size: 12px;
  margin: 0;
}

.trade-status.available {
  color: var(--accent);
  font-weight: 600;
}

.trade-status.claimed {
  color: var(--muted);
}

/* Responsive */
@media (max-width: 768px) {
  h2 {
    font-size: 18px;
  }

  h3 {
    font-size: 14px;
  }

  .top-bar {
    gap: 12px;
    padding: 10px 12px;
  }

  .brand h1 {
    font-size: 16px;
  }

  .user-email {
    font-size: 11px;
  }

  .main-content {
    padding: 12px;
  }

  .stats-grid {
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
    gap: 10px;
  }

  .stat-card {
    padding: 12px;
    flex-direction: column;
    gap: 8px;
  }

  .stat-value {
    font-size: 16px;
  }

  .stat-label {
    font-size: 10px;
  }

  .trade-card {
    flex-direction: column;
    align-items: stretch;
    gap: 12px;
  }

  .trade-card .btn {
    width: 100%;
  }

  .table {
    min-width: 100%;
  }

  input, select, textarea {
    padding: 12px;
    font-size: 16px;
  }

  .btn {
    padding: 12px;
    min-height: 48px;
  }

  .login-card {
    padding: 24px;
  }
}

@media (max-width: 480px) {
  h2 {
    font-size: 16px;
    margin-bottom: 12px;
  }

  h3 {
    font-size: 13px;
  }

  .top-bar {
    padding: 8px;
    gap: 8px;
  }

  .brand h1 {
    font-size: 14px;
  }

  .user-section {
    width: 100%;
    gap: 8px;
  }

  .user-email {
    flex: 1;
  }

  .main-content {
    padding: 8px;
  }

  section {
    margin-bottom: 24px;
  }

  .stats-grid {
    grid-template-columns: 1fr;
    gap: 8px;
  }

  .stat-card {
    padding: 12px;
  }

  .stat-value {
    font-size: 14px;
  }

  .trade-card {
    padding: 16px;
  }

  .trade-card .btn {
    min-height: 40px;
  }

  .login-card {
    padding: 16px;
    max-width: 100%;
  }

  .login-card h1 {
    font-size: 20px;
  }

  .login-card .subtitle {
    margin-bottom: 24px;
  }

  input, select, textarea {
    padding: 10px;
    font-size: 16px;
    min-height: 40px;
  }

  .table th,
  .table td {
    padding: 8px;
    font-size: 11px;
  }

  .badge {
    padding: 3px 6px;
    font-size: 9px;
  }
}
`;
