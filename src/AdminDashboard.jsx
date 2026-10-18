import React, { useCallback, useEffect, useMemo, useState } from 'react';

const CURRENCY = 'USD';

const money = (n) =>
  `${CURRENCY} ${Number(n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const when = (iso) => (iso ? new Date(iso).toLocaleString() : '—');

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
  return <p className={`ad-notice ${notice.bad ? 'bad' : ''}`}>{notice.text}</p>;
}

function Badge({ value }) {
  return <span className={`ad-badge ${value}`}>{value}</span>;
}

function StatCard({ label, value, subtext }) {
  return (
    <div className="ad-stat-card">
      <p className="ad-stat-label">{label}</p>
      <p className="ad-stat-value">{value}</p>
      {subtext && <p className="ad-stat-sub">{subtext}</p>}
    </div>
  );
}

function AskModal({ title, label, type = 'text', multiline, min = 0, confirmText = 'Confirm', danger, onSubmit, onClose }) {
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e) {
    e.preventDefault();
    const length = type === 'password' ? value.length : value.trim().length;
    if (length < min) return setError(`Enter at least ${min} characters.`);
    setBusy(true);
    try {
      await onSubmit(value);
      onClose();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <div className="ad-overlay" onClick={onClose}>
      <form className="ad-modal" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <h3>{title}</h3>
        <label>{label}</label>
        {multiline ? (
          <textarea rows={3} value={value} onChange={(e) => setValue(e.target.value)} autoFocus />
        ) : (
          <input type={type} value={value} autoComplete="new-password" onChange={(e) => setValue(e.target.value)} autoFocus />
        )}
        {error && <p className="ad-error">{error}</p>}
        <div className="ad-row end">
          <button type="button" className="ad-btn ghost" onClick={onClose}>Cancel</button>
          <button className={`ad-btn ${danger ? 'danger' : ''}`} disabled={busy}>{busy ? 'Working…' : confirmText}</button>
        </div>
      </form>
    </div>
  );
}

// ============================================================================
// DASHBOARD / ANALYTICS
// ============================================================================

function Dashboard() {
  const [{ data, error, loading }, reload] = useLoad(async () => {
    const [accounts, queue, ledger] = await Promise.all([
      api('/admin/accounts'),
      api('/admin/transactions?status=pending'),
      api('/admin/trading/ledger'),
    ]);
    return { accounts, queue, ledger };
  }, []);

  if (loading && !data) return <p className="ad-empty">Loading…</p>;
  if (error) return <p className="ad-error">{error}</p>;

  const acc = data?.accounts?.accounts || [];
  const txns = data?.queue?.transactions || [];
  const trades = data?.ledger?.ledger || [];

  const totalMembers = acc.length;
  const totalDeposits = acc.reduce((sum, a) => sum + a.balance, 0);
  const pendingDeposits = txns.filter(t => t.type === 'deposit').reduce((sum, t) => sum + t.amount, 0);
  const pendingWithdrawals = txns.filter(t => t.type === 'withdrawal').reduce((sum, t) => sum + t.amount, 0);
  const totalTrades = trades.length;
  const totalTradeProfit = trades.reduce((sum, t) => sum + t.profitAmount, 0);
  const activeDeposits = acc.reduce((sum, a) => sum + (a.pendingTransactions > 0 ? a.balance : 0), 0);

  return (
    <section>
      <h2>System Overview</h2>
      <button className="ad-btn ghost" onClick={reload} style={{ marginBottom: '16px' }}>Refresh</button>
      
      <div className="ad-grid">
        <StatCard label="Total Members" value={totalMembers} />
        <StatCard label="Active Accounts" value={acc.filter(a => a.status === 'active').length} />
        <StatCard label="Held Accounts" value={acc.filter(a => a.status === 'held').length} />
        <StatCard label="Total Deposits (All Time)" value={money(totalDeposits)} />
        <StatCard label="Active Deposits" value={money(activeDeposits)} />
        <StatCard label="Pending Deposits" value={money(pendingDeposits)} subtext={`${txns.filter(t => t.type === 'deposit').length} requests`} />
        <StatCard label="Pending Withdrawals" value={money(pendingWithdrawals)} subtext={`${txns.filter(t => t.type === 'withdrawal').length} requests`} />
        <StatCard label="Total Trades" value={totalTrades} />
        <StatCard label="Total Trading Profit" value={money(totalTradeProfit)} />
        <StatCard label="Pending Review" value={txns.length} subtext="deposits & withdrawals" />
      </div>
    </section>
  );
}

// ============================================================================
// REFERRALS MANAGEMENT
// ============================================================================

function ReferralsManagement() {
  const [searchId, setSearchId] = useState('');
  const [notice, setNotice] = useState(null);
  const [{ data, error, loading }, reload] = useLoad(
    () => searchId ? api(`/admin/referrals/${searchId}`) : Promise.resolve(null),
    [searchId]
  );

  const referrals = data ? [{
    accountId: data.account.id,
    accountName: data.account.name,
    accountEmail: data.account.email,
    tier: data.tier,
    directReferrals: data.directReferrals,
    teamTotal: data.teamTotal,
    commissionsEarned: data.commissions.length,
    totalEarnings: data.commissions.reduce((sum, c) => sum + c.commissionEarned, 0),
  }] : [];

  return (
    <section>
      <h2>Referral Management</h2>
      <div className="ad-row" style={{ marginBottom: '16px' }}>
        <input 
          placeholder="Search by member ID" 
          value={searchId} 
          onChange={(e) => setSearchId(e.target.value)}
          style={{ flex: 1, maxWidth: '300px' }}
        />
        <button className="ad-btn ghost" onClick={reload}>Search</button>
      </div>
      
      <Notice notice={notice} />
      {error && <p className="ad-error">{error}</p>}

      {searchId && loading ? (
        <p className="ad-empty">Loading…</p>
      ) : data ? (
        <div>
          <div className="ad-grid">
            <StatCard label="Direct Referrals" value={data.directReferrals} />
            <StatCard label="Team Total" value={data.teamTotal} />
            <StatCard label="Current Tier" value={data.tier || 'None'} />
            <StatCard label="Commissions Earned" value={data.commissions.length} />
            <StatCard label="Total Earnings" value={money(data.commissions.reduce((sum, c) => sum + c.commissionEarned, 0))} />
          </div>

          <h3>Referrals (Direct)</h3>
          <div className="ad-scroll">
            <table className="ad-table">
              <thead>
                <tr>
                  <th>Member Name</th>
                  <th>Email</th>
                  <th>Commission Rate</th>
                  <th>Earned</th>
                  <th>Transaction</th>
                </tr>
              </thead>
              <tbody>
                {data.commissions.map((c) => (
                  <tr key={c.id}>
                    <td>{c.referredName}</td>
                    <td>{c.referredEmail}</td>
                    <td>{(c.commissionRate * 100).toFixed(1)}%</td>
                    <td className="num">{money(c.commissionEarned)}</td>
                    <td>{c.transactionType} {money(c.transactionAmount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : searchId ? (
        <p className="ad-empty">Enter a member ID to view referral data</p>
      ) : (
        <p className="ad-empty">Enter a member ID to search</p>
      )}
    </section>
  );
}

// ============================================================================
// TRADING MANAGEMENT
// ============================================================================

function TradingManagement() {
  const [{ data, error, loading }, reload] = useLoad(() => api('/admin/trading/ledger'), []);
  const [ask, setAsk] = useState(null);
  const [notice, setNotice] = useState(null);

  if (loading && !data) return <p className="ad-empty">Loading…</p>;
  if (error) return <p className="ad-error">{error}</p>;

  const trades = data?.ledger || [];
  const totalProfit = trades.reduce((sum, t) => sum + t.profitAmount, 0);

  return (
    <section>
      <div className="ad-row">
        <h2>Trading & Profit Ledger</h2>
        <button className="ad-btn ghost" onClick={reload} style={{ marginLeft: 'auto' }}>Refresh</button>
        <button className="ad-btn" onClick={() => setAsk('apply')}>Apply Daily Profits</button>
      </div>

      <Notice notice={notice} />

      <div className="ad-grid">
        <StatCard label="Total Trades" value={trades.length} />
        <StatCard label="Total Profit Generated" value={money(totalProfit)} />
      </div>

      <h3>Recent Trading Activity</h3>
      <div className="ad-scroll">
        <table className="ad-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Member</th>
              <th>Deposit Amount</th>
              <th>Daily Profit</th>
              <th>Credited</th>
            </tr>
          </thead>
          <tbody>
            {trades.map((t) => (
              <tr key={t.id}>
                <td>{t.profitDate}</td>
                <td>
                  {t.accountName}
                  <small>{t.accountEmail}</small>
                </td>
                <td className="num">{money(t.depositAmount)}</td>
                <td className="num" style={{ color: 'var(--accent)' }}>+{money(t.profitAmount)}</td>
                <td>{when(t.creditedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!trades.length && <p className="ad-empty">No trading activity yet</p>}
      </div>

      {ask === 'apply' && (
        <AskModal
          title="Apply Daily Trading Profits"
          label="This will credit today's profits to all active deposits. Continue?"
          confirmText="Apply Profits"
          onClose={() => setAsk(null)}
          onSubmit={async () => {
            await api('/admin/trading/apply-profits', { method: 'POST' });
            setNotice({ text: 'Daily profits applied successfully' });
            reload();
          }}
        />
      )}
    </section>
  );
}

// ============================================================================
// BALANCE MANAGEMENT
// ============================================================================

function BalanceManagement() {
  const [memberId, setMemberId] = useState('');
  const [action, setAction] = useState('adjust');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (!memberId || !amount || !reason) {
      setNotice({ text: 'All fields required', bad: true });
      return;
    }

    setBusy(true);
    try {
      const amountNum = parseFloat(amount);
      if (isNaN(amountNum) || amountNum <= 0) {
        throw new Error('Invalid amount');
      }

      // Note: You'll need to add this endpoint to your app.js
      await api(`/admin/accounts/${memberId}/balance`, {
        method: 'POST',
        body: { action, amountCents: Math.round(amountNum * 100), reason }
      });

      setNotice({ text: `Balance ${action}ed by ${money(amountNum)}` });
      setMemberId('');
      setAmount('');
      setReason('');
    } catch (err) {
      setNotice({ text: err.message, bad: true });
    }
    setBusy(false);
  }

  return (
    <section>
      <h2>Adjust Member Balance</h2>
      <form className="ad-form" onSubmit={submit} style={{ maxWidth: '500px' }}>
        <label>Member ID</label>
        <input 
          type="text" 
          value={memberId} 
          onChange={(e) => setMemberId(e.target.value)}
          placeholder="Enter member ID"
          required
        />

        <label>Action</label>
        <select value={action} onChange={(e) => setAction(e.target.value)}>
          <option value="adjust">Adjust (add)</option>
          <option value="deduct">Deduct (subtract)</option>
          <option value="set">Set (replace balance)</option>
        </select>

        <label>Amount (USD)</label>
        <input 
          type="number" 
          step="0.01"
          value={amount} 
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0.00"
          required
        />

        <label>Reason</label>
        <textarea 
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Why are you adjusting this balance?"
          required
        />

        <Notice notice={notice} />
        <button className="ad-btn" disabled={busy}>
          {busy ? 'Processing…' : `${action.charAt(0).toUpperCase() + action.slice(1)} Balance`}
        </button>
      </form>
    </section>
  );
}

// ============================================================================
// MAIN ADMIN DASHBOARD
// ============================================================================

function Login({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const data = await api('/auth/login', { method: 'POST', body: { email, password } });
      onLogin(data.account);
    } catch (err) {
      setError(err.message);
    }
    setBusy(false);
  }

  return (
    <div className="ad-login">
      <form className="ad-card ad-form" onSubmit={submit}>
        <div className="ad-brand"><b>ascend</b> capital <span>Admin</span></div>
        <h2>Administrator sign in</h2>
        <label>Username</label>
        <input type="text" autoComplete="username" placeholder="admin" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <label>Password</label>
        <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        {error && <p className="ad-error">{error}</p>}
        <button className="ad-btn" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
    </div>
  );
}

export default function AdminDashboard() {
  const [account, setAccount] = useState(undefined);
  const [tab, setTab] = useState('dashboard');

  useEffect(() => {
    api('/auth/me').then((d) => setAccount(d.account)).catch(() => setAccount(null));
  }, []);

  async function signOut() {
    await api('/auth/logout', { method: 'POST' }).catch(() => {});
    setAccount(null);
  }

  const tabs = [
    ['dashboard', 'Dashboard'],
    ['referrals', 'Referrals'],
    ['trading', 'Trading'],
    ['balance', 'Balances'],
  ];

  let body;
  if (account === undefined) body = <p className="ad-empty">Loading…</p>;
  else if (!account) body = <Login onLogin={setAccount} />;
  else if (account.role !== 'admin') {
    body = (
      <div className="ad-login">
        <div className="ad-card ad-form">
          <h2>Administrator access required</h2>
          <p className="ad-muted">{account.email} is not an administrator account.</p>
          <button className="ad-btn" onClick={signOut}>Sign out</button>
        </div>
      </div>
    );
  } else {
    body = (
      <>
        <header className="ad-top">
          <div className="ad-brand"><b>ascend</b> capital <span>Admin</span></div>
          <nav>
            {tabs.map(([key, label]) => (
              <button key={key} className={tab === key ? 'on' : ''} onClick={() => setTab(key)}>{label}</button>
            ))}
          </nav>
          <div className="ad-who">{account.email}<button className="ad-btn ghost sm" onClick={signOut}>Sign out</button></div>
        </header>
        <main className="ad-main">
          {tab === 'dashboard' && <Dashboard />}
          {tab === 'referrals' && <ReferralsManagement />}
          {tab === 'trading' && <TradingManagement />}
          {tab === 'balance' && <BalanceManagement />}
        </main>
      </>
    );
  }

  return (
    <div className="ad">
      <style>{CSS}</style>
      {body}
    </div>
  );
}

const CSS = `
.ad{--bg:#0b100e;--card:#111815;--line:#1f2a24;--text:#e8efe9;--muted:#8a9a90;--accent:#b5ee6a;--bad:#ff8a7a;--warn:#f2c46d;min-height:100vh;background:var(--bg);color:var(--text);font:14px/1.45 'DM Sans',system-ui,sans-serif}
.ad *{box-sizing:border-box}
.ad h2,.ad h3{font-family:Manrope,'DM Sans',sans-serif;margin:0}
.ad h2{font-size:20px}.ad h3{font-size:15px;margin:18px 0 8px}
.ad-top{display:flex;align-items:center;gap:20px;flex-wrap:wrap;padding:12px 24px;border-bottom:1px solid var(--line);background:var(--card)}
.ad-brand{font:600 18px Manrope,sans-serif}.ad-brand b{color:var(--accent)}.ad-brand span{font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);margin-left:8px}
.ad-top nav{display:flex;gap:4px;flex:1;flex-wrap:wrap}
.ad-top nav button{background:none;border:0;color:var(--muted);padding:8px 12px;border-radius:8px;cursor:pointer;font:inherit}
.ad-top nav button.on{background:#1a241f;color:var(--text)}
.ad-who{display:flex;align-items:center;gap:10px;color:var(--muted)}
.ad-main{max-width:1200px;margin:0 auto;padding:24px}
.ad-row{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:14px}.ad-row.grow{flex:1;margin:0}.ad-row.end{justify-content:flex-end}
.ad input,.ad select,.ad textarea{background:#0e1512;border:1px solid var(--line);color:var(--text);border-radius:8px;padding:9px 11px;font:inherit;width:100%}
.ad-row input,.ad-row select{width:auto}
.ad label{display:block;margin:12px 0 5px;color:var(--muted);font-size:12px}
.ad-btn{background:var(--accent);color:#0b100e;border:0;border-radius:8px;padding:9px 16px;font:600 13px 'DM Sans',sans-serif;cursor:pointer}
.ad-btn:disabled{opacity:.5;cursor:default}.ad-btn.sm{padding:5px 10px;font-size:12px}
.ad-btn.ghost{background:transparent;color:var(--text);border:1px solid var(--line)}
.ad-btn.danger{background:var(--bad)}
.ad-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;margin:16px 0}
.ad-stat-card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:16px}
.ad-stat-label{color:var(--muted);font-size:12px;margin:0 0 4px}
.ad-stat-value{font:700 24px Manrope,sans-serif;margin:0;color:var(--accent)}
.ad-stat-sub{color:var(--muted);font-size:12px;margin:4px 0 0}
.ad-scroll{overflow-x:auto;border:1px solid var(--line);border-radius:12px;background:var(--card);margin:12px 0}
.ad-table{width:100%;border-collapse:collapse;min-width:640px}
.ad-table th{text-align:left;color:var(--muted);font-weight:500;font-size:12px;padding:10px 12px;border-bottom:1px solid var(--line)}
.ad-table td{padding:10px 12px;border-bottom:1px solid var(--line);vertical-align:top}
.ad-table tr:last-child td{border-bottom:0}
.ad-table small{display:block;color:var(--muted);margin-top:2px}
.ad-table .num{white-space:nowrap;font-variant-numeric:tabular-nums}
.ad-empty{color:var(--muted);padding:24px;text-align:center}
.ad-muted{color:var(--muted)}
.ad-error{color:var(--bad);margin:8px 0}
.ad-notice{background:#16221b;border:1px solid var(--line);border-radius:8px;padding:9px 12px;margin:10px 0}.ad-notice.bad{color:var(--bad);border-color:#4a2a26;background:#201513}
.ad-login{min-height:100vh;display:grid;place-items:center;padding:20px}
.ad-card{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:28px}
.ad-form{max-width:420px;width:100%}.ad-form .ad-btn{margin-top:16px;width:100%}.ad-form h2{margin:14px 0 4px}
.ad-overlay{position:fixed;inset:0;background:rgba(0,0,0,.6);display:flex;justify-content:flex-end;align-items:center;z-index:50}
.ad-modal{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:22px;width:min(440px,92vw);margin:auto}
.ad-modal h3{margin:0 0 6px}.ad-modal .ad-row{margin:14px 0 0}
`;
