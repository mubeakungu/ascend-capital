import React, { useCallback, useEffect, useMemo, useState } from 'react';

const CURRENCY = 'USD';

const money = (n) =>
  `${CURRENCY} ${Number(n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const when = (iso) => (iso ? new Date(iso).toLocaleString() : '—');

// Admin API helper - uses same-origin credentials for ADMIN session cookie (separate from client)
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
      <form className="ad-modal" onClick={(e) => e.stopPropagation()} onSubmit={saveChanges} style={{ maxWidth: '500px' }}>
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
            <div className="ad-row end" style={{ marginTop: '16px' }}>
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
            <div className="ad-row end" style={{ marginTop: '16px' }}>
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

  const accounts = data?.accounts || [];

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
      <div className="ad-row">
        <h2>Account Management</h2>
        <button className="ad-btn ghost" onClick={reload} style={{ marginLeft: 'auto' }}>Refresh</button>
      </div>

      <Notice notice={notice} />

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
                  <div className="ad-actions">
                    <button className="ad-btn ghost sm" onClick={() => setSelectedId(a.id)}>View</button>
                    {a.role !== 'admin' && (
                      <button className="ad-btn ghost sm danger" onClick={() => setDeleteId(a.id)}>Delete</button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selectedId && (
        <AccountDetailModal 
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
  const [notice, setNotice] = useState(null);

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

  return (
    <section>
      <div className="ad-row">
        <h2>Trading & Profit Ledger</h2>
        <button className="ad-btn ghost" onClick={reload} style={{ marginLeft: 'auto' }}>Refresh</button>
        <button className="ad-btn" onClick={applyProfits}>Apply Daily Profits</button>
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
        body: { reason: actionType === 'reject' ? reason : undefined },
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
      <div className="ad-row">
        <h2>Transaction Approvals</h2>
        <button className="ad-btn ghost" onClick={reload} style={{ marginLeft: 'auto' }}>Refresh</button>
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
                  <th>Reference</th>
                  <th>Requested</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {deposits.map((t) => (
                  <tr key={t.id}>
                    <td>
                      {t.accountName}
                      <small>{t.accountEmail}</small>
                    </td>
                    <td className="num" style={{ color: 'var(--accent)' }}>+{money(t.amount)}</td>
                    <td><code style={{ fontSize: '11px', color: 'var(--muted)' }}>{t.reference || '—'}</code></td>
                    <td>{new Date(t.createdAt).toLocaleString()}</td>
                    <td>
                      <div className="ad-actions">
                        <button className="ad-btn ghost sm" onClick={() => { setActionId(t.id); setActionType('approve'); }}>Approve</button>
                        <button className="ad-btn ghost sm danger" onClick={() => { setActionId(t.id); setActionType('reject'); }}>Reject</button>
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
                  <th>Destination</th>
                  <th>Requested</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {withdrawals.map((t) => (
                  <tr key={t.id}>
                    <td>
                      {t.accountName}
                      <small>{t.accountEmail}</small>
                    </td>
                    <td className="num" style={{ color: 'var(--bad)' }}>−{money(t.amount)}</td>
                    <td><code style={{ fontSize: '11px', color: 'var(--muted)', wordBreak: 'break-all' }}>{t.destination || '—'}</code></td>
                    <td>{new Date(t.createdAt).toLocaleString()}</td>
                    <td>
                      <div className="ad-actions">
                        <button className="ad-btn ghost sm" onClick={() => { setActionId(t.id); setActionType('approve'); }}>Approve</button>
                        <button className="ad-btn ghost sm danger" onClick={() => { setActionId(t.id); setActionType('reject'); }}>Reject</button>
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
                  placeholder="Explain why this transaction is being rejected..."
                  required
                />
              </>
            )}

            <p style={{ color: 'var(--muted)', fontSize: '12px', marginTop: '12px' }}>
              {actionType === 'approve' 
                ? 'This transaction will be approved and processed immediately.' 
                : 'The user will be notified of the rejection.'}
            </p>

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

  async function handlePasswordChange(e) {
    e.preventDefault();
    setNotice(null);

    if (!currentPassword || !newPassword || !confirmPassword) {
      setNotice({ text: 'All fields required', bad: true });
      return;
    }

    if (newPassword.length < 12) {
      setNotice({ text: 'New password must be at least 12 characters', bad: true });
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
      await api('/admin/auth/change-password', {
        method: 'POST',
        body: { currentPassword, newPassword },
      });
      setNotice({ text: 'Password changed successfully' });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setNotice({ text: err.message, bad: true });
    }
    setBusy(false);
  }

  return (
    <section>
      <h2>Settings</h2>

      <div className="ad-card" style={{ maxWidth: '500px', marginTop: '20px' }}>
        <h3>Administrator Account</h3>
        <div className="ad-detail-row" style={{ borderBottom: '1px solid var(--line)', paddingBottom: '12px', marginBottom: '12px' }}>
          <span className="ad-detail-label">Email</span>
          <span className="ad-detail-value">{account.email}</span>
        </div>

        <h3 style={{ marginTop: '20px' }}>Change Password</h3>
        <form onSubmit={handlePasswordChange}>
          <label>Current Password</label>
          <input
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            autoComplete="current-password"
            required
          />

          <label>New Password</label>
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            autoComplete="new-password"
            placeholder="At least 12 characters"
            required
          />

          <label>Confirm New Password</label>
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            autoComplete="new-password"
            required
          />

          <Notice notice={notice} />
          <button className="ad-btn" disabled={busy} style={{ marginTop: '16px', width: '100%' }}>
            {busy ? 'Updating…' : 'Change Password'}
          </button>
        </form>
      </div>
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
    // Try to load logo
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
        <button className="ad-btn" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
    </div>
  );
}

export default function AdminDashboard() {
  const [account, setAccount] = useState(undefined);
  const [tab, setTab] = useState('dashboard');
  const [logo, setLogo] = useState(null);

  useEffect(() => {
    // Check admin auth session (separate from client session)
    api('/admin/auth/me').then((d) => setAccount(d.account)).catch(() => setAccount(null));
    // Load logo
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
    ['transactions', 'Approvals'],
    ['referrals', 'Referrals'],
    ['trading', 'Trading'],
    ['balance', 'Balances'],
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
          <button className="ad-btn" onClick={signOut}>Sign out</button>
        </div>
      </div>
    );
  } else {
    body = (
      <>
        <header className="ad-top">
          <div className="ad-brand">
            {logo && <img src={logo} alt="Logo" style={{ height: '32px', marginRight: '8px', verticalAlign: 'middle' }} />}
            <b>ascend</b> capital <span>Admin</span>
          </div>
          <nav>
            {tabs.map(([key, label]) => (
              <button key={key} className={tab === key ? 'on' : ''} onClick={() => setTab(key)}>{label}</button>
            ))}
          </nav>
          <div className="ad-who">{account.email}<button className="ad-btn ghost sm" onClick={signOut}>Sign out</button></div>
        </header>
        <main className="ad-main">
          {tab === 'dashboard' && <Dashboard />}
          {tab === 'accounts' && <AccountsManagement />}
          {tab === 'transactions' && <TransactionApproval />}
          {tab === 'referrals' && <ReferralsManagement />}
          {tab === 'trading' && <TradingManagement />}
          {tab === 'balance' && <BalanceManagement />}
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
.ad *{box-sizing:border-box}
.ad h2,.ad h3{font-family:Manrope,'DM Sans',sans-serif;margin:0}
.ad h2{font-size:20px}.ad h3{font-size:15px;margin:18px 0 8px}
.ad-logo{max-height:40px;width:auto;object-fit:contain}
.ad-top{display:flex;align-items:center;gap:20px;flex-wrap:wrap;padding:12px 24px;border-bottom:1px solid var(--line);background:var(--card)}
.ad-brand{font:600 18px Manrope,sans-serif;display:flex;align-items:center}.ad-brand b{color:var(--accent)}.ad-brand span{font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);margin-left:8px}
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
.ad-detail-row{display:grid;grid-template-columns:150px 1fr;gap:12px;padding:12px 0;border-bottom:1px solid var(--line);align-items:center}
.ad-detail-label{color:var(--muted);font-size:12px;font-weight:500}
.ad-detail-value{color:var(--text)}
.ad-actions{display:flex;gap:6px}
.ad-badge{display:inline-block;background:var(--line);color:var(--text);padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600;text-transform:uppercase}
.ad-badge.active{background:#1a3a2e;color:var(--accent)}
.ad-badge.held{background:#3a2a20;color:var(--bad)}
.ad-badge.admin{background:#1a2a3a;color:#5bc0ff}
.ad-badge.member{background:#1a3a1a;color:#90ee90}
`;
