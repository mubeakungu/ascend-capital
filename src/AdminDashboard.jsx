import React, { useCallback, useEffect, useMemo, useState } from 'react';

// Change to the currency your platform uses.
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

function useReview(onDone, notify) {
  const [target, setTarget] = useState(null);
  const approve = async (tx) => {
    if (!window.confirm(`Approve ${tx.type} of ${money(tx.amount)} for ${tx.accountName}?`)) return;
    try {
      await api(`/admin/transactions/${tx.id}/approve`, { method: 'POST' });
      notify(`${tx.type} of ${money(tx.amount)} approved.`);
      onDone();
    } catch (e) {
      notify(e.message, true);
    }
  };
  const modal = target && (
    <AskModal
      title={`Reject ${target.type} of ${money(target.amount)}`}
      label="Reason (the client can see this)"
      multiline
      min={3}
      danger
      confirmText="Reject"
      onClose={() => setTarget(null)}
      onSubmit={async (note) => {
        await api(`/admin/transactions/${target.id}/reject`, { method: 'POST', body: { note } });
        notify('Transaction rejected.');
        onDone();
      }}
    />
  );
  return { approve, reject: setTarget, modal };
}

function TxTable({ rows, showClient, review, onClient }) {
  if (!rows.length) return <p className="ad-empty">Nothing here yet.</p>;
  return (
    <div className="ad-scroll">
      <table className="ad-table">
        <thead>
          <tr>
            <th>Date</th>{showClient && <th>Client</th>}<th>Type</th><th>Amount</th><th>Reference</th><th>Status</th><th />
          </tr>
        </thead>
        <tbody>
          {rows.map((tx) => (
            <tr key={tx.id}>
              <td>{when(tx.createdAt)}</td>
              {showClient && (
                <td>
                  <button className="ad-link" onClick={() => onClient?.(tx.accountId)}>{tx.accountName}</button>
                  <small>{tx.accountEmail}</small>
                </td>
              )}
              <td className={`ad-type ${tx.type}`}>{tx.type}</td>
              <td className="num">{money(tx.amount)}</td>
              <td className="ad-ref">{tx.reference}</td>
              <td>
                <Badge value={tx.status} />
                {tx.reviewNote && <small>{tx.reviewNote}</small>}
              </td>
              <td className="ad-actions">
                {tx.status === 'pending' && (
                  <>
                    <button className="ad-btn sm" onClick={() => review.approve(tx)}>Approve</button>
                    <button className="ad-btn sm danger" onClick={() => review.reject(tx)}>Reject</button>
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Queue({ onClient }) {
  const [status, setStatus] = useState('pending');
  const [type, setType] = useState('');
  const [notice, setNotice] = useState(null);
  const notify = (text, bad = false) => setNotice({ text, bad });
  const [{ data, error, loading }, reload] = useLoad(() => {
    const qs = new URLSearchParams();
    if (status) qs.set('status', status);
    if (type) qs.set('type', type);
    return api(`/admin/transactions?${qs}`);
  }, [status, type]);
  const review = useReview(reload, notify);

  return (
    <section>
      <div className="ad-row">
        <h2>Deposits &amp; withdrawals</h2>
        <div className="ad-row grow end">
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="">All statuses</option>
          </select>
          <select value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">Deposits &amp; withdrawals</option>
            <option value="deposit">Deposits</option>
            <option value="withdrawal">Withdrawals</option>
          </select>
          <button className="ad-btn ghost" onClick={reload}>Refresh</button>
        </div>
      </div>
      <Notice notice={notice} />
      {error && <p className="ad-error">{error}</p>}
      {loading && !data ? <p className="ad-empty">Loading…</p> : data && <TxTable rows={data.transactions} showClient review={review} onClient={onClient} />}
      {review.modal}
    </section>
  );
}

function ClientDetail({ id, onClose, onChanged }) {
  const [notice, setNotice] = useState(null);
  const notify = (text, bad = false) => setNotice({ text, bad });
  const [ask, setAsk] = useState(null);
  const [{ data, error, loading }, reload] = useLoad(() => api(`/admin/accounts/${id}/activity`), [id]);
  const refresh = () => { reload(); onChanged(); };
  const review = useReview(refresh, notify);
  const post = (path, body) => api(`/admin/accounts/${id}/${path}`, { method: 'POST', body });
  const acc = data?.account;
  const s = data?.summary;

  return (
    <div className="ad-overlay" onClick={onClose}>
      <aside className="ad-drawer" onClick={(e) => e.stopPropagation()}>
        <div className="ad-row">
          <h2>{acc?.name ?? 'Client'}</h2>
          <button className="ad-btn ghost sm" onClick={onClose}>Close</button>
        </div>
        {loading && !data && <p className="ad-empty">Loading…</p>}
        {error && <p className="ad-error">{error}</p>}
        <Notice notice={notice} />
        {acc && s && (
          <>
            <p className="ad-muted">{acc.email} · joined {when(acc.createdAt)} · <Badge value={acc.status} /></p>
            {acc.status === 'held' && (
              <p className="ad-notice bad">On hold since {when(acc.heldAt)} — {acc.holdReason}</p>
            )}
            <div className="ad-stats">
              <div><span>Balance</span><b>{money(s.balance)}</b></div>
              <div><span>Total deposited</span><b>{money(s.totalDeposited)}</b></div>
              <div><span>Total withdrawn</span><b>{money(s.totalWithdrawn)}</b></div>
              <div><span>Pending deposits</span><b>{money(s.pendingDeposits)}</b></div>
              <div><span>Pending withdrawals</span><b>{money(s.pendingWithdrawals)}</b></div>
              <div><span>Rejected requests</span><b>{s.rejectedCount}</b></div>
            </div>
            {acc.role !== 'admin' && (
              <div className="ad-row">
                {acc.status === 'held'
                  ? <button className="ad-btn" onClick={() => setAsk('release')}>Release hold</button>
                  : <button className="ad-btn danger" onClick={() => setAsk('hold')}>Hold account (fraud)</button>}
                <button className="ad-btn ghost" onClick={() => setAsk('password')}>Reset password</button>
              </div>
            )}
            <h3>Recent transactions</h3>
            <TxTable rows={data.transactions} review={review} />
          </>
        )}
        {ask === 'hold' && (
          <AskModal
            title="Put account on hold"
            label="Reason (required, recorded in the audit log)"
            multiline min={3} danger confirmText="Hold account"
            onClose={() => setAsk(null)}
            onSubmit={async (reason) => { await post('hold', { reason }); notify('Account placed on hold and signed out.'); refresh(); }}
          />
        )}
        {ask === 'release' && (
          <AskModal
            title="Release account"
            label="Note (optional)"
            multiline confirmText="Release"
            onClose={() => setAsk(null)}
            onSubmit={async (note) => { await post('release', { note }); notify('Account released.'); refresh(); }}
          />
        )}
        {ask === 'password' && (
          <AskModal
            title="Set a new password"
            label="New password (at least 12 characters)"
            type="password" min={12} confirmText="Update password"
            onClose={() => setAsk(null)}
            onSubmit={async (newPassword) => { await post('password', { newPassword }); notify('Password updated. The client was signed out everywhere.'); }}
          />
        )}
        {review.modal}
      </aside>
    </div>
  );
}

function Clients({ openId, setOpenId }) {
  const [query, setQuery] = useState('');
  const [{ data, error, loading }, reload] = useLoad(() => api('/admin/accounts'), []);
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data?.accounts ?? []).filter((a) => !q || a.name.toLowerCase().includes(q) || a.email.toLowerCase().includes(q));
  }, [data, query]);

  return (
    <section>
      <div className="ad-row">
        <h2>Clients</h2>
        <div className="ad-row grow end">
          <input placeholder="Search name or email" value={query} onChange={(e) => setQuery(e.target.value)} />
          <button className="ad-btn ghost" onClick={reload}>Refresh</button>
        </div>
      </div>
      {error && <p className="ad-error">{error}</p>}
      {loading && !data ? <p className="ad-empty">Loading…</p> : (
        <div className="ad-scroll">
          <table className="ad-table">
            <thead><tr><th>Client</th><th>Status</th><th>Balance</th><th>Pending</th><th>Joined</th><th /></tr></thead>
            <tbody>
              {rows.map((a) => (
                <tr key={a.id}>
                  <td>{a.name}{a.role === 'admin' && ' (admin)'}<small>{a.email}</small></td>
                  <td><Badge value={a.status} /></td>
                  <td className="num">{money(a.balance)}</td>
                  <td>{a.pendingTransactions}</td>
                  <td>{when(a.createdAt)}</td>
                  <td className="ad-actions"><button className="ad-btn sm ghost" onClick={() => setOpenId(a.id)}>View</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          {!rows.length && <p className="ad-empty">No clients found.</p>}
        </div>
      )}
      {openId && <ClientDetail id={openId} onClose={() => setOpenId(null)} onChanged={reload} />}
    </section>
  );
}

const AUDIT_ACTIONS = [
  ['', 'All actions'],
  ['transaction.approved', 'Approvals'],
  ['transaction.rejected', 'Rejections'],
  ['account.hold', 'Holds'],
  ['account.release', 'Releases'],
  ['password.reset_by_admin', 'Admin password resets'],
  ['password.change_self', 'Own password changes'],
];

function Audit() {
  const [action, setAction] = useState('');
  const [{ data, error, loading }, reload] = useLoad(
    () => api(`/admin/audit${action ? `?action=${encodeURIComponent(action)}` : ''}`),
    [action],
  );
  return (
    <section>
      <div className="ad-row">
        <h2>Audit log</h2>
        <div className="ad-row grow end">
          <select value={action} onChange={(e) => setAction(e.target.value)}>
            {AUDIT_ACTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <button className="ad-btn ghost" onClick={reload}>Refresh</button>
        </div>
      </div>
      {error && <p className="ad-error">{error}</p>}
      {loading && !data ? <p className="ad-empty">Loading…</p> : data && (
        <div className="ad-scroll">
          <table className="ad-table">
            <thead><tr><th>When</th><th>Admin</th><th>Action</th><th>Details</th><th>IP</th></tr></thead>
            <tbody>
              {data.entries.map((e) => (
                <tr key={e.id}>
                  <td>{when(e.createdAt)}</td>
                  <td>{e.actorEmail ?? '—'}</td>
                  <td>{e.action}</td>
                  <td className="ad-ref">{Object.entries(e.detail).map(([k, v]) => `${k}: ${v}`).join(' · ')}</td>
                  <td>{e.ip ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!data.entries.length && <p className="ad-empty">No entries yet.</p>}
        </div>
      )}
    </section>
  );
}

function Security({ forced, onChanged }) {
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    if (form.newPassword !== form.confirm) return setNotice({ text: 'New passwords do not match.', bad: true });
    setBusy(true);
    try {
      await api('/auth/password', { method: 'POST', body: { currentPassword: form.currentPassword, newPassword: form.newPassword } });
      setForm({ currentPassword: '', newPassword: '', confirm: '' });
      setNotice({ text: 'Password changed. Your other sessions were signed out.' });
      onChanged?.();
    } catch (err) {
      setNotice({ text: err.message, bad: true });
    }
    setBusy(false);
  }

  return (
    <section>
      <h2>Change your password</h2>
      {forced && <p className="ad-notice">You are signed in with a temporary password. Choose a new one to continue.</p>}
      <form className="ad-form" onSubmit={submit}>
        <label>Current password</label>
        <input type="password" autoComplete="current-password" value={form.currentPassword} onChange={set('currentPassword')} required />
        <label>New password (at least 12 characters)</label>
        <input type="password" autoComplete="new-password" value={form.newPassword} onChange={set('newPassword')} required />
        <label>Confirm new password</label>
        <input type="password" autoComplete="new-password" value={form.confirm} onChange={set('confirm')} required />
        <Notice notice={notice} />
        <button className="ad-btn" disabled={busy}>{busy ? 'Saving…' : 'Update password'}</button>
      </form>
    </section>
  );
}

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
  const [tab, setTab] = useState('queue');
  const [openId, setOpenId] = useState(null);

  useEffect(() => {
    api('/auth/me').then((d) => setAccount(d.account)).catch(() => setAccount(null));
  }, []);

  async function signOut() {
    await api('/auth/logout', { method: 'POST' }).catch(() => {});
    setAccount(null);
  }

  const refreshAccount = () => api('/auth/me').then((d) => setAccount(d.account)).catch(() => setAccount(null));
  const openClient = (id) => { setTab('clients'); setOpenId(id); };
  const tabs = [['queue', 'Review queue'], ['clients', 'Clients'], ['audit', 'Audit log'], ['security', 'Security']];

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
  } else if (account.mustChangePassword) {
    body = (
      <>
        <header className="ad-top">
          <div className="ad-brand"><b>ascend</b> capital <span>Admin</span></div>
          <div className="ad-who">{account.email}<button className="ad-btn ghost sm" onClick={signOut}>Sign out</button></div>
        </header>
        <main className="ad-main"><Security forced onChanged={refreshAccount} /></main>
      </>
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
          {tab === 'queue' && <Queue onClient={openClient} />}
          {tab === 'clients' && <Clients openId={openId} setOpenId={setOpenId} />}
          {tab === 'audit' && <Audit />}
          {tab === 'security' && <Security />}
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
.ad-link{background:none;border:0;color:var(--accent);cursor:pointer;padding:0;font:inherit;text-align:left}
.ad-scroll{overflow-x:auto;border:1px solid var(--line);border-radius:12px;background:var(--card)}
.ad-table{width:100%;border-collapse:collapse;min-width:640px}
.ad-table th{text-align:left;color:var(--muted);font-weight:500;font-size:12px;padding:10px 12px;border-bottom:1px solid var(--line)}
.ad-table td{padding:10px 12px;border-bottom:1px solid var(--line);vertical-align:top}
.ad-table tr:last-child td{border-bottom:0}
.ad-table small{display:block;color:var(--muted);margin-top:2px}
.ad-table .num{white-space:nowrap;font-variant-numeric:tabular-nums}
.ad-ref{word-break:break-word;max-width:280px}
.ad-actions{white-space:nowrap;text-align:right}.ad-actions .ad-btn{margin-left:6px}
.ad-type.deposit{color:var(--accent)}.ad-type.withdrawal{color:var(--warn)}
.ad-badge{display:inline-block;padding:2px 9px;border-radius:99px;font-size:11px;text-transform:capitalize;background:#1a241f}
.ad-badge.pending{color:var(--warn)}.ad-badge.approved,.ad-badge.active{color:var(--accent)}.ad-badge.rejected,.ad-badge.held{color:var(--bad)}
.ad-empty{color:var(--muted);padding:24px;text-align:center}.ad-muted{color:var(--muted)}
.ad-error{color:var(--bad);margin:8px 0}
.ad-notice{background:#16221b;border:1px solid var(--line);border-radius:8px;padding:9px 12px;margin:10px 0}.ad-notice.bad{color:var(--bad);border-color:#4a2a26;background:#201513}
.ad-login{min-height:100vh;display:grid;place-items:center;padding:20px}
.ad-card{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:28px}
.ad-form{max-width:420px;width:100%}.ad-form .ad-btn{margin-top:16px;width:100%}.ad-form h2{margin:14px 0 4px}
.ad-overlay{position:fixed;inset:0;background:rgba(0,0,0,.6);display:flex;justify-content:flex-end;align-items:center;z-index:50}
.ad-modal{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:22px;width:min(440px,92vw);margin:auto}
.ad-modal h3{margin:0 0 6px}.ad-modal .ad-row{margin:14px 0 0}
.ad-drawer{background:var(--bg);border-left:1px solid var(--line);height:100%;width:min(760px,100%);overflow-y:auto;padding:22px}
.ad-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin:14px 0}
.ad-stats div{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:10px 12px}
.ad-stats span{display:block;color:var(--muted);font-size:12px}.ad-stats b{font:700 16px Manrope,sans-serif}
`;
