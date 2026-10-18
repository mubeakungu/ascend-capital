import React, { useEffect, useState } from 'react';

const TIER_NAMES = [
  'Star 1', 'Star 2', 'Star 3', 'Star 4', 'Star 5',
  'Star 6', 'Star 7', 'Star 8', 'Crown Leader',
];

const TIER_REWARDS = [
  { name: 'Star 1', direct: 5, team: null, reward: '$80', rate: '5%' },
  { name: 'Star 2', direct: 7, team: 13, reward: '$150', rate: '6%' },
  { name: 'Star 3', direct: 8, team: 25, reward: '$250', rate: '7%' },
  { name: 'Star 4', direct: 9, team: 40, reward: '$400', rate: '8%' },
  { name: 'Star 5', direct: 10, team: 70, reward: '$700', rate: '10%' },
  { name: 'Star 6', direct: 11, team: 150, reward: '$1,000', rate: '12%' },
  { name: 'Star 7', direct: 12, team: 400, reward: '$2,500 + House', rate: '14%' },
  { name: 'Star 8', direct: 13, team: 700, reward: '$4,500 + Mazda CX-5', rate: '16%' },
  { name: 'Crown Leader', direct: 14, team: 100, reward: '$7,000 + Mercedes E300', rate: '18%' },
];

function Icon({ name, size = 18 }) {
  const paths = {
    arrow: <><path d="M7 17 17 7M7 7h10v10" /></>,
    copy: <><rect x="8" y="8" width="13" height="13" rx="2" /><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    users: <><path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="10" cy="7" r="4" /><path d="M20 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></>,
    star: <><polygon points="12 2 15.09 10.26 23.77 10.5 17.88 16.46 20.49 25.13 12 20.35 3.51 25.13 6.12 16.46 0.23 10.5 8.91 10.26" /></>,
    trending: <><path d="M3 3v18h18" /><polyline points="7 14 11 10 15 14 19 8" /></>,
    gift: <><polygon points="12 2 14 6 18 6 15 9 16 13 12 10 8 13 9 9 6 6 10 6" /></>,
  };

  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
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
    if (!response.ok) throw new Error(result.error || `API error: ${response.status}`);
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

        const codeResponse = await requestApi('/api/referrals/code');
        const code = codeResponse?.code;
        if (!code) throw new Error('No referral code received');
        
        setReferralCode(code);
        const baseUrl = window.location.origin;
        setReferralLink(`${baseUrl}/register?ref=${code}`);

        const statsResponse = await requestApi('/api/referrals/stats');
        if (statsResponse) setStats(statsResponse);

        const listResponse = await requestApi('/api/referrals/list');
        if (listResponse?.referrals) setReferrals(listResponse.referrals);
      } catch (err) {
        if (!cancelled) setError(err.message || 'Failed to load referral data');
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

  const currentTierIndex = TIER_REWARDS.findIndex(t => t.name === stats.tier) ?? -1;
  const nextTier = currentTierIndex < TIER_REWARDS.length - 1 ? TIER_REWARDS[currentTierIndex + 1] : null;

  if (!account) {
    return (
      <main className="standalone-shell">
        <a className="brand" href="/" onClick={(e) => { e.preventDefault(); onNavigate('/'); }}>
          <img src="/ascend-logo.jpg" alt="Ascend Capital" style={{width: '40px', height: '40px', borderRadius: '50%'}} />
          <span>ascend<span>capital</span></span>
        </a>
        <section className="standalone-card">
          <div className="eyebrow"><span /></div>
          <h1>Share and earn<span>.</span></h1>
          <p>Sign in to generate your unique referral code and start earning commissions.</p>
          <button className="button-primary" style={{width: '100%'}} onClick={() => onNavigate('/login')}>Sign in to referrals <Icon name="arrow" size={15} /></button>
        </section>
      </main>
    );
  }

  return (
    <div className="referral-page">
      <style>{`
        * { margin: 0; padding: 0; box-sizing: border-box; }
        
        :root {
          --gold: #D4AF37;
          --dark-blue: #001a33;
          --light-blue: #003366;
          --text: #f5f5f5;
          --muted: #aaa;
          --bg: #0a0a0a;
          --card-bg: rgba(0, 26, 51, 0.6);
          --success: #64c864;
        }

        .referral-page {
          min-height: 100vh;
          background: linear-gradient(135deg, var(--dark-blue) 0%, var(--bg) 100%);
          color: var(--text);
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          padding: 40px 20px;
        }

        .referral-container {
          max-width: 1400px;
          margin: 0 auto;
        }

        .referral-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 50px;
          gap: 20px;
        }

        .referral-brand {
          display: flex;
          align-items: center;
          gap: 12px;
          text-decoration: none;
          color: var(--text);
          cursor: pointer;
          font-weight: 700;
          font-size: 20px;
        }

        .referral-brand img {
          width: 45px;
          height: 45px;
          border-radius: 50%;
        }

        .referral-btn-back {
          padding: 10px 18px;
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

        .referral-btn-back:hover {
          background: rgba(212, 175, 55, 0.1);
        }

        .referral-main {
          display: grid;
          grid-template-columns: 1fr 350px;
          gap: 30px;
          margin-bottom: 40px;
        }

        @media (max-width: 1024px) {
          .referral-main {
            grid-template-columns: 1fr;
          }
        }

        .referral-card {
          background: var(--card-bg);
          border: 1px solid rgba(212, 175, 55, 0.3);
          border-radius: 16px;
          padding: 40px;
          backdrop-filter: blur(10px);
        }

        .referral-section-title {
          font-size: 28px;
          font-weight: 700;
          margin-bottom: 10px;
          color: var(--text);
        }

        .referral-section-desc {
          font-size: 14px;
          color: var(--muted);
          margin-bottom: 30px;
        }

        .referral-code-section {
          margin-bottom: 40px;
        }

        .referral-code-label {
          font-size: 10px;
          text-transform: uppercase;
          letter-spacing: 1.5px;
          color: var(--gold);
          font-weight: 700;
          margin-bottom: 12px;
        }

        .referral-code-box {
          background: rgba(0, 0, 0, 0.5);
          border: 2px solid var(--gold);
          border-radius: 12px;
          padding: 20px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 15px;
          margin-bottom: 15px;
        }

        .referral-code-text {
          font-size: 32px;
          font-weight: 700;
          letter-spacing: 3px;
          color: var(--gold);
          font-family: 'Monaco', monospace;
          flex: 1;
        }

        .referral-btn-copy {
          padding: 10px 16px;
          border: 1px solid var(--gold);
          border-radius: 6px;
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

        .referral-btn-copy:hover {
          background: rgba(212, 175, 55, 0.1);
        }

        .referral-btn-copy.copied {
          background: rgba(100, 200, 100, 0.15);
          border-color: var(--success);
          color: var(--success);
        }

        .referral-link-box {
          background: rgba(0, 0, 0, 0.5);
          border: 1px solid #444;
          border-radius: 12px;
          padding: 16px;
          display: flex;
          gap: 12px;
        }

        .referral-link-text {
          flex: 1;
          font-size: 12px;
          color: #ddd;
          word-break: break-all;
          font-family: monospace;
          background: rgba(0, 0, 0, 0.3);
          padding: 10px;
          border-radius: 6px;
          max-height: 60px;
          overflow: auto;
        }

        .referral-stats {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 16px;
          margin-top: 40px;
        }

        .referral-stat {
          background: rgba(0, 0, 0, 0.3);
          border: 1px solid rgba(212, 175, 55, 0.2);
          border-radius: 12px;
          padding: 20px;
        }

        .referral-stat-label {
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.8px;
          color: var(--muted);
          margin-bottom: 10px;
        }

        .referral-stat-value {
          font-size: 28px;
          font-weight: 700;
          color: var(--gold);
        }

        .referral-stat-sub {
          font-size: 12px;
          color: #666;
          margin-top: 6px;
        }

        .referral-sidebar {
          display: flex;
          flex-direction: column;
          gap: 20px;
        }

        .referral-tier-card {
          background: linear-gradient(135deg, rgba(212, 175, 55, 0.2) 0%, rgba(0, 51, 102, 0.2) 100%);
          border: 2px solid var(--gold);
          border-radius: 16px;
          padding: 24px;
        }

        .referral-tier-badge {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 8px 12px;
          background: rgba(212, 175, 55, 0.2);
          border-radius: 20px;
          color: var(--gold);
          font-size: 11px;
          font-weight: 700;
          margin-bottom: 12px;
        }

        .referral-tier-name {
          font-size: 24px;
          font-weight: 700;
          margin-bottom: 20px;
        }

        .referral-tier-stat {
          display: flex;
          justify-content: space-between;
          padding: 12px 0;
          border-bottom: 1px solid rgba(212, 175, 55, 0.2);
          font-size: 13px;
        }

        .referral-tier-stat:last-child {
          border-bottom: none;
        }

        .referral-tier-label {
          color: var(--muted);
        }

        .referral-tier-value {
          color: var(--gold);
          font-weight: 700;
        }

        .referral-progress {
          margin-top: 20px;
          padding-top: 20px;
          border-top: 1px solid rgba(212, 175, 55, 0.2);
        }

        .referral-progress-label {
          font-size: 11px;
          color: var(--muted);
          margin-bottom: 10px;
          font-weight: 600;
        }

        .referral-progress-text {
          font-size: 12px;
          color: var(--text);
          margin-bottom: 8px;
        }

        .referral-referrals-section {
          background: var(--card-bg);
          border: 1px solid rgba(212, 175, 55, 0.3);
          border-radius: 16px;
          padding: 40px;
          margin-top: 40px;
        }

        .referral-referrals-title {
          font-size: 20px;
          font-weight: 700;
          margin-bottom: 24px;
        }

        .referral-list {
          display: grid;
          gap: 12px;
          max-height: 600px;
          overflow-y: auto;
        }

        .referral-item {
          background: rgba(0, 0, 0, 0.3);
          border: 1px solid rgba(212, 175, 55, 0.2);
          border-radius: 10px;
          padding: 16px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          transition: all 0.2s;
        }

        .referral-item:hover {
          background: rgba(0, 0, 0, 0.4);
          border-color: rgba(212, 175, 55, 0.4);
        }

        .referral-item-info {
          flex: 1;
        }

        .referral-item-name {
          font-size: 14px;
          font-weight: 600;
          color: var(--gold);
          margin-bottom: 4px;
        }

        .referral-item-email {
          font-size: 12px;
          color: var(--muted);
        }

        .referral-item-amount {
          text-align: right;
        }

        .referral-item-value {
          font-size: 14px;
          font-weight: 700;
          color: var(--success);
          margin-bottom: 4px;
        }

        .referral-item-date {
          font-size: 11px;
          color: #666;
        }

        .referral-empty {
          text-align: center;
          padding: 60px 20px;
          color: var(--muted);
        }

        .loading {
          text-align: center;
          padding: 60px 20px;
          color: var(--muted);
        }

        .error-box {
          background: rgba(231, 76, 60, 0.1);
          border: 1px solid rgba(231, 76, 60, 0.5);
          border-radius: 10px;
          padding: 18px;
          color: #ff6b6b;
          margin-bottom: 20px;
          font-size: 13px;
        }

        .eyebrow {
          display: flex;
          align-items: center;
          gap: 8px;
          color: var(--gold);
          font-size: 9px;
          font-weight: 700;
          letter-spacing: 1.2px;
          margin-bottom: 16px;
        }

        .eyebrow span {
          width: 20px;
          height: 1px;
          background: var(--gold);
        }
      `}</style>

      <div className="referral-container">
        <div className="referral-header">
          <a className="referral-brand" href="/" onClick={(e) => { e.preventDefault(); onNavigate('/'); }}>
            <img src="/ascend-logo.jpg" alt="Ascend" />
            <span>ascend<br />capital</span>
          </a>
          <button className="referral-btn-back" onClick={() => onNavigate('/')}>
            <Icon name="arrow" size={14} /> Back to dashboard
          </button>
        </div>

        {loading ? (
          <div className="loading">Loading your referral program…</div>
        ) : (
          <>
            {error && <div className="error-box"><strong>Error:</strong> {error}</div>}

            <div className="referral-main">
              <div className="referral-card">
                <div className="eyebrow"><span /></div>
                <h1 className="referral-section-title">Share and earn<span style={{ color: 'var(--gold)' }}>.</span></h1>
                <p className="referral-section-desc">Invite friends and earn commissions on their deposits</p>

                <div className="referral-code-section">
                  <div className="referral-code-label">Your Referral Code</div>
                  <div className="referral-code-box">
                    <div className="referral-code-text">{referralCode || 'LOADING'}</div>
                    <button 
                      className={`referral-btn-copy ${codeCopied ? 'copied' : ''}`}
                      onClick={() => copyToClipboard(referralCode)}
                    >
                      <Icon name={codeCopied ? 'check' : 'copy'} size={13} />
                      {codeCopied ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                  <div className="referral-code-label" style={{ marginTop: '20px' }}>Referral Link</div>
                  <div className="referral-link-box">
                    <div className="referral-link-text">{referralLink || 'Generating…'}</div>
                    <button 
                      className={`referral-btn-copy ${linkCopied ? 'copied' : ''}`}
                      onClick={() => copyToClipboard(referralLink, true)}
                    >
                      <Icon name={linkCopied ? 'check' : 'copy'} size={13} />
                      {linkCopied ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                </div>

                <div className="referral-stats">
                  <div className="referral-stat">
                    <div className="referral-stat-label">Direct Referrals</div>
                    <div className="referral-stat-value">{stats.directReferrals || 0}</div>
                    <div className="referral-stat-sub">active members</div>
                  </div>
                  <div className="referral-stat">
                    <div className="referral-stat-label">Commission Rate</div>
                    <div className="referral-stat-value">{(stats.commissionRate * 100).toFixed(0)}%</div>
                    <div className="referral-stat-sub">current tier</div>
                  </div>
                  <div className="referral-stat">
                    <div className="referral-stat-label">Total Earnings</div>
                    <div className="referral-stat-value">${(stats.totalEarnings || 0).toFixed(2)}</div>
                    <div className="referral-stat-sub">lifetime</div>
                  </div>
                  <div className="referral-stat">
                    <div className="referral-stat-label">Team Total</div>
                    <div className="referral-stat-value">{stats.teamTotal || 0}</div>
                    <div className="referral-stat-sub">members</div>
                  </div>
                </div>
              </div>

              <div className="referral-sidebar">
                <div className="referral-tier-card">
                  <div className="referral-tier-badge">
                    <Icon name="star" size={13} />
                    {stats.tier || 'Not Yet'}
                  </div>
                  <h3 className="referral-tier-name">{stats.tier || '—'}</h3>
                  <div className="referral-tier-stat">
                    <span className="referral-tier-label">Direct</span>
                    <span className="referral-tier-value">{stats.directReferrals || 0}</span>
                  </div>
                  <div className="referral-tier-stat">
                    <span className="referral-tier-label">Commission</span>
                    <span className="referral-tier-value">{(stats.commissionRate * 100).toFixed(0)}%</span>
                  </div>
                  <div className="referral-tier-stat">
                    <span className="referral-tier-label">Volume</span>
                    <span className="referral-tier-value">${(stats.directVolume || 0).toFixed(2)}</span>
                  </div>

                  {nextTier && (
                    <div className="referral-progress">
                      <div className="referral-progress-label">NEXT TIER</div>
                      <div className="referral-progress-text">
                        <strong>{nextTier.name}</strong><br />
                        Need {nextTier.direct - (stats.directReferrals || 0)} more referrals
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {referrals.length > 0 && (
              <div className="referral-referrals-section">
                <h2 className="referral-referrals-title">Your Referrals ({referrals.length})</h2>
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
                  <div style={{ fontSize: '40px', marginBottom: '12px' }}>📢</div>
                  <p style={{ fontSize: '16px', fontWeight: '600', marginBottom: '6px' }}>No referrals yet</p>
                  <p>Share your referral code to start earning commissions</p>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
