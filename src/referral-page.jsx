import React, { useEffect, useState } from 'react';

const TIER_NAMES = [
  'Star 1', 'Star 2', 'Star 3', 'Star 4', 'Star 5',
  'Star 6', 'Star 7', 'Star 8', 'Crown Leader',
];

function Icon({ name, size = 18 }) {
  const paths = {
    arrow: <><path d="M7 17 17 7M7 7h10v10" /></>,
    copy: <><rect x="8" y="8" width="13" height="13" rx="2" /><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    close: <><path d="m18 6-12 12M6 6l12 12" /></>,
    users: <><path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="10" cy="7" r="4" /><path d="M20 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></>,
    star: <><polygon points="12 2 15.09 10.26 23.77 10.5 17.88 16.46 20.49 25.13 12 20.35 3.51 25.13 6.12 16.46 0.23 10.5 8.91 10.26" /></>,
  };

  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

async function requestApi(path, options = {}) {
  try {
    const response = await fetch(path, {
      ...options,
      credentials: 'same-origin',
      headers: {
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...options.headers,
      },
    });
    
    if (response.status === 204) return null;
    
    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.error || `API error: ${response.status}`);
    }
    return result;
  } catch (err) {
    console.error(`API request failed for ${path}:`, err);
    throw err;
  }
}

export function ReferralPage({ account, onNavigate }) {
  const [referralCode, setReferralCode] = useState('');
  const [referralLink, setReferralLink] = useState('');
  const [codeCopied, setCodeCopied] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [stats, setStats] = useState({
    referralCode: '',
    tier: null,
    commissionRate: 0,
    directReferrals: 0,
    directVolume: 0,
    commissionsEarned: 0,
    totalEarnings: 0,
    teamTotal: 0,
  });
  const [referrals, setReferrals] = useState([]);

  useEffect(() => {
    if (!account) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function loadReferralData() {
      try {
        setLoading(true);
        setError('');

        // Fetch referral code
        console.log('[Referrals] Fetching code...');
        const codeResponse = await requestApi('/api/referrals/code');
        const code = codeResponse?.code;
        if (!code) throw new Error('No referral code received');
        
        setReferralCode(code);
        const baseUrl = window.location.origin;
        const link = `${baseUrl}/register?ref=${code}`;
        setReferralLink(link);

        // Fetch referral stats
        console.log('[Referrals] Fetching stats...');
        const statsResponse = await requestApi('/api/referrals/stats');
        console.log('[Referrals] Stats response:', statsResponse);
        if (statsResponse) {
          setStats(statsResponse);
        }

        // Fetch referral list
        console.log('[Referrals] Fetching list...');
        const listResponse = await requestApi('/api/referrals/list');
        console.log('[Referrals] List response:', listResponse);
        if (listResponse?.referrals) {
          setReferrals(listResponse.referrals);
        }
      } catch (err) {
        console.error('[Referrals] Error loading data:', err);
        if (!cancelled) {
          setError(err.message || 'Failed to load referral data');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadReferralData();
    return () => { cancelled = true; };
  }, [account]);

  async function copyToClipboard(text, isLink = false) {
    try {
      await navigator.clipboard.writeText(text);
      if (isLink) {
        setLinkCopied(true);
        setTimeout(() => setLinkCopied(false), 2000);
      } else {
        setCodeCopied(true);
        setTimeout(() => setCodeCopied(false), 2000);
      }
    } catch {
      alert('Could not copy to clipboard');
    }
  }

  if (!account) {
    return (
      <main className="standalone-shell">
        <a className="brand standalone-brand" href="/" onClick={(event) => { event.preventDefault(); onNavigate('/'); }}>
          <img src="/ascend-logo.jpg" alt="Ascend Capital" className="brand-logo" style={{width: '40px', height: '40px', borderRadius: '50%'}} />
          <span className="brand-name">ascend<span>capital</span></span>
        </a>
        <section className="standalone-card">
          <div className="eyebrow"><span className="eyebrow-line" /> REFERRAL PROGRAM</div>
          <h1>Share and earn<span className="title-period">.</span></h1>
          <p className="standalone-description">Sign in to generate your unique referral code and start earning commissions.</p>
          <button className="button button-primary" style={{width: '100%'}} onClick={() => onNavigate('/login')}>Sign in to referrals <Icon name="arrow" size={15} /></button>
        </section>
      </main>
    );
  }

  return (
    <div className="app-shell">
      <style>{`
        :root {
          --primary-blue: #003366;
          --dark-blue: #001a33;
          --light-blue: #005299;
          --gold: #D4AF37;
          --light-gold: #E8C547;
          --text-light: #f5f5f5;
          --bg-dark: #0a0a0a;
        }

        .referral-shell {
          min-height: 100vh;
          background: linear-gradient(135deg, var(--dark-blue) 0%, var(--bg-dark) 100%);
          padding: 40px 20px;
        }

        .referral-container {
          max-width: 1200px;
          margin: 0 auto;
        }

        .referral-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 40px;
          gap: 20px;
        }

        .referral-header-brand {
          display: flex;
          align-items: center;
          gap: 12px;
          color: var(--text-light);
          text-decoration: none;
          cursor: pointer;
        }

        .referral-header-brand img {
          width: 40px;
          height: 40px;
          border-radius: 50%;
        }

        .referral-header-brand span {
          font-size: 18px;
          font-weight: 700;
        }

        .referral-back-button {
          padding: 10px 16px;
          border: 1px solid var(--gold);
          border-radius: 6px;
          background: transparent;
          color: var(--gold);
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .referral-back-button:hover {
          background: rgba(212, 175, 55, 0.1);
        }

        .referral-grid {
          display: grid;
          grid-template-columns: 2fr 1fr;
          gap: 24px;
          margin-bottom: 40px;
        }

        @media (max-width: 1024px) {
          .referral-grid {
            grid-template-columns: 1fr;
          }
        }

        .referral-main-card {
          background: linear-gradient(135deg, rgba(0, 51, 102, 0.8) 0%, rgba(10, 10, 10, 0.8) 100%);
          border: 1px solid rgba(212, 175, 55, 0.3);
          border-radius: 12px;
          padding: 32px;
          color: var(--text-light);
        }

        .referral-card-title {
          font-size: 28px;
          font-weight: 700;
          margin-bottom: 8px;
          color: var(--text-light);
        }

        .referral-card-subtitle {
          font-size: 14px;
          color: #aaa;
          margin-bottom: 24px;
        }

        .referral-code-box {
          background: rgba(0, 0, 0, 0.3);
          border: 1px solid var(--gold);
          border-radius: 8px;
          padding: 16px;
          margin-bottom: 16px;
        }

        .referral-code-label {
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 1px;
          color: var(--gold);
          margin-bottom: 8px;
          font-weight: 700;
        }

        .referral-code-display {
          display: flex;
          align-items: center;
          gap: 12px;
          justify-content: space-between;
        }

        .referral-code-text {
          font-size: 24px;
          font-weight: 700;
          letter-spacing: 2px;
          color: var(--gold);
          font-family: monospace;
        }

        .referral-copy-button {
          padding: 8px 12px;
          border: 1px solid var(--gold);
          border-radius: 4px;
          background: transparent;
          color: var(--gold);
          font-size: 11px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
          display: flex;
          align-items: center;
          gap: 6px;
          white-space: nowrap;
        }

        .referral-copy-button:hover {
          background: rgba(212, 175, 55, 0.1);
        }

        .referral-copy-button.copied {
          background: rgba(100, 200, 100, 0.1);
          border-color: #64c864;
          color: #64c864;
        }

        .referral-link-box {
          background: rgba(0, 0, 0, 0.3);
          border: 1px solid #666;
          border-radius: 8px;
          padding: 16px;
          margin-bottom: 24px;
        }

        .referral-link-label {
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 1px;
          color: #aaa;
          margin-bottom: 8px;
          font-weight: 700;
        }

        .referral-link-display {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .referral-link-text {
          flex: 1;
          font-size: 12px;
          color: #ddd;
          word-break: break-all;
          font-family: monospace;
          background: rgba(0, 0, 0, 0.2);
          padding: 8px;
          border-radius: 4px;
        }

        .referral-stats-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 16px;
          margin-bottom: 24px;
        }

        .referral-stat {
          background: rgba(0, 0, 0, 0.3);
          border: 1px solid rgba(212, 175, 55, 0.2);
          border-radius: 8px;
          padding: 16px;
        }

        .referral-stat-label {
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.8px;
          color: #aaa;
          margin-bottom: 8px;
        }

        .referral-stat-value {
          font-size: 24px;
          font-weight: 700;
          color: var(--gold);
        }

        .referral-stat-secondary {
          font-size: 12px;
          color: #666;
          margin-top: 6px;
        }

        .referral-side-card {
          background: linear-gradient(135deg, rgba(212, 175, 55, 0.15) 0%, rgba(0, 51, 102, 0.15) 100%);
          border: 2px solid var(--gold);
          border-radius: 12px;
          padding: 24px;
          color: var(--text-light);
        }

        .referral-tier-badge {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 8px 12px;
          border-radius: 20px;
          background: rgba(212, 175, 55, 0.2);
          color: var(--gold);
          font-size: 12px;
          font-weight: 700;
          margin-bottom: 16px;
        }

        .referral-tier-name {
          font-size: 22px;
          font-weight: 700;
          margin-bottom: 16px;
        }

        .referral-tier-stats {
          display: grid;
          gap: 12px;
          margin-bottom: 20px;
        }

        .referral-tier-stat {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 10px 0;
          border-bottom: 1px solid rgba(212, 175, 55, 0.2);
          font-size: 13px;
        }

        .referral-tier-stat:last-child {
          border-bottom: none;
        }

        .referral-tier-stat-label {
          color: #aaa;
        }

        .referral-tier-stat-value {
          color: var(--gold);
          font-weight: 700;
        }

        .referral-referrals-section {
          background: linear-gradient(135deg, rgba(0, 51, 102, 0.8) 0%, rgba(10, 10, 10, 0.8) 100%);
          border: 1px solid rgba(212, 175, 55, 0.3);
          border-radius: 12px;
          padding: 32px;
          color: var(--text-light);
        }

        .referral-section-title {
          font-size: 20px;
          font-weight: 700;
          margin-bottom: 24px;
        }

        .referral-list {
          display: grid;
          gap: 12px;
        }

        .referral-item {
          background: rgba(0, 0, 0, 0.3);
          border: 1px solid rgba(212, 175, 55, 0.2);
          border-radius: 8px;
          padding: 16px;
          display: grid;
          grid-template-columns: 1fr auto;
          gap: 16px;
        }

        .referral-item-info {
          display: grid;
          gap: 6px;
        }

        .referral-item-name {
          font-size: 14px;
          font-weight: 600;
          color: var(--gold);
        }

        .referral-item-email {
          font-size: 12px;
          color: #aaa;
        }

        .referral-item-amount {
          text-align: right;
          display: grid;
          gap: 6px;
        }

        .referral-item-value {
          font-size: 14px;
          font-weight: 700;
          color: #64c864;
        }

        .referral-item-date {
          font-size: 11px;
          color: #666;
        }

        .referral-empty {
          text-align: center;
          padding: 40px 20px;
          color: #666;
        }

        .loading {
          text-align: center;
          padding: 40px 20px;
          color: #aaa;
        }

        .error-box {
          background: rgba(231, 76, 60, 0.1);
          border: 1px solid rgba(231, 76, 60, 0.5);
          border-radius: 8px;
          padding: 16px;
          color: #e74c3c;
          margin-bottom: 20px;
        }

        .eyebrow {
          display: flex;
          align-items: center;
          gap: 8px;
          color: var(--gold);
          font-size: 9px;
          font-weight: 700;
          letter-spacing: 1.05px;
          margin-bottom: 12px;
        }

        .eyebrow-line {
          width: 15px;
          height: 1px;
          background: var(--gold);
        }
      `}</style>

      <div className="referral-shell">
        <div className="referral-container">
          <div className="referral-header">
            <a className="referral-header-brand" href="/" onClick={(event) => { event.preventDefault(); onNavigate('/'); }}>
              <img src="/ascend-logo.jpg" alt="Ascend Capital" />
              <span>ascend<br />capital</span>
            </a>
            <button className="referral-back-button" onClick={() => onNavigate('/')}><Icon name="arrow" size={14} /> Back to dashboard</button>
          </div>

          {loading ? (
            <div className="loading">Loading referral data…</div>
          ) : (
            <>
              {error && (
                <div className="error-box">
                  <strong>Error:</strong> {error}
                  <br />
                  <small style={{ marginTop: '8px', display: 'block' }}>Check the browser console for details.</small>
                </div>
              )}

              <div className="referral-grid">
                <div className="referral-main-card">
                  <div className="eyebrow"><span className="eyebrow-line" /> YOUR REFERRAL</div>
                  <h2 className="referral-card-title">Share and earn<span className="title-period">.</span></h2>
                  <p className="referral-card-subtitle">Share your code or link with others to earn commissions on their deposits.</p>

                  {referralCode && (
                    <div className="referral-code-box">
                      <div className="referral-code-label">Your Referral Code</div>
                      <div className="referral-code-display">
                        <div className="referral-code-text">{referralCode}</div>
                        <button 
                          className={`referral-copy-button ${codeCopied ? 'copied' : ''}`}
                          onClick={() => copyToClipboard(referralCode)}
                        >
                          <Icon name={codeCopied ? 'check' : 'copy'} size={14} />
                          {codeCopied ? 'Copied' : 'Copy'}
                        </button>
                      </div>
                    </div>
                  )}

                  {referralLink && (
                    <div className="referral-link-box">
                      <div className="referral-link-label">Your Referral Link</div>
                      <div className="referral-link-display">
                        <div className="referral-link-text">{referralLink}</div>
                        <button 
                          className={`referral-copy-button ${linkCopied ? 'copied' : ''}`}
                          onClick={() => copyToClipboard(referralLink, true)}
                        >
                          <Icon name={linkCopied ? 'check' : 'copy'} size={14} />
                          {linkCopied ? 'Copied' : 'Copy'}
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="referral-stats-grid">
                    <div className="referral-stat">
                      <div className="referral-stat-label">Direct Referrals</div>
                      <div className="referral-stat-value">{stats.directReferrals || 0}</div>
                      <div className="referral-stat-secondary">{stats.directReferrals === 1 ? 'referral' : 'referrals'}</div>
                    </div>
                    <div className="referral-stat">
                      <div className="referral-stat-label">Commission Rate</div>
                      <div className="referral-stat-value">{(stats.commissionRate * 100).toFixed(0)}%</div>
                      <div className="referral-stat-secondary">Current tier</div>
                    </div>
                    <div className="referral-stat">
                      <div className="referral-stat-label">Commissions Earned</div>
                      <div className="referral-stat-value">{stats.commissionsEarned || 0}</div>
                      <div className="referral-stat-secondary">transactions</div>
                    </div>
                    <div className="referral-stat">
                      <div className="referral-stat-label">Total Earnings</div>
                      <div className="referral-stat-value">${(stats.totalEarnings || 0).toFixed(2)}</div>
                      <div className="referral-stat-secondary">lifetime</div>
                    </div>
                  </div>
                </div>

                <div className="referral-side-card">
                  <div className="referral-tier-badge">
                    <Icon name="star" size={14} />
                    {stats.tier || 'Not yet a member'}
                  </div>
                  <h3 className="referral-tier-name">{stats.tier || '—'}</h3>
                  <div className="referral-tier-stats">
                    <div className="referral-tier-stat">
                      <span className="referral-tier-stat-label">Direct Referrals</span>
                      <span className="referral-tier-stat-value">{stats.directReferrals || 0}</span>
                    </div>
                    <div className="referral-tier-stat">
                      <span className="referral-tier-stat-label">Commission Rate</span>
                      <span className="referral-tier-stat-value">{(stats.commissionRate * 100).toFixed(0)}%</span>
                    </div>
                    <div className="referral-tier-stat">
                      <span className="referral-tier-stat-label">Total Volume</span>
                      <span className="referral-tier-stat-value">${(stats.directVolume || 0).toFixed(2)}</span>
                    </div>
                    <div className="referral-tier-stat">
                      <span className="referral-tier-stat-label">Team Total</span>
                      <span className="referral-tier-stat-value">{stats.teamTotal || 0}</span>
                    </div>
                  </div>
                </div>
              </div>

              {referrals.length > 0 && (
                <div className="referral-referrals-section">
                  <h2 className="referral-section-title">Your Referrals ({referrals.length})</h2>
                  <div className="referral-list">
                    {referrals.map((ref) => (
                      <div className="referral-item" key={ref.id}>
                        <div className="referral-item-info">
                          <div className="referral-item-name">{ref.name}</div>
                          <div className="referral-item-email">{ref.email}</div>
                        </div>
                        <div className="referral-item-amount">
                          <div className="referral-item-value">${(ref.totalDeposits || 0).toFixed(2)}</div>
                          <div className="referral-item-date">{new Date(ref.signedUpAt).toLocaleDateString()}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {referrals.length === 0 && !error && (
                <div className="referral-referrals-section">
                  <div className="referral-empty">
                    <p>You haven't referred anyone yet.</p>
                    <p style={{ fontSize: '12px', marginTop: '8px' }}>Share your referral code or link to start earning commissions.</p>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
