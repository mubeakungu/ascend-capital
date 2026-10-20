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
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {paths[name]}
    </svg>
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
              background: 'var(--card)',
              border: '1px solid var(--line)',
              borderRadius: '8px',
              padding: '14px',
              fontSize: '13px',
            }}
          >
            <div style={{ marginBottom: '8px' }}>
              <strong style={{ color: 'var(--text)' }}>{member.name}</strong>
              <div style={{ color: 'var(--muted)', fontSize: '11px', marginTop: '2px' }}>{member.email}</div>
            </div>
            <div style={{ fontSize: '12px', color: 'var(--gold)', fontWeight: '600' }}>
              Deposits: USD {Number(member.totalDeposits || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div style={{ color: 'var(--muted)', fontSize: '11px', marginTop: '6px' }}>
              Joined: {new Date(member.signedUpAt).toLocaleDateString()}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

async function requestApi(endpoint, options = {}) {
  const init = {
    method: options.method || 'GET',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
  };
  if (options.body) init.body = JSON.stringify(options.body);

  const res = await fetch(endpoint, init);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

export default function App() {
  const [account, setAccount] = useState(null);
  const [tab, setTab] = useState('overview');
  const [transactions, setTransactions] = useState([]);
  const [referralStats, setReferralStats] = useState(null);
  const [balance, setBalance] = useState(0);
  const [deposits, setDeposits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [depositAmount, setDepositAmount] = useState('');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [reference, setReference] = useState('');
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [earningsActive, setEarningsActive] = useState(false);
  const [earningsStartTime, setEarningsStartTime] = useState(null);
  const [dailyIncome, setDailyIncome] = useState(0);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      setError('');
      try {
        const accountData = await requestApi('/api/auth/me');
        setAccount(accountData.account);

        if (accountData.account) {
          const [txData, referralData] = await Promise.all([
            requestApi('/api/transactions'),
            requestApi('/api/referrals/stats'),
          ]);

          setTransactions(txData.transactions || []);
          setBalance(txData.balance || 0);
          setEarningsActive(txData.earningsActive || false);
          setEarningsStartTime(txData.earningsStartTime || null);
          setDailyIncome(txData.dailyIncome || 0);
          setReferralStats(referralData);

          const approvedDeposits = txData.transactions?.filter(
            (t) => t.type === 'Deposit' && t.status === 'approved'
          ) || [];
          setDeposits(approvedDeposits);
        }
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  const handleDeposit = async (e) => {
    e.preventDefault();
    try {
      const amount = parseFloat(depositAmount);
      if (!amount || !reference) throw new Error('Fill all fields');

      await requestApi('/api/transactions', {
        method: 'POST',
        body: { type: 'deposit', amount, reference },
      });

      setDepositAmount('');
      setReference('');
      setError('');
      const txData = await requestApi('/api/transactions');
      setTransactions(txData.transactions || []);
      setBalance(txData.balance || 0);
    } catch (e) {
      setError(e.message);
    }
  };

  const handleWithdraw = async (e) => {
    e.preventDefault();
    try {
      const amount = parseFloat(withdrawAmount);
      if (!amount) throw new Error('Enter an amount');
      if (amount > balance) throw new Error('Insufficient balance');

      await requestApi('/api/transactions', {
        method: 'POST',
        body: { type: 'withdrawal', amount, reference: 'User withdrawal' },
      });

      setWithdrawAmount('');
      setError('');
      const txData = await requestApi('/api/transactions');
      setTransactions(txData.transactions || []);
      setBalance(txData.balance || 0);
    } catch (e) {
      setError(e.message);
    }
  };

  const handleLogout = async () => {
    try {
      await requestApi('/api/auth/logout', { method: 'POST' });
      setAccount(null);
      setTransactions([]);
      setBalance(0);
    } catch (e) {
      console.error('Logout failed:', e);
    }
  };

  if (loading) {
    return <div style={{ display: 'grid', placeItems: 'center', minHeight: '100vh' }}>Loading…</div>;
  }

  if (!account) {
    return <div style={{ display: 'grid', placeItems: 'center', minHeight: '100vh' }}>Please sign in</div>;
  }

  const tradingData = generateTradingData();

  return (
    <div style={{ background: 'var(--bg)', color: 'var(--text)', minHeight: '100vh', fontFamily: 'system-ui' }}>
      <style>{`
        :root {
          --bg: #0b100e;
          --card: #111815;
          --line: #1f2a24;
          --text: #e8efe9;
          --muted: #8a9a90;
          --gold: #b5ee6a;
          --accent: #b5ee6a;
          --bad: #ff8a7a;
        }
        body { margin: 0; padding: 0; }
        * { box-sizing: border-box; }
      `}</style>

      <header style={{ borderBottom: '1px solid var(--line)', padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--card)' }}>
        <h1 style={{ margin: 0, fontSize: '20px' }}>ascend</h1>
        <nav style={{ display: 'flex', gap: '20px', flex: 1, marginLeft: '40px' }}>
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setTab(item.id)}
              style={{
                background: 'none',
                border: 'none',
                color: tab === item.id ? 'var(--gold)' : 'var(--muted)',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: tab === item.id ? '600' : '400',
              }}
            >
              {item.label}
            </button>
          ))}
        </nav>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <span style={{ fontSize: '12px', color: 'var(--muted)' }}>{account.email}</span>
          <button
            onClick={handleLogout}
            style={{
              background: 'transparent',
              border: '1px solid var(--line)',
              color: 'var(--text)',
              padding: '6px 12px',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '12px',
            }}
          >
            Sign out
          </button>
        </div>
      </header>

      <main style={{ maxWidth: '1200px', margin: '0 auto', padding: '24px 16px' }}>
        {error && <div style={{ background: 'rgba(255, 138, 122, 0.1)', color: 'var(--bad)', padding: '12px', borderRadius: '6px', marginBottom: '16px' }}>{error}</div>}

        {tab === 'overview' && (
          <section>
            <div style={{ marginBottom: '32px' }}>
              <p style={{ color: 'var(--muted)', fontSize: '12px', margin: '0 0 8px' }}>BALANCE</p>
              <h2 style={{ margin: 0, fontSize: '40px', color: 'var(--gold)' }}>USD {balance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</h2>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px', marginBottom: '32px' }}>
              <article style={{ background: 'var(--card)', border: '1px solid var(--line)', padding: '20px', borderRadius: '8px' }}>
                <h3 style={{ margin: '0 0 16px', fontSize: '14px', color: 'var(--muted)', textTransform: 'uppercase' }}>Deposit</h3>
                <form onSubmit={handleDeposit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="Amount (USD)"
                    value={depositAmount}
                    onChange={(e) => setDepositAmount(e.target.value)}
                    style={{
                      background: 'rgba(0,0,0,0.2)',
                      border: '1px solid var(--line)',
                      color: 'var(--text)',
                      padding: '10px',
                      borderRadius: '4px',
                    }}
                  />
                  <input
                    type="text"
                    placeholder="Payment reference"
                    value={reference}
                    onChange={(e) => setReference(e.target.value)}
                    style={{
                      background: 'rgba(0,0,0,0.2)',
                      border: '1px solid var(--line)',
                      color: 'var(--text)',
                      padding: '10px',
                      borderRadius: '4px',
                    }}
                  />
                  <button
                    type="submit"
                    style={{
                      background: 'var(--gold)',
                      color: '#0b100e',
                      border: 'none',
                      padding: '10px',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontWeight: '600',
                    }}
                  >
                    Deposit
                  </button>
                </form>
              </article>

              <article style={{ background: 'var(--card)', border: '1px solid var(--line)', padding: '20px', borderRadius: '8px' }}>
                <h3 style={{ margin: '0 0 16px', fontSize: '14px', color: 'var(--muted)', textTransform: 'uppercase' }}>Withdraw</h3>
                <form onSubmit={handleWithdraw} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="Amount (USD)"
                    value={withdrawAmount}
                    onChange={(e) => setWithdrawAmount(e.target.value)}
                    style={{
                      background: 'rgba(0,0,0,0.2)',
                      border: '1px solid var(--line)',
                      color: 'var(--text)',
                      padding: '10px',
                      borderRadius: '4px',
                    }}
                  />
                  <button
                    type="submit"
                    style={{
                      background: 'var(--bad)',
                      color: '#fff',
                      border: 'none',
                      padding: '10px',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontWeight: '600',
                    }}
                  >
                    Withdraw
                  </button>
                </form>
              </article>

              <article style={{ background: 'var(--card)', border: '1px solid var(--line)', padding: '20px', borderRadius: '8px' }}>
                <h3 style={{ margin: '0 0 16px', fontSize: '14px', color: 'var(--muted)', textTransform: 'uppercase' }}>Earnings Status</h3>
                {earningsActive ? (
                  <div>
                    <p style={{ margin: '0 0 8px', fontSize: '12px', color: 'var(--gold)', fontWeight: '600' }}>✓ Active</p>
                    <p style={{ margin: '0', fontSize: '14px', color: 'var(--text)' }}>Daily income: USD {dailyIncome.toFixed(2)}</p>
                  </div>
                ) : (
                  <div>
                    <p style={{ margin: '0 0 8px', fontSize: '12px', color: 'var(--bad)' }}>Starts: {earningsStartTime || 'After next deposit'}</p>
                  </div>
                )}
              </article>
            </div>

            {/* ✅ FIXED: REFERRED MEMBERS NOW ALWAYS RENDER (NO CONDITIONAL GATE) */}
            {account && (
              <ReferredMembersList />
            )}

            <div style={{ marginTop: '32px' }}>
              <h3 style={{ margin: '0 0 16px', fontSize: '14px', color: 'var(--muted)', textTransform: 'uppercase' }}>Recent Activity</h3>
              <div style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: '8px', overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--line)' }}>
                      <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', color: 'var(--muted)' }}>Type</th>
                      <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', color: 'var(--muted)' }}>Amount</th>
                      <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', color: 'var(--muted)' }}>Status</th>
                      <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', color: 'var(--muted)' }}>Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.slice(0, 10).map((tx) => (
                      <tr key={tx.id} style={{ borderBottom: '1px solid var(--line)' }}>
                        <td style={{ padding: '12px', fontSize: '13px' }}>{tx.type}</td>
                        <td style={{ padding: '12px', fontSize: '13px' }}>USD {(tx.amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                        <td style={{ padding: '12px', fontSize: '13px', color: tx.status === 'approved' ? 'var(--gold)' : 'var(--muted)' }}>{tx.status}</td>
                        <td style={{ padding: '12px', fontSize: '13px', color: 'var(--muted)' }}>{new Date(tx.createdAt).toLocaleDateString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        )}

        {tab === 'deposits' && (
          <section>
            <h2 style={{ marginBottom: '24px' }}>Deposit Plans</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
              {plans.map((plan) => (
                <article key={plan.deposit} style={{ background: 'var(--card)', border: '1px solid var(--line)', padding: '20px', borderRadius: '8px' }}>
                  <div style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '8px' }}>Deposit</div>
                  <div style={{ fontSize: '24px', color: 'var(--gold)', fontWeight: '600', marginBottom: '16px' }}>USD {plan.deposit.toLocaleString()}</div>
                  <div style={{ fontSize: '13px', marginBottom: '12px' }}>
                    <div style={{ color: 'var(--muted)' }}>Daily Profit</div>
                    <div style={{ color: 'var(--text)', fontSize: '16px', fontWeight: '600' }}>USD {plan.dailyIncome}</div>
                  </div>
                  <DownloadAndroidButton />
                </article>
              ))}
            </div>
          </section>
        )}

        {tab === 'referrals' && (
          <section>
            <h2 style={{ marginBottom: '24px' }}>Referrals & Ranks</h2>
            {referralStats && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '32px' }}>
                <article style={{ background: 'var(--card)', border: '1px solid var(--line)', padding: '16px', borderRadius: '8px' }}>
                  <div style={{ fontSize: '12px', color: 'var(--muted)' }}>Your Code</div>
                  <div style={{ fontSize: '18px', color: 'var(--gold)', fontWeight: '600', margin: '8px 0' }}>{referralStats.referralCode}</div>
                </article>
                <article style={{ background: 'var(--card)', border: '1px solid var(--line)', padding: '16px', borderRadius: '8px' }}>
                  <div style={{ fontSize: '12px', color: 'var(--muted)' }}>Direct Referrals</div>
                  <div style={{ fontSize: '18px', color: 'var(--text)', fontWeight: '600', margin: '8px 0' }}>{referralStats.directReferrals}</div>
                </article>
                <article style={{ background: 'var(--card)', border: '1px solid var(--line)', padding: '16px', borderRadius: '8px' }}>
                  <div style={{ fontSize: '12px', color: 'var(--muted)' }}>Team Total</div>
                  <div style={{ fontSize: '18px', color: 'var(--text)', fontWeight: '600', margin: '8px 0' }}>{referralStats.teamTotal}</div>
                </article>
                <article style={{ background: 'var(--card)', border: '1px solid var(--line)', padding: '16px', borderRadius: '8px' }}>
                  <div style={{ fontSize: '12px', color: 'var(--muted)' }}>Current Tier</div>
                  <div style={{ fontSize: '18px', color: 'var(--gold)', fontWeight: '600', margin: '8px 0' }}>{referralStats.tier || 'None'}</div>
                </article>
              </div>
            )}
            <div className="rank-table-wrap" style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: '8px', overflow: 'hidden' }}>
              <table className="rank-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--line)' }}>
                    <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', color: 'var(--muted)', textTransform: 'uppercase' }}>Rank</th>
                    <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', color: 'var(--muted)', textTransform: 'uppercase' }}>Direct Referrals</th>
                    <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', color: 'var(--muted)', textTransform: 'uppercase' }}>Team Total</th>
                    <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', color: 'var(--muted)', textTransform: 'uppercase' }}>Reward</th>
                    <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', color: 'var(--muted)', textTransform: 'uppercase' }}>Weekly Salary</th>
                  </tr>
                </thead>
                <tbody>
                  {ranks.map((rank, index) => (
                    <tr key={rank.name} style={{ borderBottom: '1px solid var(--line)', background: referralStats?.tier === rank.name ? 'rgba(181, 238, 106, 0.1)' : 'transparent' }}>
                      <td style={{ padding: '12px', fontSize: '13px' }}><strong>{String(index + 1).padStart(2, '0')}. {rank.name}</strong></td>
                      <td style={{ padding: '12px', fontSize: '13px' }}>{rank.direct}</td>
                      <td style={{ padding: '12px', fontSize: '13px' }}>{rank.team === null ? '—' : rank.team}</td>
                      <td style={{ padding: '12px', fontSize: '13px', color: 'var(--gold)', fontWeight: '600' }}>{rank.reward}</td>
                      <td style={{ padding: '12px', fontSize: '13px', color: 'var(--gold)', fontWeight: '600' }}>{rank.weeklySalary ? rank.weeklySalary : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {tab === 'rewards' && (
          <section>
            <h2 style={{ marginBottom: '24px' }}>Prime Hour (Coming Soon)</h2>
            <div style={{ background: 'var(--card)', border: '1px solid var(--line)', padding: '40px', borderRadius: '8px', textAlign: 'center' }}>
              <p style={{ color: 'var(--muted)' }}>Prime hour feature coming soon. Check back later!</p>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
