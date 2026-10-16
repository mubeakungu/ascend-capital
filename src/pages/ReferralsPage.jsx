import React, { useState, useEffect } from 'react';
import './ReferralsPage.css';

const ReferralsPage = ({ token, apiUrl }) => {
  const [stats, setStats] = useState(null);
  const [referrals, setReferrals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const [statsRes, listRes] = await Promise.all([
          fetch(`${apiUrl}/api/referrals/stats`, {
            headers: { 'Cookie': `ascend_session=${token}` },
          }),
          fetch(`${apiUrl}/api/referrals/list`, {
            headers: { 'Cookie': `ascend_session=${token}` },
          }),
        ]);

        if (!statsRes.ok || !listRes.ok) {
          setError('Failed to load referral data');
          return;
        }

        const statsData = await statsRes.json();
        const listData = await listRes.json();

        setStats(statsData);
        setReferrals(listData.referrals);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [token, apiUrl]);

  const handleCopyCode = async () => {
    if (stats?.referralCode) {
      await navigator.clipboard.writeText(
        `${window.location.origin}/?ref=${stats.referralCode}`
      );
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const getReferralLink = () => {
    if (!stats?.referralCode) return '';
    return `${window.location.origin}/?ref=${stats.referralCode}`;
  };

  if (loading) {
    return <div className="referrals-page loading">Loading referral data...</div>;
  }

  if (error) {
    return <div className="referrals-page error">Error: {error}</div>;
  }

  return (
    <div className="referrals-page">
      {/* Header */}
      <div className="referrals-header">
        <h1>Grow Your Earnings</h1>
        <p>Earn commissions by referring friends to Ascend Capital</p>
      </div>

      {/* Referral Code Section */}
      <div className="referral-code-section">
        <h2>Your Referral Link</h2>
        <div className="referral-link-box">
          <input
            type="text"
            readOnly
            value={getReferralLink()}
            className="referral-link-input"
          />
          <button
            onClick={handleCopyCode}
            className={`copy-button ${copied ? 'copied' : ''}`}
          >
            {copied ? '✓ Copied' : 'Copy Link'}
          </button>
        </div>
        <p className="referral-hint">
          Share this link with friends. They'll earn a sign-up bonus and you'll earn commissions on their deposits.
        </p>
      </div>

      {/* Stats Grid */}
      <div className="stats-grid">
        <div className="stat-card tier">
          <div className="stat-label">Your Tier</div>
          <div className="stat-value tier-badge">
            {stats?.tier || 'No Tier'}
          </div>
          {stats?.tier && (
            <div className="stat-detail">
              {stats.directReferrals} direct referral{stats.directReferrals !== 1 ? 's' : ''}
            </div>
          )}
        </div>

        <div className="stat-card rate">
          <div className="stat-label">Commission Rate</div>
          <div className="stat-value">
            {(stats?.commissionRate * 100).toFixed(0)}%
          </div>
          <div className="stat-detail">on all referred deposits</div>
        </div>

        <div className="stat-card volume">
          <div className="stat-label">Referred Volume</div>
          <div className="stat-value">
            KES {stats?.directVolume.toLocaleString('en-KE', { maximumFractionDigits: 0 })}
          </div>
          <div className="stat-detail">from {stats?.directReferrals} member{stats?.directReferrals !== 1 ? 's' : ''}</div>
        </div>

        <div className="stat-card earnings">
          <div className="stat-label">Total Earnings</div>
          <div className="stat-value earnings-highlight">
            KES {stats?.totalEarnings.toLocaleString('en-KE', { maximumFractionDigits: 2 })}
          </div>
          <div className="stat-detail">from {stats?.commissionsEarned} transaction{stats?.commissionsEarned !== 1 ? 's' : ''}</div>
        </div>
      </div>

      {/* Tier Explanation */}
      <div className="tier-explanation">
        <h3>Referral Tiers</h3>
        <p className="tier-desc">
          Unlock higher commission rates by referring more members. Your tier is determined by your direct referral count.
        </p>
        <div className="tier-table">
          <div className="tier-row header">
            <div>Tier</div>
            <div>Direct Referrals</div>
            <div>Commission Rate</div>
          </div>
          {[
            { name: 'Star 1', min: 1, max: 2, rate: 5 },
            { name: 'Star 2', min: 3, max: 5, rate: 6 },
            { name: 'Star 3', min: 6, max: 9, rate: 7 },
            { name: 'Star 4', min: 10, max: 14, rate: 8 },
            { name: 'Star 5', min: 15, max: 24, rate: 10 },
            { name: 'Star 6', min: 25, max: 39, rate: 12 },
            { name: 'Star 7', min: 40, max: 59, rate: 14 },
            { name: 'Star 8', min: 60, max: 99, rate: 16 },
            { name: 'Crown Leader', min: 100, max: '∞', rate: 18 },
          ].map((tier) => (
            <div
              key={tier.name}
              className={`tier-row ${stats?.tier === tier.name ? 'active' : ''}`}
            >
              <div>{tier.name}</div>
              <div>{tier.min} – {tier.max}</div>
              <div>{tier.rate}%</div>
            </div>
          ))}
        </div>
      </div>

      {/* Referrals List */}
      <div className="referrals-list-section">
        <h2>Your Referrals</h2>
        {referrals.length === 0 ? (
          <div className="empty-state">
            <p>You haven't referred anyone yet.</p>
            <p>Share your referral link to get started!</p>
          </div>
        ) : (
          <div className="referrals-table">
            <div className="table-header">
              <div className="col-name">Name</div>
              <div className="col-email">Email</div>
              <div className="col-date">Joined</div>
              <div className="col-volume">Total Deposits</div>
            </div>
            {referrals.map((ref) => (
              <div key={ref.id} className="table-row">
                <div className="col-name">{ref.name}</div>
                <div className="col-email">{ref.email}</div>
                <div className="col-date">
                  {new Date(ref.signedUpAt).toLocaleDateString('en-KE')}
                </div>
                <div className="col-volume">
                  KES {ref.totalDeposits.toLocaleString('en-KE', { maximumFractionDigits: 0 })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Info Section */}
      <div className="info-section">
        <h3>How It Works</h3>
        <ol className="info-list">
          <li>
            <strong>Share Your Link:</strong> Copy your unique referral link and share it with friends via email, messaging, or social media.
          </li>
          <li>
            <strong>They Sign Up:</strong> When someone clicks your link and creates an account, they're automatically linked to you.
          </li>
          <li>
            <strong>They Deposit:</strong> When your referral makes their first deposit, it's recorded and approved by our team.
          </li>
          <li>
            <strong>You Earn:</strong> Once their deposit is approved, you instantly earn a commission based on your current tier.
          </li>
        </ol>
      </div>

      {/* Terms */}
      <div className="terms-section">
        <p className="terms-text">
          Commissions are calculated on approved deposits only. Your tier is based on direct referrals and updates automatically.
          Withdrawals of referral earnings follow the same minimums and fees as regular account withdrawals.
        </p>
      </div>
    </div>
  );
};

export default ReferralsPage;
