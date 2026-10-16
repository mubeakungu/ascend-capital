import React, { useEffect, useState } from 'react';
import AdminDashboard from './AdminDashboard.jsx';

const plans = [
  { deposit: 300, earning: '8' },
  { deposit: 400, earning: '11' },
  { deposit: 500, earning: '15.5' },
  { deposit: 750, earning: '25' },
  { deposit: 1000, earning: '35' },
  { deposit: 2000, earning: '70' },
  { deposit: 5000, earning: '180' },
  { deposit: 10000, earning: '370' },
  { deposit: 20000, earning: '750' },
  { deposit: 35000, earning: '1,400' },
];

const ranks = [
  { name: 'Star 1', direct: 5, team: null, reward: '$80' },
  { name: 'Star 2', direct: 7, team: 13, reward: '$150' },
  { name: 'Star 3', direct: 8, team: 25, reward: '$250' },
  { name: 'Star 4', direct: 9, team: 40, reward: '$400' },
  { name: 'Star 5', direct: 10, team: 70, reward: '$700' },
  { name: 'Star 6', direct: 11, team: 150, reward: '$1,000' },
  { name: 'Star 7', direct: 12, team: 400, reward: '$2,500 + house' },
  { name: 'Star 8', direct: 13, team: 700, reward: '$4,500 + Mazda CX-5' },
  { name: 'Crown Leader', direct: 14, team: 100, reward: '$7,000 + Mercedes-Benz E300' },
];

const navItems = [
  { id: 'overview', label: 'Overview', icon: 'grid' },
  { id: 'deposits', label: 'Deposit plans', icon: 'chart' },
  { id: 'referrals', label: 'Referrals & ranks', icon: 'users' },
  { id: 'rewards', label: 'Elite hour', icon: 'clock' },
];

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
  };

  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

async function requestApi(path, options = {}) {
  const response = await fetch(path, {
    ...options,
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

function AuthPage({ mode, name, email, password, error, storageMode, onNameChange, onEmailChange, onPasswordChange, onSubmit, onNavigate }) {
  const registering = mode === 'register';

  return (
    <main className="standalone-shell">
      <a className="brand standalone-brand" href="/" onClick={(event) => { event.preventDefault(); onNavigate('/'); }}>
        <span className="brand-mark"><span /></span>
        <span className="brand-name">ascend<span>capital</span></span>
      </a>
      <section className="standalone-card">
        <div className="eyebrow"><span className="eyebrow-line" /> MEMBER ACCOUNT</div>
        <h1>{registering ? 'Create your account' : 'Welcome back'}<span className="title-period">.</span></h1>
        <p className="standalone-description">Sign in to manage your member profile and process real transactions.</p>
        {storageMode === 'ephemeral' && <div className="storage-warning" role="note"><strong>Temporary account storage</strong><span>This free hosting setup can erase account data when the service restarts. Do not reuse a password from another service.</span></div>}
        <form onSubmit={onSubmit}>
          {registering && <label className="account-field">Full name<input type="text" autoComplete="name" minLength={2} maxLength={80} value={name} onChange={(event) => onNameChange(event.target.value)} required /></label>}
          <label className="account-field">Email address<input type="email" autoComplete="email" maxLength={254} value={email} onChange={(event) => onEmailChange(event.target.value)} required /></label>
          <label className="account-field">Password<input type="password" autoComplete={registering ? 'new-password' : 'current-password'} minLength={12} maxLength={128} value={password} onChange={(event) => onPasswordChange(event.target.value)} required />{registering && <span className="field-hint">Use at least 12 characters.</span>}</label>
          {error && <div className="modal-message" role="alert">{error}</div>}
          <button className="button button-primary modal-submit" type="submit">{registering ? 'Create account' : 'Sign in'} <Icon name="arrow" size={15} /></button>
        </form>
        <button className="account-switch" onClick={() => onNavigate(registering ? '/login' : '/register')}>{registering ? 'Already registered? Sign in' : 'New here? Create an account'}</button>
        <p className="modal-footnote"><Icon name="shield" size={13} /> Secure authentication · Real transactions</p>
      </section>
    </main>
  );
}

function ReferralPage({ account, onNavigate }) {
  return (
    <main className="standalone-shell">
      <a className="brand standalone-brand" href="/" onClick={(event) => { event.preventDefault(); onNavigate('/'); }}>
        <span className="brand-mark"><span /></span>
        <span className="brand-name">ascend<span>capital</span></span>
      </a>
      <section className="standalone-card referral-page-card">
        <div className="eyebrow"><span className="eyebrow-line" /> MEMBER INFORMATION</div>
        <h1>Referrals<span className="title-period">.</span></h1>
        <p className="standalone-description">This page provides referral information only. No invite tracking, recruitment bonuses, or referral-based payouts are available.</p>
        <div className="referral-status-panel"><Icon name="users" size={20} /><div><strong>Referral features unavailable</strong><p>This page does not register referrals or calculate commissions.</p></div></div>
        <div className="referral-page-actions">
          {account ? <button className="button button-secondary" onClick={() => onNavigate('/')}>Return to dashboard</button> : <button className="button button-secondary" onClick={() => onNavigate('/login')}>Sign in</button>}
          {!account && <button className="button button-primary" onClick={() => onNavigate('/register')}>Create account <Icon name="arrow" size={14} /></button>}
        </div>
      </section>
    </main>
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
  const [accountError, setAccountError] = useState('');
  const [accountMessage, setAccountMessage] = useState('');
  const [balance, setBalance] = useState(0);
  const [totalDeposits, setTotalDeposits] = useState(0);
  const [referralRewards, setReferralRewards] = useState(0);
  const [transactionLoading, setTransactionLoading] = useState(false);

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
        if (currentAccount) {
          fetchAccountBalance(currentAccount.id);
          fetchTransactionHistory(currentAccount.id);
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

  async function fetchAccountBalance(accountId) {
    try {
      const result = await requestApi(`/api/account/${encodeURIComponent(accountId)}/balance`);
      setBalance(result.balance || 0);
      setTotalDeposits(result.totalDeposits || 0);
      setReferralRewards(result.referralRewards || 0);
    } catch (error) {
      console.error('Failed to fetch balance:', error);
    }
  }

  async function fetchTransactionHistory(accountId) {
    try {
      const result = await requestApi(`/api/account/${encodeURIComponent(accountId)}/transactions`);
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
      const payload = {
        amount: value,
        ...(modal === 'withdraw' && { destination: destination.trim() }),
      };

      const endpoint = modal === 'withdraw' ? '/api/transactions/withdraw' : '/api/transactions/deposit';
      const result = await requestApi(endpoint, {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      const entry = {
        id: result.transaction?.id || `${Date.now()}-${Math.random()}`,
        type: modal === 'withdraw' ? 'Withdrawal' : 'Deposit',
        amount: value,
        createdAt: new Date().toLocaleTimeString(),
        status: result.transaction?.status || 'pending',
      };

      setDemoActivity((current) => [entry, ...current].slice(0, 5));

      setModal(null);
      setAmount('');
      setDestination('');
      setNotice(`${entry.type} request of $${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} submitted. Your balance updates once an administrator approves it.`);

      if (account) {
        await fetchAccountBalance(account.id);
      }
    } catch (error) {
      setNotice(`Transaction failed: ${error.message}`);
    } finally {
      setTransactionLoading(false);
    }
  }

  function openAccountDialog() {
    setAccountMode(account ? 'profile' : 'login');
    setAccountName(account?.name ?? '');
    setAccountEmail(account?.email ?? '');
    setAccountPassword('');
    setAccountError('');
    setAccountMessage('');
    setAccountDialog(true);
  }

  async function submitAccount(event) {
    event.preventDefault();
    setAccountError('');
    setAccountMessage('');

    try {
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
        }),
      });
      setAccount(result.account);
      setAccountName(result.account.name);
      setAccountEmail(result.account.email);
      setAccountPassword('');
      setAccountDialog(false);
      
      if (result.account) {
        fetchAccountBalance(result.account.id);
        fetchTransactionHistory(result.account.id);
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
      setAccountPassword('');
      setAccountMode('login');
      setAccountMessage('');
      setAccountDialog(false);
      setBalance(0);
      setTotalDeposits(0);
      setReferralRewards(0);
      setDemoActivity([]);
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

  if (route === '/login' || route === '/register') {
    return <AuthPage
      mode={route.slice(1)}
      name={accountName}
      email={accountEmail}
      password={accountPassword}
      error={accountError}
      storageMode={storageMode}
      onNameChange={setAccountName}
      onEmailChange={setAccountEmail}
      onPasswordChange={setAccountPassword}
      onSubmit={submitAccount}
      onNavigate={navigate}
    />;
  }

  if (route === '/referrals') {
    return <ReferralPage account={account} onNavigate={navigate} />;
  }

  if (route === '/admin') {
    return <AdminDashboard />;
  }

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileMenu ? 'sidebar-open' : ''}`}>
        <a className="brand" href="#overview" onClick={(event) => { event.preventDefault(); navigate('overview'); }}>
          <span className="brand-mark"><span /></span>
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
          <p>{accountError && !account ? 'Account service is unavailable. Please try again later.' : accountLoading ? 'Checking account status…' : account ? `Signed in as ${account.email}.` : 'Create an account or sign in to manage your profile.'}</p>
          <button onClick={openAccountDialog}>{account ? 'Manage profile' : 'Sign in or register'} <Icon name="arrow" size={13} /></button>
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
            <button className="avatar" aria-label={account ? 'Manage account' : 'Sign in'} onClick={openAccountDialog}>{account ? account.name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase() : 'AC'}</button>
          </div>
        </header>

        <div className="page-content">
          <section className="welcome-row">
            <div>
              <div className="eyebrow"><span className="eyebrow-line" /> MEMBER DASHBOARD</div>
              <h1>{account ? `Welcome, ${account.name.split(/\s+/)[0]}` : 'Good evening'}<span className="title-period">.</span></h1>
              <p className="welcome-subtitle">Here's your Ascend Capital account at a glance.</p>
              <div className="header-wallet">
                <span className="header-wallet-label"><Icon name="wallet" size={14} /> BINANCE DEPOSIT ADDRESS</span>
                <code>{walletAddressError ? 'Address unavailable' : walletAddressLoading ? 'Loading wallet address…' : binanceWalletAddress || 'Not configured in Render'}</code>
                <button type="button" onClick={copyBinanceWalletAddress} disabled={walletAddressLoading || Boolean(walletAddressError) || !binanceWalletAddress} aria-label="Copy Binance deposit address">
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
                <span className="balance-icon subdued"><Icon name="chart" size={18} /></span>
              </div>
              <div className="balance-value"><span className="currency">$</span>{totalDeposits.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
              <div className="balance-bottom"><span className="balance-caption">Across all plans</span><span className="muted-metric">{totalDeposits === 0 ? 'No activity yet' : 'Active'}</span></div>
            </article>
            <article className="balance-card">
              <div className="card-topline">
                <span className="balance-label">Referral rewards</span>
                <span className="balance-icon subdued"><Icon name="users" size={18} /></span>
              </div>
              <div className="balance-value"><span className="currency">$</span>{referralRewards.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
              <div className="balance-bottom"><span className="balance-caption">5% first-deposit bonus</span><button className="text-link" onClick={() => navigate('referrals')}>View referrals <Icon name="arrow" size={13} /></button></div>
            </article>
          </section>

          <section className="action-row" aria-label="Wallet actions">
            <div className="action-copy"><div className="action-heading"><span className="action-spark"><Icon name="spark" size={16} /></span>Ready to get started?</div><div className="action-description">Choose a plan to deposit into your account.</div></div>
            <div className="action-buttons">
              <button className="button button-secondary" onClick={() => openModal('withdraw')} disabled={!account}><Icon name="withdraw" size={16} /> Withdraw</button>
              <button className="button button-primary" onClick={() => navigate('deposits')} disabled={!account}><Icon name="plus" size={17} /> Make a deposit</button>
            </div>
          </section>

          <section className="section-block" id="deposits">
            <div className="section-heading">
              <div><div className="eyebrow"><span className="eyebrow-line" /> DEPOSIT PLANS</div><h2>Deposit plans</h2><p className="section-subtitle">Deposits are credited to your balance once an administrator confirms them.</p></div>
              <span className="count-tag">10 plans <span className="count-dot" /></span>
            </div>
            <div className="plans-grid">
              {plans.map((plan, index) => (
                <article className={`plan-card ${index === 5 ? 'plan-featured' : ''}`} key={plan.deposit}>
                  {index === 5 && <span className="popular-tag">POPULAR</span>}
                  <div className="plan-index">PLAN {String(index + 1).padStart(2, '0')}</div>
                  <div className="plan-deposit"><span>$</span>{plan.deposit.toLocaleString('en-US')}</div>
                  <div className="plan-divider" />
                  <div className="plan-earning-label">Unverified claimed earning</div>
                  <div className="plan-earning"><span>$</span>{plan.earning}</div>
                  <button className={`plan-button ${index === 5 ? 'plan-button-featured' : ''}`} onClick={() => openModal('deposit', String(plan.deposit))} disabled={!account}>{account ? 'Choose plan' : 'Sign in first'} <Icon name="arrow" size={14} /></button>
                </article>
              ))}
            </div>
            <div className="notice-bar"><span className="notice-icon"><Icon name="shield" size={16} /></span><p><strong>Admin-approved transactions:</strong> Deposits and withdrawals are reviewed by an administrator before they change your balance. Minimum withdrawal is $40.</p></div>
          </section>

          <section className="referral-layout" id="referrals">
            <div className="section-block rank-section">
              <div className="section-heading">
                <div><div className="eyebrow"><span className="eyebrow-line" /> REFERRAL INFORMATION</div><h2>Referral reward claims</h2><p className="section-subtitle">Unverified user-provided examples; no referral payouts are processed on this site.</p></div>
              </div>
              <div className="referral-banner">
                <div className="referral-banner-content">
                  <div className="referral-banner-label"><Icon name="users" size={15} /> YOUR REFERRAL LINK</div>
                  <div className="referral-banner-title">User-described 5% first-deposit reward.</div>
                  <p>This claim has not been independently verified. No bonus is tracked or paid here.</p>
                </div>
                <span className="copy-button referral-code-example"><Icon name="users" size={15} />No active referral code</span>
              </div>
              <div className="rank-table-wrap">
                <table className="rank-table">
                  <thead><tr><th>RANK</th><th>DIRECT REFERRALS</th><th>TEAM TOTAL</th><th>REWARD</th></tr></thead>
                  <tbody>{ranks.map((rank, index) => (
                    <tr key={rank.name}>
                      <td><span className="rank-number">{String(index + 1).padStart(2, '0')}</span><strong>{rank.name}</strong></td>
                      <td>{rank.direct} <span className="table-muted">direct</span></td>
                      <td>{rank.team === null ? <span className="table-dash">—</span> : rank.team}</td>
                      <td className="reward-cell">{rank.reward}{rank.name === 'Star 8' && <span className="reward-value"> · $27,000 value</span>}{rank.name === 'Crown Leader' && <span className="reward-value"> · $46,000 value</span>}{rank.name === 'Star 7' && <span className="reward-value"> · $80,000 house</span>}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
              <p className="team-note">Team total means the people referred by your direct referrals. Star 1 has no team-total requirement specified.</p>
            </div>

            <aside className="bonus-card" id="rewards">
              <div className="bonus-top"><span className="bonus-icon"><Icon name="clock" size={19} /></span><span className="bonus-badge"><span /> DAILY WINDOW</span></div>
              <div className="bonus-eyebrow">USER-DESCRIBED OFFER</div>
              <h3>Elite hour<span>.</span></h3>
              <div className="bonus-time">3:45 <span>—</span> 4:15 <small>AM</small></div>
              <p className="bonus-description">This user-described promotion is unverified and is not available through this member portal.</p>
              <div className="bonus-details">
                <div><span>Minimum deposit</span><strong>$50</strong></div>
                <div><span>Stated reward</span><strong className="green-text">$5</strong></div>
                <div><span>Withdrawal minimum</span><strong>$50</strong></div>
              </div>
              <div className="bonus-qualification"><span className="qualification-icon"><Icon name="check" size={13} /></span><span>Requires one referral who has deposited and traded on Ascend for three days.</span></div>
              <button className="bonus-button" onClick={() => openModal('deposit', '50')} disabled={!account}>{account ? 'Try Elite hour flow' : 'Sign in first'} <Icon name="arrow" size={15} /></button>
            </aside>
          </section>

          <section className="bottom-notice">
            <span className="notice-icon"><Icon name="wallet" size={16} /></span>
            <div><strong>Reviewed transaction processing</strong><p>Deposits and withdrawals are submitted for administrator approval and change your balance once approved. Withdrawals require minimum $40 and a valid wallet address.</p></div>
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
            <p className="modal-subtitle">Requests are reviewed by an administrator before they change your balance.</p>
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
                  <span className="deposit-wallet-label"><Icon name="wallet" size={14} /> BINANCE WALLET ADDRESS</span>
                  <code>{walletAddressError ? 'Address unavailable' : walletAddressLoading ? 'Loading wallet address…' : binanceWalletAddress || 'Not configured in Render'}</code>
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
            <h2 id="account-modal-title">{accountMode === 'profile' ? 'Your profile' : accountMode === 'register' ? 'Create your account' : 'Sign in'}</h2>
            <p className="modal-subtitle">{accountMode === 'profile' ? 'Update the profile name linked to your account.' : 'Create an account to manage your member profile and process transactions.'}</p>
            <form onSubmit={submitAccount}>
              {accountMode !== 'login' && (
                <label className="account-field">Full name
                  <input type="text" autoComplete="name" minLength={2} maxLength={80} value={accountName} onChange={(event) => setAccountName(event.target.value)} required />
                </label>
              )}
              {accountMode !== 'profile' && (
                <label className="account-field">Email address
                  <input type="email" autoComplete="email" maxLength={254} value={accountEmail} onChange={(event) => setAccountEmail(event.target.value)} required />
                </label>
              )}
              {accountMode === 'profile' && (
                <label className="account-field">Email address
                  <input type="email" value={accountEmail} readOnly />
                </label>
              )}
              {accountMode !== 'profile' && (
                <label className="account-field">Password
                  <input type="password" autoComplete={accountMode === 'register' ? 'new-password' : 'current-password'} minLength={12} maxLength={128} value={accountPassword} onChange={(event) => setAccountPassword(event.target.value)} required />
                  <span className="field-hint">Use at least 12 characters.</span>
                </label>
              )}
              {accountError && <div className="modal-message" role="alert">{accountError}</div>}
              {accountMessage && <div className="modal-message modal-success" role="status">{accountMessage}</div>}
              <button className="button button-primary modal-submit" type="submit">{accountMode === 'profile' ? 'Save profile' : accountMode === 'register' ? 'Create account' : 'Sign in'} <Icon name="arrow" size={15} /></button>
              {accountMode === 'profile' ? (
                <button className="account-switch logout-button" type="button" onClick={logout}>Sign out</button>
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
