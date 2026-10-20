import { useState, useEffect } from 'react';
import './App.css';
import DepositCard from './components/DepositCard';
import ClaimProfitButton from './components/ClaimProfitButton';

export default function App() {
  const [account, setAccount] = useState(null);
  const [loading, setLoading] = useState(true);
  const [balance, setBalance] = useState(0);
  const [transactions, setTransactions] = useState([]);
  const [deposits, setDeposits] = useState([]);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ type: 'deposit', amount: '', reference: '' });
  const [submitting, setSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');
  const [referralCode, setReferralCode] = useState('');
  const [referralStats, setReferralStats] = useState(null);
  const [weeklySalary, setWeeklySalary] = useState(null);

  const API_URL = import.meta.env.VITE_API_URL || 'https://ascend-capital-api.onrender.com';

  // Fetch account info
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const res = await fetch(`${API_URL}/api/auth/me`, { credentials: 'include' });
        if (!res.ok) {
          setAccount(null);
          setLoading(false);
          return;
        }
        const data = await res.json();
        setAccount(data.account);
        if (data.account) {
          await Promise.all([
            fetchAccountBalance(),
            fetchTransactions(),
            fetchDeposits(),
            fetchReferralCode(),
            fetchReferralStats(),
            fetchWeeklySalary()
          ]);
        }
      } catch (err) {
        console.error('Auth check failed:', err);
        setError('Account service is unavailable: ' + err.message);
      } finally {
        setLoading(false);
      }
    };
    checkAuth();
  }, []);

  const fetchAccountBalance = async () => {
    try {
      const res = await fetch(`${API_URL}/api/transactions`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setBalance(data.balance || 0);
      }
    } catch (err) {
      console.error('Error fetching balance:', err);
    }
  };

  const fetchTransactions = async () => {
    try {
      const res = await fetch(`${API_URL}/api/transactions`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setTransactions(data.transactions || []);
      }
    } catch (err) {
      console.error('Error fetching transactions:', err);
    }
  };

  const fetchDeposits = async () => {
    try {
      const res = await fetch(`${API_URL}/api/deposits`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setDeposits(data.deposits || []);
      }
    } catch (err) {
      console.error('Error fetching deposits:', err);
    }
  };

  const fetchReferralCode = async () => {
    try {
      const res = await fetch(`${API_URL}/api/referrals/code`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setReferralCode(data.code);
      }
    } catch (err) {
      console.error('Error fetching referral code:', err);
    }
  };

  const fetchReferralStats = async () => {
    try {
      const res = await fetch(`${API_URL}/api/referrals/stats`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setReferralStats(data);
      }
    } catch (err) {
      console.error('Error fetching referral stats:', err);
    }
  };

  const fetchWeeklySalary = async () => {
    try {
      const res = await fetch(`${API_URL}/api/referrals/weekly-salary`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setWeeklySalary(data);
      }
    } catch (err) {
      console.error('Error fetching weekly salary:', err);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');

    try {
      const res = await fetch(`${API_URL}/api/transactions`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: form.type,
          amount: parseFloat(form.amount),
          reference: form.reference,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        setError(errorData.error);
        return;
      }

      setForm({ type: 'deposit', amount: '', reference: '' });
      await fetchAccountBalance();
      await fetchTransactions();
      await fetchDeposits();
    } catch (err) {
      setError('Failed to submit transaction: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleLogout = async () => {
    try {
      await fetch(`${API_URL}/api/auth/logout`, { method: 'POST', credentials: 'include' });
      setAccount(null);
    } catch (err) {
      console.error('Logout failed:', err);
    }
  };

  if (loading) {
    return <div className="loading">Loading...</div>;
  }

  if (!account) {
    return <LoginPage apiUrl={API_URL} onLogin={() => window.location.reload()} />;
  }

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-content">
          <h1>🚀 Ascend Capital</h1>
          <div className="header-actions">
            <span className="user-email">{account.email}</span>
            <button onClick={handleLogout} className="logout-btn">Logout</button>
          </div>
        </div>
      </header>

      <div className="app-container">
        <nav className="tab-nav">
          <button
            className={`tab-btn ${activeTab === 'overview' ? 'active' : ''}`}
            onClick={() => setActiveTab('overview')}
          >
            Overview
          </button>
          <button
            className={`tab-btn ${activeTab === 'deposits' ? 'active' : ''}`}
            onClick={() => setActiveTab('deposits')}
          >
            Deposit Plans
          </button>
          <button
            className={`tab-btn ${activeTab === 'referrals' ? 'active' : ''}`}
            onClick={() => setActiveTab('referrals')}
          >
            Referrals & Ranks
          </button>
          <button
            className={`tab-btn ${activeTab === 'transactions' ? 'active' : ''}`}
            onClick={() => setActiveTab('transactions')}
          >
            Transactions
          </button>
        </nav>

        <main className="app-main">
          {error && <div className="error-banner">{error}</div>}

          {/* OVERVIEW TAB */}
          {activeTab === 'overview' && (
            <section className="tab-content">
              <div className="overview-grid">
                <div className="card balance-card">
                  <div className="card-label">Available Balance</div>
                  <div className="card-value">${balance.toFixed(2)}</div>
                  <div className="card-currency">USD</div>
                </div>

                {weeklySalary && weeklySalary.tier && (
                  <div className="card salary-card">
                    <div className="card-label">Weekly Salary</div>
                    <div className="card-value">${weeklySalary.weeklySalary}</div>
                    <div className="card-currency">{weeklySalary.tier}</div>
                  </div>
                )}

                {referralStats && (
                  <div className="card referral-card">
                    <div className="card-label">Direct Referrals</div>
                    <div className="card-value">{referralStats.directReferrals}</div>
                    <div className="card-currency">Active</div>
                  </div>
                )}
              </div>

              {/* YOUR ACTIVE DEPOSITS SECTION */}
              {deposits && deposits.length > 0 && (
                <section className="section-block" style={{marginTop: '40px'}}>
                  <div className="section-heading">
                    <div><div className="eyebrow"><span className="eyebrow-line" /> YOUR ACTIVE DEPOSITS</div><h2>Manage your deposits</h2><p className="section-subtitle">View your locked plans, claim daily profits, and manually trigger trades.</p></div>
                    <span className="count-tag">{deposits.length} deposit{deposits.length === 1 ? '' : 's'} <span className="count-dot" /></span>
                  </div>
                  {deposits.map(deposit => (
                    <DepositCard
                      key={deposit.id}
                      deposit={deposit}
                      apiUrl={API_URL}
                      onClaimed={() => {
                        fetchAccountBalance();
                      }}
                    />
                  ))}
                </section>
              )}

              {/* TRANSACTION FORM */}
              <section className="section-block" style={{marginTop: '40px'}}>
                <h2>New Transaction</h2>
                <form onSubmit={handleSubmit} className="transaction-form">
                  <div className="form-group">
                    <label>Type:</label>
                    <select
                      value={form.type}
                      onChange={(e) => setForm({ ...form, type: e.target.value })}
                      className="form-input"
                    >
                      <option value="deposit">Deposit</option>
                      <option value="withdrawal">Withdrawal</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label>Amount (USD):</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={form.amount}
                      onChange={(e) => setForm({ ...form, amount: e.target.value })}
                      className="form-input"
                      placeholder="0.00"
                    />
                  </div>

                  <div className="form-group">
                    <label>Reference:</label>
                    <input
                      type="text"
                      value={form.reference}
                      onChange={(e) => setForm({ ...form, reference: e.target.value })}
                      className="form-input"
                      placeholder={form.type === 'deposit' ? 'Payment reference' : 'Withdrawal destination'}
                    />
                  </div>

                  <button type="submit" disabled={submitting} className="btn-primary">
                    {submitting ? 'Submitting...' : 'Submit'}
                  </button>
                </form>
              </section>
            </section>
          )}

          {/* DEPOSITS TAB */}
          {activeTab === 'deposits' && (
            <section className="tab-content">
              <h2>Your Deposits</h2>
              {deposits.length === 0 ? (
                <p>No deposits yet.</p>
              ) : (
                <div className="deposits-list">
                  {deposits.map(deposit => (
                    <DepositCard
                      key={deposit.id}
                      deposit={deposit}
                      apiUrl={API_URL}
                      onClaimed={() => {
                        fetchAccountBalance();
                      }}
                    />
                  ))}
                </div>
              )}
            </section>
          )}

          {/* REFERRALS TAB */}
          {activeTab === 'referrals' && (
            <section className="tab-content">
              <h2>Referral Program</h2>
              {referralCode && (
                <div className="card referral-info">
                  <p><strong>Your Referral Code:</strong> {referralCode}</p>
                  <button onClick={() => navigator.clipboard.writeText(referralCode)} className="btn-secondary">
                    Copy Code
                  </button>
                </div>
              )}
              {referralStats && (
                <div className="referral-stats">
                  <div className="stat">
                    <span>Direct Referrals:</span>
                    <strong>{referralStats.directReferrals}</strong>
                  </div>
                  <div className="stat">
                    <span>Team Total:</span>
                    <strong>{referralStats.teamTotal}</strong>
                  </div>
                  <div className="stat">
                    <span>Current Tier:</span>
                    <strong>{referralStats.tier || 'None'}</strong>
                  </div>
                  <div className="stat">
                    <span>Commission Rate:</span>
                    <strong>{(referralStats.commissionRate * 100).toFixed(0)}%</strong>
                  </div>
                  <div className="stat">
                    <span>Total Earnings:</span>
                    <strong>${referralStats.totalEarnings.toFixed(2)}</strong>
                  </div>
                </div>
              )}
            </section>
          )}

          {/* TRANSACTIONS TAB */}
          {activeTab === 'transactions' && (
            <section className="tab-content">
              <h2>Transaction History</h2>
              {transactions.length === 0 ? (
                <p>No transactions yet.</p>
              ) : (
                <table className="transactions-table">
                  <thead>
                    <tr>
                      <th>Type</th>
                      <th>Amount</th>
                      <th>Status</th>
                      <th>Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.map((tx) => (
                      <tr key={tx.id}>
                        <td>{tx.type}</td>
                        <td>${tx.amount.toFixed(2)}</td>
                        <td><span className={`status ${tx.status}`}>{tx.status}</span></td>
                        <td>{new Date(tx.createdAt).toLocaleDateString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          )}
        </main>
      </div>
    </div>
  );
}

function LoginPage({ apiUrl, onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');

    try {
      const res = await fetch(`${apiUrl}/api/auth/login`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error);
        return;
      }

      onLogin();
    } catch (err) {
      setError('Login failed: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-box">
        <h1>🚀 Ascend Capital</h1>
        <p>Member Account</p>
        <p className="subtitle">Sign in to manage your member profile and process real transactions.</p>

        {error && <div className="error-banner">{error}</div>}

        <form onSubmit={handleLogin} className="login-form">
          <div className="form-group">
            <label>Email address</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="form-input"
              placeholder="your@email.com"
            />
          </div>

          <div className="form-group">
            <label>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="form-input"
              placeholder="••••••••"
            />
          </div>

          <button type="submit" disabled={submitting} className="btn-primary">
            {submitting ? 'Signing in...' : 'Sign in'}
          </button>
        </form>

        <p className="footer-note">🔒 Secure authentication. Real transactions.</p>
      </div>
    </div>
  );
}
