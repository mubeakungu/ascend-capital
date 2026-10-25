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
// ACCOUNT MANAGEMENT
// ============================================================================

function AccountDetailModal({ accountId, onClose, onUpdate }) {
  const [{ data, loading, error }, reload] = useLoad(
    () => api(`/admin/accounts/${accountId}/activity`),
    [accountId]
  );
  const [editMode, setEditMode] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);

  useEffect(() => {
    if (data?.account) {
      setName(data.account.name);
      setEmail(data.account.email);
    }
  }, [data]);

  async function saveChanges(e) {
    e?.preventDefault();
    setBusy(true);
    setNotice(null);
    try {
      await api(`/admin/accounts/${accountId}`, {
        method: 'PATCH',
        body: { name, email },
      });
      setNotice({ text: 'Account updated' });
      setEditMode(false);
      reload();
      onUpdate();
    } catch (err) {
      setNotice({ text: err.message, bad: true });
    }
    setBusy(false);
  }

  if (loading) return <div className="ad-overlay" onClick={onClose}><div className="ad-modal" onClick={(e) => e.stopPropagation()}><p>Loading…</p></div></div>;
  if (error) return <div className="ad-overlay" onClick={onClose}><div className="ad-modal" onClick={(e) => e.stopPropagation()}><p className="ad-error">{error}</p></div></div>;

  const account = data?.account;
  if (!account) return null;

  return (
    <div className="ad-overlay" onClick={onClose}>
      <form className="ad-modal" onClick={(e) => e.stopPropagation()} onSubmit={saveChanges}>
        <h3>Account Details</h3>

        <div className="ad-detail-row">
          <span className="ad-detail-label">ID</span>
          <span className="ad-detail-value">{account.id}</span>
        </div>

        <div className="ad-detail-row">
          <span className="ad-detail-label">Status</span>
          <span className={`ad-detail-value ${account.status === 'held' ? 'bad' : ''}`}>
            <Badge value={account.status} />
            {account.holdReason && <small>{account.holdReason}</small>}
          </span>
        </div>

        <div className="ad-detail-row">
          <span className="ad-detail-label">Role</span>
          <span className="ad-detail-value"><Badge value={account.role} /></span>
        </div>

        <div className="ad-detail-row">
          <span className="ad-detail-label">Balance</span>
          <span className="ad-detail-value" style={{ color: 'var(--accent)' }}>{money(data?.summary?.balance || 0)}</span>
        </div>

        <div className="ad-detail-row">
          <span className="ad-detail-label">Created</span>
          <span className="ad-detail-value">{when(account.createdAt)}</span>
        </div>

        {editMode ? (
          <>
            <label>Name</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} required />
            <label>Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            <Notice notice={notice} />
            <div className="ad-row end" style={{ marginTop: '16px', gap: '8px' }}>
              <button type="button" className="ad-btn ghost" onClick={() => setEditMode(false)}>Cancel</button>
              <button className="ad-btn" disabled={busy}>{busy ? 'Saving…' : 'Save Changes'}</button>
            </div>
          </>
        ) : (
          <>
            <div className="ad-detail-row">
              <span className="ad-detail-label">Name</span>
              <span className="ad-detail-value">{account.name}</span>
            </div>
            <div className="ad-detail-row">
              <span className="ad-detail-label">Email</span>
              <span className="ad-detail-value">{account.email}</span>
            </div>
            <div className="ad-row end" style={{ marginTop: '16px', gap: '8px' }}>
              <button type="button" className="ad-btn ghost" onClick={onClose}>Close</button>
              <button type="button" className="ad-btn" onClick={() => setEditMode(true)}>Edit</button>
            </div>
          </>
        )}
      </form>
    </div>
  );
}

function AccountsManagement() {
  const [{ data, error, loading }, reload] = useLoad(
    () => api('/admin/accounts'),
    []
  );
  const [selectedId, setSelectedId] = useState(null);
  const [deleteId, setDeleteId] = useState(null);
  const [notice, setNotice] = useState(null);
  const [search, setSearch] = useState('');

  const allAccounts = data?.accounts || [];
  const accounts = allAccounts.filter(a =>
    a.name.toLowerCase().includes(search.toLowerCase()) ||
    a.email.toLowerCase().includes(search.toLowerCase()) ||
    a.id.toLowerCase().includes(search.toLowerCase())
  );

  async function deleteAccount() {
    if (!deleteId) return;
    try {
      await api(`/admin/accounts/${deleteId}`, {
        method: 'DELETE',
        body: { confirm: 'DELETE' },
      });
      setNotice({ text: 'Account deleted' });
      setDeleteId(null);
      reload();
    } catch (err) {
      setNotice({ text: err.message, bad: true });
    }
  }

  if (loading && !data) return <p className="ad-empty">Loading…</p>;
  if (error) return <p className="ad-error">{error}</p>;

  return (
    <section>
      <div className="ad-row" style={{ justifyContent: 'space-between' }}>
        <h2>Account Management</h2>
        <button className="ad-btn ghost" onClick={reload}>Refresh</button>
      </div>

      <div className="ad-row ad-search-row" style={{ marginBottom: '16px' }}>
        <input
          placeholder="Search by name, email, or ID"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ flex: 1 }}
        />
        {search && (
          <button className="ad-btn ghost" onClick={() => setSearch('')} style={{ flex: 0 }}>Clear</button>
        )}
      </div>

      <Notice notice={notice} />

      {/* Mobile Card View */}
      <div className="ad-accounts-mobile">
        {accounts.map((a) => (
          <div key={a.id} className="ad-account-card">
            <div className="ad-account-card-header">
              <span className="ad-account-name">{a.name}</span>
              <Badge value={a.status} />
            </div>
            <div className="ad-account-card-body">
              <div className="ad-account-card-row">
                <span className="label">Email:</span>
                <span className="value">{a.email}</span>
              </div>
              <div className="ad-account-card-row">
                <span className="label">Balance:</span>
                <span className="value">{money(a.balance)}</span>
              </div>
              <div className="ad-account-card-row">
                <span className="label">Role:</span>
                <Badge value={a.role} />
              </div>
              <div className="ad-account-card-row">
                <span className="label">Created:</span>
                <span className="value">{new Date(a.createdAt).toLocaleDateString()}</span>
              </div>
            </div>
            <div className="ad-account-card-actions">
              <button className="ad-btn sm" onClick={() => setSelectedId(a.id)} style={{ flex: 1 }}>View</button>
              {a.role !== 'admin' && (
                <button className="ad-btn ghost sm danger" onClick={() => setDeleteId(a.id)} style={{ flex: 1 }}>Delete</button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Desktop Table View */}
      <div className="ad-accounts-desktop">
        <div className="ad-scroll">
          <table className="ad-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Status</th>
                <th>Balance</th>
                <th>Role</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((a) => (
                <tr key={a.id}>
                  <td>{a.name}</td>
                  <td>{a.email}</td>
                  <td><Badge value={a.status} /></td>
                  <td className="num">{money(a.balance)}</td>
                  <td><Badge value={a.role} /></td>
                  <td>{new Date(a.createdAt).toLocaleDateString()}</td>
                  <td>
                    <div className="ad-actions" style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
                      <button className="ad-btn ghost sm" onClick={() => setSelectedId(a.id)} style={{ width: '100%' }}>View</button>
                      {a.role !== 'admin' && (
                        <button className="ad-btn ghost sm danger" onClick={() => setDeleteId(a.id)} style={{ width: '100%', marginTop: '4px' }}>Delete</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {selectedId && (
        <AccountDetailModal
          key={selectedId}
          accountId={selectedId}
          onClose={() => setSelectedId(null)}
          onUpdate={reload}
        />
      )}

      {deleteId && (
        <div className="ad-overlay" onClick={() => setDeleteId(null)}>
          <div className="ad-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Delete Account?</h3>
            <p style={{ color: 'var(--muted)' }}>This will permanently delete this account and all associated data.</p>
            <div className="ad-row end">
              <button className="ad-btn ghost" onClick={() => setDeleteId(null)}>Cancel</button>
              <button className="ad-btn danger" onClick={deleteAccount}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </section>
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
      <div className="ad-row" style={{ justifyContent: 'space-between', marginBottom: '16px' }}>
        <h2>System Overview</h2>
        <button className="ad-btn ghost" onClick={reload}>Refresh</button>
      </div>

      <div className="ad-grid">
        <StatCard label="Total Members" value={totalMembers} />
        <StatCard label="Active Accounts" value={acc.filter(a => a.status === 'active').length} />
        <StatCard label="Held Accounts" value={acc.filter(a => a.status === 'held').length} />
        <StatCard label="Total Deposits" value={money(totalDeposits)} />
        <StatCard label="Active Deposits" value={money(activeDeposits)} />
        <StatCard label="Pending Deposits" value={money(pendingDeposits)} subtext={`${txns.filter(t => t.type === 'deposit').length} req`} />
        <StatCard label="Pending Withdrawals" value={money(pendingWithdrawals)} subtext={`${txns.filter(t => t.type === 'withdrawal').length} req`} />
        <StatCard label="Total Trades" value={totalTrades} />
        <StatCard label="Trading Profit" value={money(totalTradeProfit)} />
        <StatCard label="Pending Review" value={txns.length} subtext="txns" />
      </div>
    </section>
  );
}

// ============================================================================
// REFERRALS MANAGEMENT
// ============================================================================

function ReferralsManagement() {
  const [{ data, error, loading }, reload] = useLoad(() => api('/admin/referrals-overview'), []);

  if (loading && !data) return <p className="ad-empty">Loading…</p>;
  if (error) return <p className="ad-error">{error}</p>;

  const referrals = data?.referrals || [];
  const totalDeposits = referrals.reduce((sum, r) => sum + (r.totalDeposits || 0), 0);

  return (
    <section>
      <div className="ad-row" style={{ justifyContent: 'space-between' }}>
        <h2>Referral Management</h2>
        <button className="ad-btn ghost" onClick={reload}>Refresh</button>
      </div>

      <div className="ad-grid">
        <StatCard label="Total Referral Relationships" value={referrals.length} />
        <StatCard label="Total Deposits from Referrals" value={money(totalDeposits)} />
      </div>

      <h3>Referral Relationships</h3>
      <div className="ad-scroll">
        <table className="ad-table">
          <thead>
            <tr>
              <th>Referrer</th>
              <th>Referrer Email</th>
              <th>Referred Member</th>
              <th>Referred Email</th>
              <th>Deposits</th>
              <th>Signup Date</th>
            </tr>
          </thead>
          <tbody>
            {referrals.map((r) => (
              <tr key={r.id}>
                <td>{r.referrerName}</td>
                <td>{r.referrerEmail}</td>
                <td>{r.referredName}</td>
                <td>{r.referredEmail}</td>
                <td className="num" style={{ color: 'var(--accent)' }}>{money(r.totalDeposits)}</td>
                <td>{new Date(r.signedUpAt).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {referrals.length === 0 && <p className="ad-empty">No referral relationships yet</p>}
      </div>
    </section>
  );
}

// ============================================================================
// TRADING MANAGEMENT
// ============================================================================

function TradingManagement() {
  const [{ data, error, loading }, reload] = useLoad(() => api('/admin/trading/ledger'), []);
  const [{ data: membersData }, reloadMembers] = useLoad(() => api('/admin/accounts'), []);
  const [notice, setNotice] = useState(null);
  const [showAddTrade, setShowAddTrade] = useState(false);
  const [tradeMemberId, setTradeMemberId] = useState('');
  const [tradeDate, setTradeDate] = useState('');
  const [profitAmount, setProfitAmount] = useState('');
  const [depositAmount, setDepositAmount] = useState('');
  const [tradeBusy, setTradeBusy] = useState(false);

  const members = membersData?.accounts || [];

  if (loading && !data) return <p className="ad-empty">Loading…</p>;
  if (error) return <p className="ad-error">{error}</p>;

  const trades = data?.ledger || [];
  const totalProfit = trades.reduce((sum, t) => sum + t.profitAmount, 0);

  async function applyProfits() {
    try {
      await api('/admin/trading/apply-profits', { method: 'POST' });
      setNotice({ text: 'Daily profits applied successfully' });
      reload();
    } catch (err) {
      setNotice({ text: err.message, bad: true });
    }
  }

  async function handleAddTrade(e) {
    e.preventDefault();
    if (!tradeMemberId || !tradeDate || !profitAmount || !depositAmount) {
      setNotice({ text: 'All fields required', bad: true });
      return;
    }
    setTradeBusy(true);
    try {
      await api('/admin/trading/add-trade', {
        method: 'POST',
        body: {
          accountId: tradeMemberId,
          profitDate: tradeDate,
          profitAmount: parseFloat(profitAmount),
          depositAmount: parseFloat(depositAmount),
        }
      });
      setNotice({ text: 'Trade added successfully' });
      setShowAddTrade(false);
      setTradeMemberId('');
      setTradeDate('');
      setProfitAmount('');
      setDepositAmount('');
      reload();
    } catch (err) {
      setNotice({ text: err.message, bad: true });
    }
    setTradeBusy(false);
  }

  return (
    <section>
      <div style={{ marginBottom: '16px' }}>
        <h2 style={{ marginBottom: '12px' }}>Trading & Profit Ledger</h2>
        <div className="ad-row">
          <button className="ad-btn ghost" onClick={reload} style={{ flex: 1 }}>Refresh</button>
          <button className="ad-btn" onClick={() => setShowAddTrade(true)} style={{ flex: 1 }}>Add Trade</button>
          <button className="ad-btn" onClick={applyProfits} style={{ flex: 1 }}>Apply Profits</button>
        </div>
      </div>

      <Notice notice={notice} />

      <div className="ad-grid">
        <StatCard label="Total Trades" value={trades.length} />
        <StatCard label="Total Profit" value={money(totalProfit)} />
      </div>

      <h3>Recent Activity</h3>
      <div className="ad-scroll">
        <table className="ad-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Member</th>
              <th>Deposit</th>
              <th>Profit</th>
            </tr>
          </thead>
          <tbody>
            {trades.map((t) => (
              <tr key={t.id}>
                <td>{t.profitDate}</td>
                <td>{t.accountName}</td>
                <td className="num">{money(t.depositAmount)}</td>
                <td className="num" style={{ color: 'var(--accent)' }}>+{money(t.profitAmount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!trades.length && <p className="ad-empty">No trading activity yet</p>}
      </div>

      {showAddTrade && (
        <div className="ad-overlay" onClick={() => setShowAddTrade(false)}>
          <form className="ad-modal" onClick={(e) => e.stopPropagation()} onSubmit={handleAddTrade}>
            <h3>Add Trade</h3>
            <label>Select Member</label>
            <select
              value={tradeMemberId}
              onChange={(e) => setTradeMemberId(e.target.value)}
              required
            >
              <option value="">-- Choose a member --</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} ({m.email})
                </option>
              ))}
            </select>
            <label>Trade Date</label>
            <input
              type="date"
              value={tradeDate}
              onChange={(e) => setTradeDate(e.target.value)}
              required
            />
            <label>Deposit Amount (USD)</label>
            <input
              type="number"
              step="0.01"
              value={depositAmount}
              onChange={(e) => setDepositAmount(e.target.value)}
              placeholder="0.00"
              required
            />
            <label>Profit Amount (USD)</label>
            <input
              type="number"
              step="0.01"
              value={profitAmount}
              onChange={(e) => setProfitAmount(e.target.value)}
              placeholder="0.00"
              required
            />
            <Notice notice={notice} />
            <div className="ad-row end" style={{ marginTop: '16px' }}>
              <button type="button" className="ad-btn ghost" onClick={() => setShowAddTrade(false)}>Cancel</button>
              <button className="ad-btn" disabled={tradeBusy}>{tradeBusy ? 'Adding…' : 'Add Trade'}</button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}

// ============================================================================
// BALANCE MANAGEMENT - ✅ FIXED - CAPTURES SERVER RESPONSE
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

      // ✅ FIXED: Capture the response from server
      const response = await api(`/admin/accounts/${memberId}/balance`, {
        method: 'POST',
        body: { action, amountCents: Math.round(amountNum * 100), reason }
      });

      // ✅ Extract previousBalance and newBalance from response
      const prevBalance = response.previousBalance || 0;
      const newBalance = response.newBalance || 0;
      const change = newBalance - prevBalance;
      const changeSign = change >= 0 ? '+' : '';

      // ✅ Display before/after balance
      setNotice({
        text: `✓ Balance updated: ${money(prevBalance)} → ${money(newBalance)} (${changeSign}${money(change)})`
      });
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
      <form className="ad-form" onSubmit={submit}>
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
        <button className="ad-btn" disabled={busy} style={{ width: '100%' }}>
          {busy ? 'Processing…' : `${action.charAt(0).toUpperCase() + action.slice(1)} Balance`}
        </button>
      </form>
    </section>
  );
}

// ============================================================================
// TRANSACTION APPROVAL
// ============================================================================

function TransactionApproval() {
  const [{ data, error, loading }, reload] = useLoad(
    () => api('/admin/transactions?status=pending'),
    []
  );
  const [notice, setNotice] = useState(null);
  const [actionId, setActionId] = useState(null);
  const [actionType, setActionType] = useState(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const transactions = data?.transactions || [];

  async function handleAction() {
    if (!actionId || !actionType) return;
    setBusy(true);
    try {
      await api(`/admin/transactions/${actionId}/${actionType}`, {
        method: 'POST',
        body: { note: actionType === 'reject' ? reason : undefined },
      });
      setNotice({ text: `Transaction ${actionType}ed successfully` });
      setActionId(null);
      setActionType(null);
      setReason('');
      reload();
    } catch (err) {
      setNotice({ text: err.message, bad: true });
    }
    setBusy(false);
  }

  if (loading && !data) return <p className="ad-empty">Loading…</p>;
  if (error) return <p className="ad-error">{error}</p>;

  const deposits = transactions.filter(t => t.type === 'deposit');
  const withdrawals = transactions.filter(t => t.type === 'withdrawal');

  return (
    <section>
      <div className="ad-row" style={{ justifyContent: 'space-between' }}>
        <h2>Transaction Approvals</h2>
        <button className="ad-btn ghost" onClick={reload}>Refresh</button>
      </div>

      <Notice notice={notice} />

      <div className="ad-grid">
        <StatCard label="Pending Deposits" value={deposits.length} subtext={`${money(deposits.reduce((sum, t) => sum + t.amount, 0))}`} />
        <StatCard label="Pending Withdrawals" value={withdrawals.length} subtext={`${money(withdrawals.reduce((sum, t) => sum + t.amount, 0))}`} />
      </div>

      {deposits.length > 0 && (
        <>
          <h3>Pending Deposits</h3>
          <div className="ad-scroll">
            <table className="ad-table">
              <thead>
                <tr>
                  <th>Member</th>
                  <th>Amount</th>
                  <th>Ref</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {deposits.map((t) => (
                  <tr key={t.id}>
                    <td>{t.accountName}</td>
                    <td className="num" style={{ color: 'var(--accent)' }}>+{money(t.amount)}</td>
                    <td><code style={{ fontSize: '10px', color: 'var(--muted)', wordBreak: 'break-all' }}>{t.reference || '—'}</code></td>
                    <td>
                      <div className="ad-actions-compact">
                        <button className="ad-btn ghost xs" onClick={() => { setActionId(t.id); setActionType('approve'); }}>✓</button>
                        <button className="ad-btn ghost xs danger" onClick={() => { setActionId(t.id); setActionType('reject'); }}>✕</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {withdrawals.length > 0 && (
        <>
          <h3>Pending Withdrawals</h3>
          <div className="ad-scroll">
            <table className="ad-table">
              <thead>
                <tr>
                  <th>Member</th>
                  <th>Amount</th>
                  <th>Dest</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {withdrawals.map((t) => (
                  <tr key={t.id}>
                    <td>{t.accountName}</td>
                    <td className="num" style={{ color: 'var(--bad)' }}>−{money(t.amount)}</td>
                    <td><code style={{ fontSize: '10px', color: 'var(--muted)', wordBreak: 'break-all' }}>{t.destination || '—'}</code></td>
                    <td>
                      <div className="ad-actions-compact">
                        <button className="ad-btn ghost xs" onClick={() => { setActionId(t.id); setActionType('approve'); }}>✓</button>
                        <button className="ad-btn ghost xs danger" onClick={() => { setActionId(t.id); setActionType('reject'); }}>✕</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {transactions.length === 0 && (
        <p className="ad-empty">No pending transactions</p>
      )}

      {actionId && (
        <div className="ad-overlay" onClick={() => { setActionId(null); setActionType(null); setReason(''); }}>
          <form className="ad-modal" onClick={(e) => e.stopPropagation()} onSubmit={(e) => { e.preventDefault(); handleAction(); }}>
            <h3>{actionType === 'approve' ? 'Approve Transaction' : 'Reject Transaction'}</h3>

            {actionType === 'reject' && (
              <>
                <label>Reason for rejection</label>
                <textarea
                  rows={3}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Explain why..."
                  required
                />
              </>
            )}

            <div className="ad-row end" style={{ marginTop: '16px' }}>
              <button type="button" className="ad-btn ghost" onClick={() => { setActionId(null); setActionType(null); setReason(''); }}>Cancel</button>
              <button className={`ad-btn ${actionType === 'reject' ? 'danger' : ''}`} disabled={busy}>
                {busy ? 'Processing…' : actionType === 'approve' ? 'Approve' : 'Reject'}
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}

// ============================================================================
// SETTINGS / PASSWORD CHANGE
// ============================================================================

function SettingsManagement({ account }) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function handlePasswordChange(e) {
    e.preventDefault();
    setNotice(null);

    if (!currentPassword || !newPassword || !confirmPassword) {
      setNotice({ text: 'All fields required', bad: true });
      return;
    }

    if (newPassword.length < 6 || newPassword.length > 128) {
      setNotice({ text: 'New password must be between 6 and 128 characters', bad: true });
      return;
    }

    if (newPassword !== confirmPassword) {
      setNotice({ text: 'Passwords do not match', bad: true });
      return;
    }

    if (currentPassword === newPassword) {
      setNotice({ text: 'New password must be different from current password', bad: true });
      return;
    }

    setBusy(true);
    try {
      await api('/admin/auth/password', {
        method: 'POST',
        body: { currentPassword, newPassword },
      });
      setNotice({ text: 'Password changed successfully. Redirecting...', bad: false });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => {
        window.location.href = '/admin';
      }, 2000);
    } catch (err) {
      setNotice({ text: err.message, bad: true });
      setBusy(false);
    }
  }

  return (
    <section>
      <h2>Settings</h2>

      <div className="ad-card">
        <h3>Administrator Account</h3>
        <div className="ad-detail-row" style={{ borderBottom: '1px solid var(--line)', paddingBottom: '12px', marginBottom: '12px' }}>
          <span className="ad-detail-label">Email</span>
          <span className="ad-detail-value">{account.email}</span>
        </div>

        <h3 style={{ marginTop: '20px' }}>Change Password</h3>
        <form onSubmit={handlePasswordChange}>
          <label>Current Password</label>
          <input
            type={showPassword ? 'text' : 'password'}
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            autoComplete="current-password"
            required
          />

          <label>New Password</label>
          <input
            type={showPassword ? 'text' : 'password'}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            autoComplete="new-password"
            placeholder="At least 6 characters"
            required
          />

          <label>Confirm New Password</label>
          <input
            type={showPassword ? 'text' : 'password'}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            autoComplete="new-password"
            required
          />

          <div style={{ marginTop: '12px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <input
              type="checkbox"
              id="show-pwd"
              checked={showPassword}
              onChange={(e) => setShowPassword(e.target.checked)}
            />
            <label htmlFor="show-pwd" style={{ margin: 0, fontWeight: 'normal', color: 'var(--text)', fontSize: '14px' }}>
              Show passwords
            </label>
          </div>

          <Notice notice={notice} />
          <button className="ad-btn" disabled={busy} style={{ width: '100%', padding: '12px' }}>
            {busy ? 'Updating…' : 'Change Password'}
          </button>
        </form>
      </div>
    </section>
  );
}

// ============================================================================
// PRIME HOUR MANAGEMENT
// ============================================================================

function PrimeHourManagement() {
  const [{ data, error, loading }, reload] = useLoad(() => api('/admin/prime-hour'), []);
  const [notice, setNotice] = useState(null);

  if (loading && !data) return <p className="ad-empty">Loading…</p>;
  if (error) return <p className="ad-error">{error}</p>;

  const wallets = data?.wallets || [];
  const transactions = data?.transactions || [];
  const summary = data?.summary || {};

  return (
    <section>
      <div className="ad-row" style={{ justifyContent: 'space-between' }}>
        <h2>Prime Hour Management</h2>
        <button className="ad-btn ghost" onClick={reload}>Refresh</button>
      </div>

      <Notice notice={notice} />

      <div className="ad-grid">
        <StatCard label="Total Wallets" value={summary.totalWallets || 0} />
        <StatCard label="Active Wallets" value={summary.totalWalletsActive || 0} />
        <StatCard label="Total Balance" value={money(summary.totalPrimeBalance || 0)} />
        <StatCard label="Total Deposits" value={money(summary.totalPrimeDeposits || 0)} />
        <StatCard label="Total Withdrawals" value={money(summary.totalPrimeWithdrawals || 0)} />
        <StatCard label="Total Transactions" value={summary.totalTransactions || 0} />
      </div>

      <h3>Prime Hour Wallets</h3>
      <div className="ad-scroll">
        <table className="ad-table">
          <thead>
            <tr>
              <th>Account</th>
              <th>Email</th>
              <th>Balance</th>
              <th>Deposits</th>
              <th>Withdrawals</th>
              <th>Transactions</th>
            </tr>
          </thead>
          <tbody>
            {wallets.map((w) => (
              <tr key={w.id}>
                <td>{w.accountName}</td>
                <td>{w.accountEmail}</td>
                <td className="num" style={{ color: 'var(--accent)' }}>{money(w.balance)}</td>
                <td className="num">{money(w.totalDeposits)}</td>
                <td className="num">{money(w.totalWithdrawals)}</td>
                <td className="num">{w.transactionCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {wallets.length === 0 && <p className="ad-empty">No wallets yet</p>}
      </div>

      <h3>Recent Transactions</h3>
      <div className="ad-scroll">
        <table className="ad-table">
          <thead>
            <tr>
              <th>Account</th>
              <th>Email</th>
              <th>Type</th>
              <th>Amount</th>
              <th>Reference</th>
              <th>Status</th>
              <th>Date</th>
            </tr>
          </thead>
          <tbody>
            {transactions.map((t) => (
              <tr key={t.id}>
                <td>{t.accountName}</td>
                <td>{t.accountEmail}</td>
                <td><Badge value={t.type} /></td>
                <td className="num" style={{ color: t.type === 'deposit' ? 'var(--accent)' : 'var(--bad)' }}>
                  {t.type === 'deposit' ? '+' : '−'}{money(t.amount)}
                </td>
                <td><code style={{ fontSize: '10px', color: 'var(--muted)' }}>{t.reference || '—'}</code></td>
                <td><Badge value={t.status} /></td>
                <td>{when(t.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {transactions.length === 0 && <p className="ad-empty">No transactions yet</p>}
      </div>
    </section>
  );
}

// ============================================================================
// DEPOSITS MANAGEMENT
// ============================================================================

function DepositsManagement() {
  const [{ data: membersData }, reloadMembers] = useLoad(() => api('/admin/accounts'), []);
  const [notice, setNotice] = useState(null);
  const [memberId, setMemberId] = useState('');
  const [depositAmount, setDepositAmount] = useState('');
  const [depositDate, setDepositDate] = useState(new Date().toISOString().split('T')[0]);
  const [busy, setBusy] = useState(false);
  const members = membersData?.accounts || [];

  async function handleAddDeposit(e) {
    e.preventDefault();
    if (!memberId || !depositAmount) {
      setNotice({ text: 'Member and amount required', bad: true });
      return;
    }
    setBusy(true);
    try {
      const response = await api('/admin/deposits/add', {
        method: 'POST',
        body: {
          accountId: memberId,
          depositAmount: parseFloat(depositAmount),
          depositDate,
        },
      });
      setNotice({ text: response.message, bad: false });
      setMemberId('');
      setDepositAmount('');
      setDepositDate(new Date().toISOString().split('T')[0]);
      reloadMembers();
    } catch (err) {
      setNotice({ text: err.message, bad: true });
    }
    setBusy(false);
  }

  return (
    <section>
      <h2>Add Member Deposits</h2>
      <form className="ad-form" onSubmit={handleAddDeposit}>
        <label>Select Member</label>
        <select value={memberId} onChange={(e) => setMemberId(e.target.value)} required>
          <option value="">-- Choose a member --</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>{m.name} ({m.email})</option>
          ))}
        </select>
        <label>Deposit Amount (USD)</label>
        <input type="number" step="0.01" value={depositAmount} onChange={(e) => setDepositAmount(e.target.value)} placeholder="0.00" required />
        <label>Deposit Date</label>
        <input type="date" value={depositDate} onChange={(e) => setDepositDate(e.target.value)} required />
        <Notice notice={notice} />
        <button className="ad-btn" disabled={busy} style={{ width: '100%' }}>{busy ? 'Processing…' : 'Add Deposit'}</button>
      </form>
    </section>
  );
}

// ============================================================================
// MEMBER PASSWORD MANAGEMENT
// ============================================================================

function MemberPasswordManagement() {
  const [{ data: membersData }] = useLoad(() => api('/admin/accounts'), []);
  const [notice, setNotice] = useState(null);
  const [memberId, setMemberId] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const members = membersData?.accounts || [];

  async function handleResetPassword(e) {
    e.preventDefault();
    if (!memberId || !newPassword) {
      setNotice({ text: 'Member and password required', bad: true });
      return;
    }
    if (newPassword.length < 6 || newPassword.length > 128) {
      setNotice({ text: 'Password must be 6-128 characters', bad: true });
      return;
    }
    if (newPassword !== confirmPassword) {
      setNotice({ text: 'Passwords do not match', bad: true });
      return;
    }
    setBusy(true);
    try {
      await api(`/admin/accounts/${memberId}/password-reset`, {
        method: 'POST',
        body: { newPassword },
      });
      setNotice({ text: 'Password reset successfully', bad: false });
      setMemberId('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setNotice({ text: err.message, bad: true });
    }
    setBusy(false);
  }

  return (
    <section>
      <h2>Reset Member Password</h2>
      <form className="ad-form" onSubmit={handleResetPassword}>
        <label>Select Member</label>
        <select value={memberId} onChange={(e) => setMemberId(e.target.value)} required>
          <option value="">-- Choose a member --</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>{m.name} ({m.email})</option>
          ))}
        </select>
        <label>New Password</label>
        <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="At least 6 characters" required />
        <label>Confirm Password</label>
        <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Confirm password" required />
        <Notice notice={notice} />
        <button className="ad-btn" disabled={busy} style={{ width: '100%' }}>{busy ? 'Resetting…' : 'Reset Password'}</button>
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
  const [logo, setLogo] = useState(null);

  useEffect(() => {
    fetch('/api/public/logo')
      .then(r => r.ok && r.blob())
      .then(blob => blob && setLogo(URL.createObjectURL(blob)))
      .catch(() => {});
  }, []);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const data = await api('/admin/auth/login', { method: 'POST', body: { email, password } });
      onLogin(data.account);
    } catch (err) {
      setError(err.message);
    }
    setBusy(false);
  }

  return (
    <div className="ad-login">
      <form className="ad-card ad-form" onSubmit={submit}>
        {logo && <img src={logo} alt="Logo" className="ad-logo" />}
        <div className="ad-brand"><b>ascend</b> capital <span>Admin</span></div>
        <h2>Administrator sign in</h2>
        <label>Username</label>
        <input type="text" autoComplete="username" placeholder="admin" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <label>Password</label>
        <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        {error && <p className="ad-error">{error}</p>}
        <button className="ad-btn" disabled={busy} style={{ width: '100%', padding: '12px' }}>{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
    </div>
  );
}

export default function AdminDashboard() {
  const [account, setAccount] = useState(undefined);
  const [tab, setTab] = useState('dashboard');
  const [logo, setLogo] = useState(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    api('/admin/auth/me').then((d) => setAccount(d.account)).catch(() => setAccount(null));
    fetch('/api/public/logo')
      .then(r => r.ok && r.blob())
      .then(blob => blob && setLogo(URL.createObjectURL(blob)))
      .catch(() => {});
  }, []);

  async function signOut() {
    await api('/admin/auth/logout', { method: 'POST' }).catch(() => {});
    setAccount(null);
  }

  const tabs = [
    ['dashboard', 'Dashboard'],
    ['accounts', 'Accounts'],
    ['deposits', 'Deposits'],
    ['transactions', 'Approvals'],
    ['referrals', 'Referrals'],
    ['trading', 'Trading'],
    ['prime-hour', 'Prime Hour'],
    ['balance', 'Balances'],
    ['passwords', 'Passwords'],
    ['settings', 'Settings'],
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
          <button className="ad-btn" onClick={signOut} style={{ width: '100%', padding: '12px' }}>Sign out</button>
        </div>
      </div>
    );
  } else {
    body = (
      <>
        <header className="ad-top">
          <button className="ad-hamburger" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>☰</button>
          <div className="ad-brand">
            {logo && <img src={logo} alt="Logo" style={{ height: '28px', marginRight: '6px', verticalAlign: 'middle' }} />}
            <b>ascend</b> <span className="ad-brand-full">capital</span> <span>Admin</span>
          </div>
          <nav className={`ad-nav ${mobileMenuOpen ? 'open' : ''}`}>
            {tabs.map(([key, label]) => (
              <button
                key={key}
                className={tab === key ? 'on' : ''}
                onClick={() => { setTab(key); setMobileMenuOpen(false); }}
              >
                {label}
              </button>
            ))}
          </nav>
          <div className="ad-who">
            <span>{account.email}</span>
            <button className="ad-btn ghost sm" onClick={signOut}>Sign out</button>
          </div>
        </header>
        <main className="ad-main">
          {tab === 'dashboard' && <Dashboard />}
          {tab === 'accounts' && <AccountsManagement />}
          {tab === 'deposits' && <DepositsManagement />}
          {tab === 'transactions' && <TransactionApproval />}
          {tab === 'referrals' && <ReferralsManagement />}
          {tab === 'trading' && <TradingManagement />}
          {tab === 'prime-hour' && <PrimeHourManagement />}
          {tab === 'balance' && <BalanceManagement />}
          {tab === 'passwords' && <MemberPasswordManagement />}
          {tab === 'settings' && <SettingsManagement account={account} />}
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
.ad *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
.ad h2,.ad h3{font-family:Manrope,'DM Sans',sans-serif;margin:0}
.ad h2{font-size:20px}.ad h3{font-size:15px;margin:18px 0 8px}
.ad-logo{max-height:40px;width:auto;object-fit:contain}
.ad-hamburger{display:none;background:none;border:none;color:var(--text);font-size:24px;cursor:pointer;padding:8px;margin:-8px}
.ad-top{display:flex;align-items:center;gap:20px;flex-wrap:wrap;padding:12px 16px;border-bottom:1px solid var(--line);background:var(--card);position:relative}
.ad-brand{font:600 18px Manrope,sans-serif;display:flex;align-items:center;white-space:nowrap}.ad-brand b{color:var(--accent)}.ad-brand span{font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);margin-left:8px}
.ad-brand-full{display:inline}
.ad-nav{display:flex;gap:4px;flex:1;flex-wrap:wrap;min-width:100%}
.ad-nav button{background:none;border:0;color:var(--muted);padding:8px 12px;border-radius:6px;cursor:pointer;font:600 12px inherit;white-space:nowrap;min-height:44px}
.ad-nav button.on{background:#1a241f;color:var(--text)}
.ad-who{display:flex;align-items:center;gap:8px;color:var(--muted);font-size:12px;white-space:nowrap}
.ad-main{max-width:1200px;margin:0 auto;padding:16px}
.ad-row{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:14px}.ad-row.grow{flex:1;margin:0}.ad-row.end{justify-content:flex-end}
.ad-search-row{gap:8px}
.ad-search-row input{flex:1;min-width:150px}
.ad-search-row button{flex:0}
.ad input,.ad select,.ad textarea{background:#0e1512;border:1px solid var(--line);color:var(--text);border-radius:8px;padding:12px;font:inherit;width:100%;min-height:44px}
.ad-row input,.ad-row select{width:auto}
.ad label{display:block;margin:12px 0 6px;color:var(--muted);font-size:12px;font-weight:500}
.ad-btn{background:var(--accent);color:#0b100e;border:0;border-radius:6px;padding:9px 14px;font:600 12px 'DM Sans',sans-serif;cursor:pointer;white-space:nowrap;min-height:44px;display:inline-flex;align-items:center;justify-content:center}
.ad-btn:disabled{opacity:.5;cursor:default}.ad-btn.sm{padding:8px 12px;min-height:40px;font-size:11px}
.ad-btn.xs{padding:4px 6px;min-height:32px;font-size:10px}
.ad-btn.ghost{background:transparent;color:var(--text);border:1px solid var(--line)}
.ad-btn.danger{background:var(--bad)}
.ad-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin:16px 0}
.ad-stat-card{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:14px}
.ad-stat-label{color:var(--muted);font-size:11px;margin:0 0 4px;text-transform:uppercase}
.ad-stat-value{font:700 20px Manrope,sans-serif;margin:0;color:var(--accent)}
.ad-stat-sub{color:var(--muted);font-size:11px;margin:4px 0 0}
.ad-scroll{overflow-x:auto;border:1px solid var(--line);border-radius:10px;background:var(--card);margin:12px 0;-webkit-overflow-scrolling:touch}
.ad-table{width:100%;border-collapse:collapse;min-width:500px}
.ad-table th{text-align:left;color:var(--muted);font-weight:600;font-size:11px;padding:10px 8px;border-bottom:1px solid var(--line);text-transform:uppercase;letter-spacing:.5px}
.ad-table td{padding:10px 8px;border-bottom:1px solid var(--line);vertical-align:top;font-size:13px}
.ad-table tr:last-child td{border-bottom:0}
.ad-table small{display:block;color:var(--muted);margin-top:2px;font-size:11px}
.ad-table .num{white-space:nowrap;font-variant-numeric:tabular-nums}
.ad-account-card{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:14px;margin-bottom:12px}
.ad-account-card-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;padding-bottom:12px;border-bottom:1px solid var(--line)}
.ad-account-name{font:600 15px 'DM Sans',sans-serif}
.ad-account-card-body{margin-bottom:12px}
.ad-account-card-row{display:flex;justify-content:space-between;padding:6px 0;font-size:13px}
.ad-account-card-row .label{color:var(--muted);font-weight:500}
.ad-account-card-row .value{text-align:right}
.ad-account-card-actions{display:flex;gap:8px}
.ad-account-card-actions .ad-btn{flex:1;min-height:40px}
.ad-accounts-desktop{display:block}
.ad-accounts-mobile{display:none}
.ad-actions-compact{display:flex;gap:4px}
.ad-empty{color:var(--muted);padding:20px;text-align:center;font-size:13px}
.ad-muted{color:var(--muted)}
.ad-error{color:var(--bad);margin:8px 0;font-size:13px}
.ad-notice{background:#16221b;border:1px solid var(--line);border-radius:8px;padding:10px;margin:10px 0;font-size:13px}.ad-notice.bad{color:var(--bad);border-color:#4a2a26;background:#201513}
.ad-login{min-height:100vh;display:grid;place-items:center;padding:16px}
.ad-card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:20px}
.ad-form{max-width:420px;width:100%}.ad-form .ad-btn{margin-top:16px;width:100%}.ad-form h2{margin:12px 0 8px;font-size:18px}
.ad-overlay{position:fixed;inset:0;background:rgba(0,0,0,.7);display:flex;justify-content:center;align-items:center;z-index:50;padding:16px;overflow-y:auto}
.ad-modal{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:20px;width:min(440px,95vw);margin:auto}
.ad-modal h3{margin:0 0 8px;font-size:16px}.ad-modal .ad-row{margin:12px 0 0}
.ad-detail-row{display:grid;grid-template-columns:120px 1fr;gap:12px;padding:10px 0;border-bottom:1px solid var(--line);align-items:flex-start}
.ad-detail-label{color:var(--muted);font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.5px}
.ad-detail-value{color:var(--text);font-size:13px}
.ad-actions{display:flex;gap:6px;flex-wrap:wrap}
.ad-badge{display:inline-block;background:var(--line);color:var(--text);padding:3px 8px;border-radius:4px;font-size:10px;font-weight:600;text-transform:uppercase}
.ad-badge.active{background:#1a3a2e;color:var(--accent)}
.ad-badge.held{background:#3a2a20;color:var(--bad)}
.ad-badge.admin{background:#1a2a3a;color:#5bc0ff}
.ad-badge.member{background:#1a3a1a;color:#90ee90}

@media (max-width:768px){
  .ad-hamburger{display:block}
  .ad-brand-full{display:none}
  .ad-top{gap:12px;padding:10px 12px}
  .ad-top nav{display:none;position:absolute;top:100%;left:0;right:0;background:var(--card);border-bottom:1px solid var(--line);flex-direction:column;padding:8px;gap:0;min-width:unset}
  .ad-top nav.open{display:flex}
  .ad-who{font-size:11px;gap:6px;order:3;width:100%}
  .ad-brand{font-size:16px;order:2;flex:1}
  .ad-nav button{width:100%;text-align:left;padding:10px 8px}
  .ad-main{padding:12px}
  .ad h2{font-size:18px}
  .ad h3{font-size:14px;margin:16px 0 6px}
  .ad-grid{grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin:12px 0}
  .ad-stat-card{padding:12px}
  .ad-stat-value{font-size:18px}
  .ad-stat-label{font-size:10px}
  .ad-row{gap:8px;margin-bottom:12px}
  .ad input,.ad select,.ad textarea{padding:12px;font-size:16px;min-height:48px}
  .ad-btn{padding:10px 14px;min-height:48px;font-size:12px}
  .ad-btn.sm{min-height:40px;padding:8px 10px;font-size:11px}
  .ad-accounts-desktop{display:none}
  .ad-accounts-mobile{display:block}
  .ad-card{padding:16px}
  .ad-detail-row{grid-template-columns:90px 1fr;gap:10px;padding:8px 0}
  .ad-detail-label{font-size:10px}
  .ad-detail-value{font-size:12px}
  .ad-notice{padding:10px;font-size:12px;margin:8px 0}
  .ad-error{font-size:12px;margin:6px 0}
  .ad-empty{padding:16px;font-size:12px}
  .ad-scroll{margin:10px 0}
  .ad-modal{width:95vw;padding:16px}
  .ad-modal h3{font-size:15px;margin:0 0 6px}
  .ad-actions{gap:4px}
  .ad-badge{padding:2px 6px;font-size:9px}
  label{margin:12px 0 6px !important}
}

@media (max-width:480px){
  .ad-hamburger{font-size:20px;padding:6px}
  .ad-top{padding:8px}
  .ad-brand{font-size:14px;order:2;margin-left:auto;margin-right:auto;flex:1}
  .ad-who{order:3;width:100%;font-size:10px;justify-content:space-between}
  .ad-main{padding:10px}
  .ad h2{font-size:16px;margin-bottom:12px}
  .ad h3{font-size:13px;margin:12px 0 6px}
  .ad-grid{grid-template-columns:1fr;gap:8px}
  .ad-stat-card{padding:10px}
  .ad-stat-value{font-size:16px}
  .ad-stat-label{font-size:9px}
  .ad-row{gap:6px;margin-bottom:10px}
  .ad-row.ad-search-row input{min-width:0}
  .ad input,.ad select,.ad textarea{padding:10px;font-size:16px;min-height:44px}
  .ad-btn{padding:8px 10px;min-height:44px;font-size:11px}
  .ad-btn.sm{min-height:36px;padding:6px 8px;font-size:10px}
  .ad-btn.xs{min-height:28px;padding:3px 5px;font-size:9px}
  .ad-form{max-width:100%}
  .ad-card{padding:12px;border-radius:8px}
  .ad-account-card{padding:12px}
  .ad-account-card-header{margin-bottom:10px;padding-bottom:10px}
  .ad-account-name{font-size:13px}
  .ad-account-card-body{margin-bottom:10px}
  .ad-account-card-row{font-size:12px;padding:4px 0}
  .ad-account-card-actions{gap:6px}
  .ad-account-card-actions .ad-btn{min-height:36px;font-size:10px}
  .ad-login{padding:12px}
  .ad-modal{width:95vw;padding:14px;border-radius:8px}
  .ad-modal h3{font-size:14px;margin:0 0 6px}
  .ad-detail-row{grid-template-columns:70px 1fr;gap:8px;padding:6px 0;font-size:11px}
  .ad-detail-label{font-size:9px}
  .ad-detail-value{font-size:11px}
  .ad-table{font-size:10px}
  .ad-table th{padding:6px 4px;font-size:8px}
  .ad-table td{padding:6px 4px;font-size:10px}
  .ad-table small{font-size:8px}
  .ad-notice{padding:8px;margin:6px 0;font-size:11px}
  .ad-error{font-size:11px;margin:4px 0}
  .ad-empty{padding:12px;font-size:10px}
  .ad-muted{font-size:11px}
  label{margin:10px 0 4px !important;font-size:12px}
  section{padding:0}
}

@media (max-width:360px){
  .ad-hamburger{font-size:18px}
  .ad-brand{font-size:12px}
  .ad-brand span{font-size:8px}
  .ad h2{font-size:14px}
  .ad h3{font-size:12px}
  .ad-stat-value{font-size:14px}
  .ad-stat-label{font-size:8px}
  .ad-btn{padding:6px 8px;min-height:40px;font-size:10px}
  .ad-nav button{font-size:11px;padding:8px 6px;min-height:40px}
  .ad input,.ad select,.ad textarea{padding:8px;min-height:40px;font-size:15px}
}
`;
