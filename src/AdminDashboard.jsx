import React, { useState, useEffect, useRef } from 'react';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const AdminDashboard = () => {
  // ═══════════════════════════════════════════════════════════════════════════
  // STATE MANAGEMENT
  // ═══════════════════════════════════════════════════════════════════════════

  const [activePage, setActivePage] = useState('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [adjustTab, setAdjustTab] = useState('balance');

  // Data
  const [stats, setStats] = useState({
    clients: 0,
    deposits: 0,
    withdrawals: 0,
    pending_deposits: 0,
    total_profit_paid: 0,
    trades_today: 0,
    ref_commissions: 0,
    total_referrals: 0,
    scheduler_running: false
  });

  const [allTx, setAllTx] = useState([]);
  const [allClients, setAllClients] = useState([]);
  const [chartData, setChartData] = useState({ deposits: [], clients: [] });

  // Filters & Search
  const [clientSearch, setClientSearch] = useState('');
  const [txSearch, setTxSearch] = useState('');
  const [txTypeFilter, setTxTypeFilter] = useState('');
  const [txStatusFilter, setTxStatusFilter] = useState('');
  const [tradeStatusFilter, setTradeStatusFilter] = useState('');

  // Modals
  const [showApproveModal, setShowApproveModal] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [showApproveWdrModal, setShowApproveWdrModal] = useState(false);
  const [showRejectWdrModal, setShowRejectWdrModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const [selectedTx, setSelectedTx] = useState(null);
  const [selectedClient, setSelectedClient] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const [editData, setEditData] = useState({ name: '', email: '', phone: '' });

  // Adjust Balance
  const [adjustClient, setAdjustClient] = useState('');
  const [adjustField, setAdjustField] = useState('balance');
  const [adjustAmount, setAdjustAmount] = useState('');
  const [adjustNote, setAdjustNote] = useState('');
  const [adjustMethod, setAdjustMethod] = useState('MANUAL');

  // Referral Creation
  const [refReferrer, setRefReferrer] = useState('');
  const [refMode, setRefMode] = useState('existing');
  const [refReferred, setRefReferred] = useState('');
  const [refNewName, setRefNewName] = useState('');
  const [refNewEmail, setRefNewEmail] = useState('');
  const [refNewPhone, setRefNewPhone] = useState('');
  const [refNewPassword, setRefNewPassword] = useState('');
  const [refCreateDeposit, setRefCreateDeposit] = useState(false);
  const [refDepositAmount, setRefDepositAmount] = useState('');
  const [refDepositMethod, setRefDepositMethod] = useState('MANUAL');
  const [refNote, setRefNote] = useState('');

  // Messages
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // ═══════════════════════════════════════════════════════════════════════════
  // API HELPERS
  // ═══════════════════════════════════════════════════════════════════════════

  const api = async (url, opts = {}) => {
    try {
      const res = await fetch(url, { credentials: 'same-origin', ...opts });
      return await res.json();
    } catch (e) {
      console.error('API Error:', e);
      return { success: false, error: e.message };
    }
  };

  const post = (url, body) => api(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // UTILITIES
  // ═══════════════════════════════════════════════════════════════════════════

  const fmt = (n) => parseFloat(n || 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });

  const fmtD = (n) => '$' + fmt(n);

  const escHtml = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  const showSuccess = (msg) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(''), 4000);
  };

  const showError = (msg) => {
    setErrorMsg(msg);
    setTimeout(() => setErrorMsg(''), 5000);
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // DATA LOADING
  // ═══════════════════════════════════════════════════════════════════════════

  const loadStats = async () => {
    const d = await api('/api/admin/stats');
    if (!d.success) {
      window.location.href = '/admin';
      return;
    }
    setStats(d.data);
  };

  const loadTransactions = async () => {
    const d = await api('/api/admin/transactions');
    if (d.success) setAllTx(d.data);
  };

  const loadClients = async () => {
    const d = await api('/api/admin/clients');
    if (d.success) setAllClients(d.data);
  };

  const loadReferrals = async () => {
    const d = await api('/api/admin/referrals');
    if (d.success) return d.data;
    return [];
  };

  const loadTrades = async () => {
    const status = tradeStatusFilter;
    const d = await api('/api/admin/trades' + (status ? '?status=' + status : ''));
    if (d.success) return d.data;
    return [];
  };

  const refreshData = async () => {
    await loadStats();
    await loadTransactions();
    await loadClients();
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // TRANSACTION ACTIONS
  // ═══════════════════════════════════════════════════════════════════════════

  const openApproveModal = (tx) => {
    setSelectedTx(tx);
    setShowApproveModal(true);
  };

  const confirmApprove = async () => {
    const d = await post('/api/admin/deposit/approve', { tx_id: selectedTx.id });
    setShowApproveModal(false);
    if (!d.success) {
      showError(d.error);
      return;
    }
    showSuccess(d.data.message);
    await refreshData();
  };

  const openRejectModal = (tx) => {
    setSelectedTx(tx);
    setRejectReason('');
    setShowRejectModal(true);
  };

  const confirmReject = async () => {
    const d = await post('/api/admin/deposit/reject', {
      tx_id: selectedTx.id,
      reason: rejectReason.trim() || 'Rejected by admin'
    });
    setShowRejectModal(false);
    if (!d.success) {
      showError(d.error);
      return;
    }
    showSuccess('Deposit rejected');
    await refreshData();
  };

  const openApproveWdrModal = (tx) => {
    setSelectedTx(tx);
    setShowApproveWdrModal(true);
  };

  const confirmWdrApprove = async () => {
    const d = await post('/api/admin/withdrawal/approve', { tx_id: selectedTx.id });
    setShowApproveWdrModal(false);
    if (!d.success) {
      showError(d.error);
      return;
    }
    showSuccess('Withdrawal approved');
    await refreshData();
  };

  const openRejectWdrModal = (tx) => {
    setSelectedTx(tx);
    setRejectReason('');
    setShowRejectWdrModal(true);
  };

  const confirmWdrReject = async () => {
    const d = await post('/api/admin/withdrawal/reject', {
      tx_id: selectedTx.id,
      reason: rejectReason.trim() || 'Rejected by admin'
    });
    setShowRejectWdrModal(false);
    if (!d.success) {
      showError(d.error);
      return;
    }
    showSuccess('Withdrawal rejected');
    await refreshData();
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // CLIENT ACTIONS
  // ═══════════════════════════════════════════════════════════════════════════

  const openEditModal = (client) => {
    setSelectedClient(client);
    setEditData({ name: client.name, email: client.email, phone: client.phone });
    setShowEditModal(true);
  };

  const saveClientEdit = async () => {
    if (!editData.name || !editData.email) {
      showError('Name and email required');
      return;
    }
    const d = await post(`/api/admin/client/${selectedClient.id}/edit`, editData);
    if (!d.success) {
      showError(d.error);
      return;
    }
    setShowEditModal(false);
    showSuccess('Client updated');
    await refreshData();
  };

  const openDeleteModal = (client) => {
    setSelectedClient(client);
    setShowDeleteModal(true);
  };

  const confirmDeleteClient = async () => {
    const d = await post(`/api/admin/client/${selectedClient.id}/delete`, { confirm: true });
    setShowDeleteModal(false);
    if (!d.success) {
      showError(d.error);
      return;
    }
    showSuccess(d.data.message);
    await refreshData();
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // ADJUST BALANCE
  // ═══════════════════════════════════════════════════════════════════════════

  const submitAdjust = async () => {
    if (!adjustClient) {
      showError('Select a client');
      return;
    }
    if (!adjustAmount) {
      showError('Enter an amount');
      return;
    }
    if (!adjustNote) {
      showError('Enter a reason');
      return;
    }

    const amount = parseFloat(adjustAmount);
    const txFields = ['total_deposits', 'total_withdrawals'];

    let d;
    if (adjustField === 'total_deposits') {
      if (amount <= 0) {
        showError('Deposit amount must be positive');
        return;
      }
      d = await post(`/api/admin/client/${adjustClient}/create-deposit-tx`, {
        amount,
        method: adjustMethod,
        note: adjustNote
      });
    } else if (adjustField === 'total_withdrawals') {
      if (amount <= 0) {
        showError('Withdrawal amount must be positive');
        return;
      }
      d = await post(`/api/admin/client/${adjustClient}/create-withdrawal-tx`, {
        amount,
        method: adjustMethod,
        note: adjustNote
      });
    } else {
      d = await post(`/api/admin/client/${adjustClient}/adjust`, { amount, note: adjustNote });
    }

    if (!d.success) {
      showError(d.error);
      return;
    }
    showSuccess(d.data.message);
    setAdjustAmount('');
    setAdjustNote('');
    await refreshData();
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // REFERRAL CREATION
  // ═══════════════════════════════════════════════════════════════════════════

  const submitReferral = async () => {
    if (!refReferrer) {
      showError('Select a referrer');
      return;
    }
    if (refCreateDeposit && parseFloat(refDepositAmount) <= 0) {
      showError('Deposit amount must be greater than 0');
      return;
    }

    let d;
    if (refMode === 'existing') {
      if (!refReferred) {
        showError('Select a referred client');
        return;
      }
      d = await post('/api/admin/create-referral', {
        referrer_id: refReferrer,
        referred_id: refReferred,
        note: refNote,
        create_deposit: refCreateDeposit,
        deposit_amount: parseFloat(refDepositAmount),
        deposit_method: refDepositMethod
      });
    } else {
      if (!refNewName) {
        showError('Enter member name');
        return;
      }
      if (!refNewEmail) {
        showError('Enter email address');
        return;
      }
      if (!refNewPassword) {
        showError('Enter password (min 6 chars)');
        return;
      }
      if (refNewPassword.length < 6) {
        showError('Password must be at least 6 characters');
        return;
      }
      d = await post('/api/admin/create-referral-member', {
        referrer_id: refReferrer,
        name: refNewName,
        email: refNewEmail,
        phone: refNewPhone,
        password: refNewPassword,
        note: refNote,
        create_deposit: refCreateDeposit,
        deposit_amount: parseFloat(refDepositAmount),
        deposit_method: refDepositMethod
      });
    }

    if (!d.success) {
      showError(d.error);
      return;
    }
    showSuccess(d.data.message);
    setRefReferrer('');
    setRefReferred('');
    setRefNewName('');
    setRefNewEmail('');
    setRefNewPhone('');
    setRefNewPassword('');
    setRefCreateDeposit(false);
    setRefDepositAmount('');
    setRefNote('');
    await refreshData();
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // LOGOUT
  // ═══════════════════════════════════════════════════════════════════════════

  const logout = async () => {
    await post('/api/auth/logout', {});
    window.location.href = '/admin';
  };

  const runTradesNow = async () => {
    const d = await post('/api/admin/trade/run', {});
    if (!d.success) {
      showError(d.error);
      return;
    }
    showSuccess('Trades completed!');
    await refreshData();
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // EFFECTS
  // ═══════════════════════════════════════════════════════════════════════════

  useEffect(() => {
    loadStats();
    loadTransactions();
    loadClients();
    const interval = setInterval(refreshData, 60000);
    return () => clearInterval(interval);
  }, []);

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER FUNCTIONS
  // ═══════════════════════════════════════════════════════════════════════════

  const renderDashboard = () => (
    <div>
      <h1 className="page-title">Dashboard</h1>
      <p className="page-subtitle">Platform overview and analytics</p>

      <div className="stats-grid">
        <StatCard label="Total Clients" value={stats.clients} />
        <StatCard label="Total Deposits" value={'$' + fmt(stats.deposits)} />
        <StatCard label="Total Withdrawals" value={'$' + fmt(stats.withdrawals)} />
        <StatCard label="Pending Deposits" value={stats.pending_deposits} color="#fdba74" />
        <StatCard label="Total Profit Paid" value={'$' + fmt(stats.total_profit_paid || 0)} color="#4ade80" />
        <StatCard label="Referral Commissions" value={'$' + fmt(stats.ref_commissions || 0)} color="#d4af37" />
      </div>

      <div className="grid-2">
        <Card title="📊 Deposits vs Withdrawals" subtitle="Monthly transaction summary">
          <div style={{ height: '220px', position: 'relative' }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData.deposits}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(212, 175, 55, 0.15)" />
                <XAxis dataKey="month" stroke="#9ca3af" />
                <YAxis stroke="#9ca3af" />
                <Tooltip contentStyle={{ backgroundColor: '#1a1f3a', border: '1px solid rgba(212, 175, 55, 0.3)' }} />
                <Legend />
                <Bar dataKey="deposits" fill="rgba(74,222,128,0.7)" radius={6} />
                <Bar dataKey="withdrawals" fill="rgba(248,113,113,0.7)" radius={6} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card title="📈 Client Growth" subtitle="Cumulative registrations">
          <div style={{ height: '220px', position: 'relative' }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData.clients}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(212, 175, 55, 0.15)" />
                <XAxis dataKey="day" stroke="#9ca3af" />
                <YAxis stroke="#9ca3af" />
                <Tooltip contentStyle={{ backgroundColor: '#1a1f3a', border: '1px solid rgba(212, 175, 55, 0.3)' }} />
                <Line type="monotone" dataKey="clients" stroke="#d4af37" strokeWidth={2} dot={{ fill: '#d4af37', r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>
    </div>
  );

  const renderPendingDeposits = () => {
    const pending = allTx.filter(t => t.type === 'DEPOSIT' && t.status === 'PENDING');

    if (!pending.length) {
      return <div className="empty">✓ No pending deposits</div>;
    }

    return (
      <table className="tbl">
        <thead>
          <tr>
            <th>Date</th>
            <th>Client</th>
            <th>Amount</th>
            <th>Method</th>
            <th>Reference</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {pending.map(t => (
            <tr key={t.id}>
              <td style={{ color: '#9ca3af', fontSize: '11px' }}>
                {(t.created_at || '').substring(0, 16).replace('T', ' ')}
              </td>
              <td><strong>{escHtml(t.user_name || '—')}</strong></td>
              <td style={{ color: '#4ade80', fontWeight: 'bold' }}>${fmt(t.amount_usd)}</td>
              <td>{escHtml(t.method || '—')}</td>
              <td style={{ fontSize: '11px', color: '#6b7280' }}>{escHtml(t.reference || '—')}</td>
              <td style={{ display: 'flex', gap: '6px' }}>
                <button className="btn-sm btn-green" onClick={() => openApproveModal(t)}>✓ Approve</button>
                <button className="btn-sm btn-danger" onClick={() => openRejectModal(t)}>✗ Reject</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  };

  const renderClients = () => {
    const filtered = allClients.filter(c =>
      (c.name || '').toLowerCase().includes(clientSearch.toLowerCase()) ||
      (c.email || '').toLowerCase().includes(clientSearch.toLowerCase())
    );

    if (!filtered.length) {
      return <div className="empty">No clients yet</div>;
    }

    return (
      <table className="tbl">
        <thead>
          <tr>
            <th>Name</th>
            <th>Email</th>
            <th>Balance</th>
            <th>Equity</th>
            <th>Deposits</th>
            <th>Withdrawals</th>
            <th>Profit</th>
            <th>Ref Earned</th>
            <th>Days Active</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map(c => (
            <tr key={c.id}>
              <td><strong>{escHtml(c.name || '—')}</strong></td>
              <td style={{ fontSize: '11px', color: '#6b7280' }}>{escHtml(c.email || '—')}</td>
              <td style={{ color: '#4ade80', fontWeight: 'bold' }}>{fmtD(c.balance || 0)}</td>
              <td style={{ color: '#d4af37' }}>{fmtD(c.equity || 0)}</td>
              <td>{fmtD(c.total_deposits || 0)}</td>
              <td style={{ color: '#f87171' }}>{fmtD(c.total_withdrawals || 0)}</td>
              <td>{fmtD(c.total_profit || 0)}</td>
              <td style={{ color: '#d4af37' }}>{fmtD(c.total_ref_earned || 0)}</td>
              <td style={{ textAlign: 'center' }}>{c.days_active || 0}</td>
              <td style={{ display: 'flex', gap: '6px' }}>
                <button className="btn-sm" style={{ background: 'rgba(212, 175, 55, 0.2)', color: '#d4af37' }} onClick={() => openEditModal(c)}>✏️ Edit</button>
                <button className="btn-sm btn-danger" onClick={() => openDeleteModal(c)}>🗑️ Delete</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  };

  const renderTransactions = () => {
    const filtered = allTx.filter(t =>
      (!txSearch || (t.user_name || '').toLowerCase().includes(txSearch.toLowerCase()) || (t.reference || '').toLowerCase().includes(txSearch.toLowerCase())) &&
      (!txTypeFilter || t.type === txTypeFilter) &&
      (!txStatusFilter || t.status === txStatusFilter)
    );

    if (!filtered.length) {
      return <div className="empty">No transactions</div>;
    }

    return (
      <table className="tbl">
        <thead>
          <tr>
            <th>Date</th>
            <th>Client</th>
            <th>Type</th>
            <th>Amount</th>
            <th>Method</th>
            <th>Status</th>
            <th>Reference</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map(t => (
            <tr key={t.id}>
              <td style={{ color: '#9ca3af', fontSize: '11px' }}>
                {(t.created_at || '').substring(0, 16).replace('T', ' ')}
              </td>
              <td><strong>{escHtml(t.user_name || '—')}</strong></td>
              <td>{(t.type || '').replace(/_/g, ' ')}</td>
              <td style={{ fontWeight: 'bold' }}>${fmt(t.amount_usd)}</td>
              <td>{escHtml(t.method || '—')}</td>
              <td>
                <span className={`badge badge-${t.status === 'COMPLETED' ? 'success' : t.status === 'PENDING' ? 'pending' : 'danger'}`}>
                  {t.status}
                </span>
              </td>
              <td style={{ fontSize: '11px', color: '#6b7280' }}>{escHtml(t.reference || '—')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  };

  return (
    <div style={styles.container}>
      <style>{globalStyles}</style>

      {/* SIDEBAR OVERLAY (Mobile) */}
      <div
        className="sidebar-overlay"
        style={{ display: sidebarOpen ? 'block' : 'none' }}
        onClick={() => setSidebarOpen(false)}
      />

      {/* SIDEBAR */}
      <Sidebar
        activePage={activePage}
        setActivePage={(page) => {
          setActivePage(page);
          setSidebarOpen(false);
        }}
        onLogout={logout}
        sidebarOpen={sidebarOpen}
      />

      {/* MAIN CONTAINER */}
      <div style={styles.mainContainer}>
        {/* NAVBAR */}
        <Navbar
          pageTitle={getPageTitle(activePage)}
          schedulerRunning={stats.scheduler_running}
          tradestoday={stats.trades_today}
          onMenuClick={() => setSidebarOpen(!sidebarOpen)}
        />

        {/* CONTENT */}
        <div style={styles.content}>
          {successMsg && <Alert type="success" message={successMsg} />}
          {errorMsg && <Alert type="error" message={errorMsg} />}

          {activePage === 'dashboard' && renderDashboard()}

          {activePage === 'deposits' && (
            <Card title="Pending Deposits" subtitle="Approve or reject incoming deposits">
              {renderPendingDeposits()}
            </Card>
          )}

          {activePage === 'clients' && (
            <Card title="Clients" subtitle="Manage user accounts and balances">
              <div className="filter-bar">
                <input
                  type="text"
                  placeholder="Search by name or email..."
                  value={clientSearch}
                  onChange={(e) => setClientSearch(e.target.value)}
                />
              </div>
              {renderClients()}
            </Card>
          )}

          {activePage === 'transactions' && (
            <Card title="Transactions" subtitle="Complete transaction history">
              <div className="filter-bar">
                <input
                  type="text"
                  placeholder="Search name, reference..."
                  value={txSearch}
                  onChange={(e) => setTxSearch(e.target.value)}
                />
                <select value={txTypeFilter} onChange={(e) => setTxTypeFilter(e.target.value)}>
                  <option value="">All Types</option>
                  <option value="DEPOSIT">Deposits</option>
                  <option value="WITHDRAWAL">Withdrawals</option>
                </select>
                <select value={txStatusFilter} onChange={(e) => setTxStatusFilter(e.target.value)}>
                  <option value="">All Statuses</option>
                  <option value="PENDING">Pending</option>
                  <option value="COMPLETED">Completed</option>
                </select>
              </div>
              {renderTransactions()}
            </Card>
          )}

          {activePage === 'adjust' && (
            <div>
              <h1 className="page-title">Manage Accounts</h1>
              <p className="page-subtitle">Adjust balances, create transactions, and manage referrals</p>

              <div className="tab-group">
                <button
                  className={`tab-btn ${adjustTab === 'balance' ? 'active' : ''}`}
                  onClick={() => setAdjustTab('balance')}
                >
                  💰 Balance & Transactions
                </button>
                <button
                  className={`tab-btn ${adjustTab === 'referral' ? 'active' : ''}`}
                  onClick={() => setAdjustTab('referral')}
                >
                  🎁 Create Referral
                </button>
              </div>

              {adjustTab === 'balance' && (
                <Card>
                  <form className="form-wrap" onSubmit={(e) => { e.preventDefault(); submitAdjust(); }}>
                    <div className="form-group">
                      <label>Select Client</label>
                      <select value={adjustClient} onChange={(e) => setAdjustClient(e.target.value)}>
                        <option value="">— Select client —</option>
                        {allClients.map(c => (
                          <option key={c.id} value={c.id}>
                            {c.name} ({c.email}) — ${fmt(c.balance)}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="form-group">
                      <label>Field to Adjust</label>
                      <select value={adjustField} onChange={(e) => setAdjustField(e.target.value)}>
                        <option value="balance">Balance (direct ledger nudge)</option>
                        <option value="equity">Equity (direct ledger nudge)</option>
                        <option value="total_deposits">Total Deposits (creates a real deposit)</option>
                        <option value="total_withdrawals">Total Withdrawals (creates a real withdrawal)</option>
                        <option value="total_profit">Trade Profit</option>
                        <option value="total_ref_earned">Referral Earnings</option>
                      </select>
                    </div>

                    {['total_deposits', 'total_withdrawals'].includes(adjustField) && (
                      <div className="form-group">
                        <label>Method / Network</label>
                        <select value={adjustMethod} onChange={(e) => setAdjustMethod(e.target.value)}>
                          <option value="MANUAL">Manual / Cash</option>
                          <option value="TRC20">USDT — TRC20</option>
                          <option value="BEP20">USDT — BEP20</option>
                          <option value="ERC20">USDT — ERC20</option>
                          <option value="MPESA">M-Pesa</option>
                        </select>
                      </div>
                    )}

                    <div className="form-group">
                      <label>Amount {['total_deposits', 'total_withdrawals'].includes(adjustField) ? '(positive number — a real transaction record is created)' : '(positive = add, negative = subtract)'}</label>
                      <input
                        type="number"
                        placeholder={['total_deposits', 'total_withdrawals'].includes(adjustField) ? 'e.g. 500' : 'e.g. 500 or -200'}
                        value={adjustAmount}
                        onChange={(e) => setAdjustAmount(e.target.value)}
                      />
                    </div>

                    <div className="form-group">
                      <label>Reason / Note</label>
                      <textarea
                        placeholder="e.g. Profit credit, Bonus, Correction..."
                        value={adjustNote}
                        onChange={(e) => setAdjustNote(e.target.value)}
                      />
                    </div>

                    <button type="submit" className="btn btn-primary" style={{ width: '100%' }}>
                      Apply Adjustment
                    </button>
                  </form>
                </Card>
              )}

              {adjustTab === 'referral' && (
                <Card>
                  <form className="form-wrap" onSubmit={(e) => { e.preventDefault(); submitReferral(); }}>
                    <div className="form-group">
                      <label>🎯 Referrer (the person earning)</label>
                      <select value={refReferrer} onChange={(e) => setRefReferrer(e.target.value)}>
                        <option value="">— Select a referrer —</option>
                        {allClients.map(c => (
                          <option key={c.id} value={c.id}>{c.name} ({c.email})</option>
                        ))}
                      </select>
                    </div>

                    <div style={{ padding: '16px', background: 'rgba(212,175,55,0.08)', border: '1px solid var(--border-subtle)', borderRadius: '8px', marginBottom: '16px' }}>
                      <div style={{ fontSize: '12px', fontWeight: '600', marginBottom: '12px', color: '#d4af37' }}>Who is being referred?</div>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 12px', background: 'rgba(15,21,25,0.6)', border: '1px solid var(--border-subtle)', borderRadius: '8px', cursor: 'pointer' }}>
                        <input
                          type="radio"
                          name="refMode"
                          value="existing"
                          checked={refMode === 'existing'}
                          onChange={(e) => setRefMode(e.target.value)}
                        />
                        <span>Link Existing Client</span>
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 12px', background: 'rgba(15,21,25,0.6)', border: '1px solid var(--border-subtle)', borderRadius: '8px', cursor: 'pointer', marginTop: '8px' }}>
                        <input
                          type="radio"
                          name="refMode"
                          value="new"
                          checked={refMode === 'new'}
                          onChange={(e) => setRefMode(e.target.value)}
                        />
                        <span>Create New Member</span>
                      </label>
                    </div>

                    {refMode === 'existing' ? (
                      <div className="form-group">
                        <label>👤 Select Referred Client</label>
                        <select value={refReferred} onChange={(e) => setRefReferred(e.target.value)}>
                          <option value="">— Select client to refer —</option>
                          {allClients.map(c => (
                            <option key={c.id} value={c.id}>{c.name} ({c.email}) — ${fmt(c.balance)}</option>
                          ))}
                        </select>
                      </div>
                    ) : (
                      <>
                        <div className="form-group">
                          <label>👤 New Member Name</label>
                          <input type="text" placeholder="Full name" value={refNewName} onChange={(e) => setRefNewName(e.target.value)} />
                        </div>
                        <div className="form-group">
                          <label>📧 Email Address</label>
                          <input type="email" placeholder="email@example.com" value={refNewEmail} onChange={(e) => setRefNewEmail(e.target.value)} />
                        </div>
                        <div className="form-group">
                          <label>📱 Phone Number</label>
                          <input type="text" placeholder="+254 7xx xxx xxx" value={refNewPhone} onChange={(e) => setRefNewPhone(e.target.value)} />
                        </div>
                        <div className="form-group">
                          <label>🔐 Password</label>
                          <input type="password" placeholder="Min 6 characters" value={refNewPassword} onChange={(e) => setRefNewPassword(e.target.value)} />
                        </div>
                      </>
                    )}

                    <div style={{ padding: '16px', background: 'rgba(212,175,55,0.08)', border: '1px solid var(--border-subtle)', borderRadius: '8px', marginBottom: '16px' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 12px', background: 'rgba(15,21,25,0.6)', border: '1px solid var(--border-subtle)', borderRadius: '8px', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={refCreateDeposit}
                          onChange={(e) => setRefCreateDeposit(e.target.checked)}
                        />
                        <span>💵 Add Initial Deposit</span>
                      </label>
                    </div>

                    {refCreateDeposit && (
                      <>
                        <div className="form-group">
                          <label>Deposit Amount (USD)</label>
                          <input type="number" placeholder="e.g. 500" min="0" value={refDepositAmount} onChange={(e) => setRefDepositAmount(e.target.value)} />
                        </div>
                        <div className="form-group">
                          <label>Deposit Method</label>
                          <select value={refDepositMethod} onChange={(e) => setRefDepositMethod(e.target.value)}>
                            <option value="MANUAL">Manual / Cash</option>
                            <option value="TRC20">USDT — TRC20</option>
                            <option value="BEP20">USDT — BEP20</option>
                            <option value="ERC20">USDT — ERC20</option>
                            <option value="MPESA">M-Pesa</option>
                          </select>
                        </div>
                      </>
                    )}

                    <div className="form-group">
                      <label>📝 Note</label>
                      <textarea placeholder="e.g. Test referral, Team member..." value={refNote} onChange={(e) => setRefNote(e.target.value)} />
                    </div>

                    <button type="submit" className="btn btn-primary" style={{ width: '100%' }}>
                      ✓ Create Referral
                    </button>
                  </form>
                </Card>
              )}
            </div>
          )}
        </div>
      </div>

      {/* MODALS */}
      {showApproveModal && selectedTx && (
        <Modal
          title="✓ Approve Deposit"
          onClose={() => setShowApproveModal(false)}
          onConfirm={confirmApprove}
          confirmText="Approve"
        >
          <div style={{ background: 'rgba(212, 175, 55, 0.1)', border: '1px solid rgba(212, 175, 55, 0.3)', borderRadius: '8px', padding: '14px', marginBottom: '14px', fontSize: '13px', lineHeight: '2' }}>
            <div><span style={{ color: '#9ca3af' }}>Client:</span> <strong>{selectedTx.user_name}</strong></div>
            <div><span style={{ color: '#9ca3af' }}>Amount:</span> <span style={{ color: '#4ade80', fontWeight: 'bold' }}>${fmt(selectedTx.amount_usd)}</span></div>
            <div><span style={{ color: '#9ca3af' }}>Method:</span> <span>{selectedTx.method}</span></div>
            <div><span style={{ color: '#9ca3af' }}>Reference:</span> <span style={{ fontSize: '11px' }}>{selectedTx.reference}</span></div>
          </div>
        </Modal>
      )}

      {showRejectModal && selectedTx && (
        <Modal
          title="✗ Reject Deposit"
          onClose={() => setShowRejectModal(false)}
          onConfirm={confirmReject}
          confirmText="Reject"
          confirmClass="btn-danger"
        >
          <div className="form-group">
            <label>Reason</label>
            <textarea
              placeholder="e.g. Transaction not found..."
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
            />
          </div>
        </Modal>
      )}

      {showEditModal && selectedClient && (
        <Modal
          title="✏ Edit Client"
          onClose={() => setShowEditModal(false)}
          onConfirm={saveClientEdit}
          confirmText="Save Changes"
        >
          <div className="form-group">
            <label>Full Name</label>
            <input
              type="text"
              placeholder="Full name"
              value={editData.name}
              onChange={(e) => setEditData({ ...editData, name: e.target.value })}
            />
          </div>
          <div className="form-group">
            <label>Email</label>
            <input
              type="email"
              placeholder="email@example.com"
              value={editData.email}
              onChange={(e) => setEditData({ ...editData, email: e.target.value })}
            />
          </div>
          <div className="form-group">
            <label>Phone</label>
            <input
              type="text"
              placeholder="+254 7xx xxx xxx"
              value={editData.phone}
              onChange={(e) => setEditData({ ...editData, phone: e.target.value })}
            />
          </div>
        </Modal>
      )}

      {showDeleteModal && selectedClient && (
        <Modal
          title="🗑️ Delete Client"
          onClose={() => setShowDeleteModal(false)}
          onConfirm={confirmDeleteClient}
          confirmText="Yes, Delete Permanently"
          confirmClass="btn-danger"
        >
          <div style={{ background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.3)', borderRadius: '8px', padding: '14px', marginBottom: '14px', fontSize: '13px' }}>
            <strong style={{ color: '#fca5a5' }}>⚠️ WARNING: This action cannot be undone!</strong>
            <p style={{ marginTop: '10px', color: '#d1d5db' }}>All data for <strong>{selectedClient.name}</strong> will be permanently deleted, including:</p>
            <ul style={{ marginTop: '8px', marginLeft: '20px', color: '#9ca3af' }}>
              <li>Account balance</li>
              <li>Transaction history</li>
              <li>Trade records</li>
              <li>Referral data</li>
            </ul>
          </div>
        </Modal>
      )}
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════

const Sidebar = ({ activePage, setActivePage, onLogout, sidebarOpen }) => (
  <div style={{ ...styles.sidebar, left: sidebarOpen ? 0 : undefined }}>
    <div className="sidebar-header">
      <div className="sidebar-brand">◆ ASCEND CAPITAL</div>
      <div className="admin-badge">🔐 ADMIN</div>
    </div>

    <div className="sidebar-nav">
      <NavItem icon="📊" label="Dashboard" active={activePage === 'dashboard'} onClick={() => setActivePage('dashboard')} />
      <NavItem icon="📥" label="Pending Deposits" active={activePage === 'deposits'} onClick={() => setActivePage('deposits')} />
      <NavItem icon="👥" label="Clients" active={activePage === 'clients'} onClick={() => setActivePage('clients')} />
      <NavItem icon="💱" label="Transactions" active={activePage === 'transactions'} onClick={() => setActivePage('transactions')} />
      <NavItem icon="⚙️" label="Manage Accounts" active={activePage === 'adjust'} onClick={() => setActivePage('adjust')} />
    </div>

    <div className="sidebar-footer">
      <button onClick={onLogout}>Logout</button>
    </div>
  </div>
);

const NavItem = ({ icon, label, active, onClick }) => (
  <div
    onClick={onClick}
    style={{
      padding: '14px 20px',
      margin: '4px 10px',
      borderRadius: '8px',
      cursor: 'pointer',
      fontSize: '13px',
      fontWeight: '500',
      color: active ? '#d4af37' : '#9ca3af',
      background: active ? 'rgba(212, 175, 55, 0.15)' : 'transparent',
      borderLeft: active ? '3px solid #d4af37' : '3px solid transparent',
      paddingLeft: active ? '17px' : '20px',
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
      transition: 'all 0.2s',
    }}
  >
    <span style={{ fontSize: '16px', width: '20px', textAlign: 'center' }}>{icon}</span>
    <span>{label}</span>
  </div>
);

const Navbar = ({ pageTitle, schedulerRunning, tradestoday, onMenuClick }) => (
  <div style={styles.navbar}>
    <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
      <button onClick={onMenuClick} style={{ display: 'none', background: 'none', border: 'none', color: '#e8e8e8', fontSize: '24px', cursor: 'pointer', padding: '8px' }} id="menuBtn">☰</button>
      <div style={{ fontSize: '14px', fontWeight: '600', color: '#e8e8e8' }}>{pageTitle}</div>
    </div>
    <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '11px', padding: '6px 12px', borderRadius: '20px', border: '1px solid rgba(212, 175, 55, 0.3)', color: '#9ca3af', background: 'rgba(212, 175, 55, 0.05)' }}>
        <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: schedulerRunning ? '#4ade80' : 'rgba(212, 175, 55, 0.4)', boxShadow: schedulerRunning ? '0 0 6px #4ade80' : 'none' }} />
        <span>{schedulerRunning ? `Scheduler: running (${tradestoday} trades today)` : 'Scheduler: not running'}</span>
      </span>
    </div>
  </div>
);

const Card = ({ title, subtitle, children }) => (
  <div className="card">
    {title && <div className="card-title">{title}</div>}
    {subtitle && <div className="card-subtitle">{subtitle}</div>}
    {children}
  </div>
);

const StatCard = ({ label, value, color }) => (
  <div className="stat-card">
    <div className="stat-label">{label}</div>
    <div className="stat-value" style={color ? { color } : {}}>{value}</div>
  </div>
);

const Alert = ({ type, message }) => (
  <div className={`alert alert-${type} show`}>
    {type === 'success' ? '✓ ' : '✗ '}{message}
  </div>
);

const Modal = ({ title, children, onClose, onConfirm, confirmText, confirmClass }) => (
  <div className="modal-overlay show" onClick={onClose}>
    <div className="modal" onClick={(e) => e.stopPropagation()}>
      <h3>{title}</h3>
      {children}
      <div className="modal-btns">
        <button className="btn btn-sm" style={{ background: 'rgba(107,114,128,0.2)', color: '#d1d5db' }} onClick={onClose}>Cancel</button>
        <button className={`btn btn-sm ${confirmClass || 'btn-primary'}`} onClick={onConfirm}>{confirmText}</button>
      </div>
    </div>
  </div>
);

const getPageTitle = (page) => {
  const titles = {
    dashboard: 'Dashboard',
    deposits: 'Pending Deposits',
    clients: 'Clients',
    transactions: 'Transactions',
    adjust: 'Manage Accounts'
  };
  return titles[page] || 'Dashboard';
};

// ═══════════════════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════════════════

const globalStyles = `
  * { margin: 0; padding: 0; box-sizing: border-box; }

  :root {
    --primary-gold: #d4af37;
    --gold-bright: #f0d96e;
    --dark-bg: #0a0e27;
    --card-bg: #1a1f3a;
    --field-bg: #10142c;
    --accent-green: #4ade80;
    --accent-red: #f87171;
    --text-light: #e8e8e8;
    --text-muted: #9ca3af;
    --border-subtle: rgba(212, 175, 55, 0.15);
  }

  body {
    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    background: var(--dark-bg);
    color: var(--text-light);
  }

  .page-title {
    font-size: 28px;
    font-weight: 700;
    margin-bottom: 8px;
  }

  .page-subtitle {
    font-size: 13px;
    color: #6b7280;
    margin-bottom: 24px;
  }

  .stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 16px;
    margin-bottom: 30px;
  }

  .stat-card {
    background: rgba(30,41,59,0.6);
    border: 1px solid var(--border-subtle);
    border-radius: 12px;
    padding: 20px;
    backdrop-filter: blur(10px);
    transition: all 0.2s;
  }

  .stat-card:hover {
    border-color: rgba(212, 175, 55, 0.3);
    background: rgba(30,41,59,0.8);
  }

  .stat-label {
    font-size: 11px;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.8px;
    margin-bottom: 8px;
  }

  .stat-value {
    font-size: 28px;
    font-weight: 700;
    background: linear-gradient(135deg, var(--primary-gold), var(--gold-bright));
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }

  .card {
    background: rgba(30,41,59,0.6);
    border: 1px solid var(--border-subtle);
    border-radius: 12px;
    padding: 24px;
    backdrop-filter: blur(10px);
    margin-bottom: 20px;
    transition: all 0.2s;
  }

  .card:hover {
    border-color: rgba(212, 175, 55, 0.25);
  }

  .card-title {
    font-size: 16px;
    font-weight: 600;
    color: var(--text-light);
    margin-bottom: 4px;
  }

  .card-subtitle {
    font-size: 12px;
    color: #6b7280;
    margin-bottom: 16px;
  }

  .grid-2 {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 20px;
    margin-bottom: 20px;
  }

  .form-group {
    margin-bottom: 16px;
  }

  .form-group label {
    display: block;
    font-size: 12px;
    color: var(--text-muted);
    margin-bottom: 6px;
    font-weight: 600;
  }

  .form-group input, .form-group select, .form-group textarea {
    width: 100%;
    padding: 10px 12px;
    background: rgba(15,21,25,0.6);
    border: 1px solid var(--border-subtle);
    color: var(--text-light);
    border-radius: 8px;
    font-size: 13px;
    transition: all 0.2s;
  }

  .form-group input:focus, .form-group select:focus, .form-group textarea:focus {
    outline: none;
    border-color: var(--primary-gold);
    background: rgba(15,21,25,0.8);
    box-shadow: 0 0 0 3px rgba(212, 175, 55, 0.15);
  }

  .form-group textarea {
    resize: vertical;
    height: 80px;
  }

  .form-wrap {
    max-width: 500px;
  }

  .btn {
    padding: 10px 20px;
    border: none;
    border-radius: 8px;
    cursor: pointer;
    font-size: 13px;
    font-weight: 600;
    transition: all 0.2s;
  }

  .btn-primary {
    background: linear-gradient(135deg, var(--primary-gold), var(--gold-bright));
    color: var(--dark-bg);
  }

  .btn-primary:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(212, 175, 55, 0.3);
  }

  .btn-sm {
    padding: 8px 14px;
    font-size: 12px;
    border-radius: 6px;
    border: none;
    cursor: pointer;
    font-weight: 600;
  }

  .btn-green {
    background: rgba(74,222,128,0.2);
    color: #86efac;
    border: 1px solid rgba(74,222,128,0.3);
  }

  .btn-green:hover {
    background: rgba(74,222,128,0.3);
  }

  .btn-danger {
    background: rgba(248,113,113,0.2);
    color: #fca5a5;
    border: 1px solid rgba(248,113,113,0.3);
  }

  .btn-danger:hover {
    background: rgba(248,113,113,0.3);
  }

  .alert {
    padding: 12px 16px;
    border-radius: 8px;
    margin-bottom: 16px;
    font-size: 13px;
    display: none;
    animation: slideIn 0.25s ease;
  }

  .alert.show {
    display: block;
  }

  @keyframes slideIn {
    from { opacity: 0; transform: translateY(-8px); }
    to { opacity: 1; transform: translateY(0); }
  }

  .alert-success {
    background: rgba(74,222,128,0.1);
    border: 1px solid rgba(74,222,128,0.3);
    color: #86efac;
  }

  .alert-error {
    background: rgba(248,113,113,0.1);
    border: 1px solid rgba(248,113,113,0.3);
    color: #fca5a5;
  }

  .tbl {
    width: 100%;
    border-collapse: collapse;
    font-size: 12px;
  }

  .tbl th {
    padding: 12px;
    text-align: left;
    color: var(--text-muted);
    background: rgba(212, 175, 55, 0.08);
    border-bottom: 1px solid var(--border-subtle);
    font-weight: 600;
    text-transform: uppercase;
    font-size: 11px;
    letter-spacing: 0.5px;
  }

  .tbl td {
    padding: 12px;
    border-bottom: 1px solid rgba(148,163,184,0.05);
  }

  .tbl tr:hover {
    background: rgba(212, 175, 55, 0.06);
  }

  .badge {
    display: inline-block;
    padding: 4px 10px;
    border-radius: 6px;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
  }

  .badge-success {
    background: rgba(74,222,128,0.2);
    color: #86efac;
  }

  .badge-pending {
    background: rgba(251,146,60,0.2);
    color: #fdba74;
  }

  .badge-danger {
    background: rgba(248,113,113,0.2);
    color: #fca5a5;
  }

  .badge-info {
    background: rgba(212, 175, 55, 0.2);
    color: var(--primary-gold);
  }

  .empty {
    text-align: center;
    padding: 40px 20px;
    color: #6b7280;
  }

  .filter-bar {
    display: flex;
    gap: 10px;
    margin-bottom: 15px;
    flex-wrap: wrap;
    align-items: center;
  }

  .filter-bar input, .filter-bar select {
    background: rgba(15,21,25,0.6);
    border: 1px solid var(--border-subtle);
    color: var(--text-light);
    padding: 8px 12px;
    border-radius: 8px;
    font-size: 12px;
    transition: all 0.2s;
  }

  .filter-bar input:focus, .filter-bar select:focus {
    border-color: var(--primary-gold);
    outline: none;
    box-shadow: 0 0 0 3px rgba(212, 175, 55, 0.1);
  }

  .modal-overlay {
    display: none;
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.75);
    z-index: 1000;
    justify-content: center;
    align-items: center;
  }

  .modal-overlay.show {
    display: flex;
  }

  .modal {
    background: rgba(30,41,59,0.95);
    border: 1px solid rgba(212, 175, 55, 0.3);
    border-radius: 12px;
    padding: 28px;
    width: 480px;
    max-width: 95vw;
    max-height: 90vh;
    overflow-y: auto;
    backdrop-filter: blur(10px);
  }

  .modal h3 {
    background: linear-gradient(135deg, var(--primary-gold), var(--gold-bright));
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    margin-bottom: 18px;
    font-size: 15px;
  }

  .modal-btns {
    display: flex;
    gap: 10px;
    margin-top: 18px;
    justify-content: flex-end;
  }

  .tab-group {
    display: flex;
    gap: 10px;
    margin-bottom: 20px;
    border-bottom: 1px solid var(--border-subtle);
  }

  .tab-btn {
    padding: 12px 16px;
    background: none;
    border: none;
    color: var(--text-muted);
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
    border-bottom: 2px solid transparent;
  }

  .tab-btn:hover {
    color: var(--gold-bright);
  }

  .tab-btn.active {
    color: var(--primary-gold);
    border-bottom-color: var(--primary-gold);
  }

  .sidebar-overlay {
    display: none;
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.6);
    z-index: 999;
  }

  @media (max-width: 768px) {
    .grid-2 { grid-template-columns: 1fr; }
    .stats-grid { grid-template-columns: repeat(2, 1fr); gap: 12px; }
  }

  @media (max-width: 480px) {
    .page-title { font-size: 20px; }
    .stats-grid { grid-template-columns: 1fr; }
    .stat-value { font-size: 18px; }
    .modal { width: 95vw; padding: 16px; }
  }
`;

const styles = {
  container: {
    display: 'flex',
    height: '100vh',
    overflow: 'hidden',
    fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
    background: '#0a0e27',
    color: '#e8e8e8'
  },
  sidebar: {
    width: '260px',
    background: 'linear-gradient(180deg, #151a27 0%, #0f1419 100%)',
    borderRight: '1px solid rgba(212, 175, 55, 0.15)',
    display: 'flex',
    flexDirection: 'column',
    boxShadow: '2px 0 8px rgba(0,0,0,0.3)',
    overflowY: 'auto'
  },
  mainContainer: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden'
  },
  navbar: {
    background: 'linear-gradient(135deg, #151a27 0%, #0f1419 100%)',
    padding: '16px 40px',
    borderBottom: '1px solid rgba(212, 175, 55, 0.15)',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    boxShadow: '0 2px 8px rgba(0,0,0,0.3)'
  },
  content: {
    flex: 1,
    overflowY: 'auto',
    padding: '30px 40px'
  }
};

export default AdminDashboard;
