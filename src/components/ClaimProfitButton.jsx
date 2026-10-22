import React, { useState, useEffect } from 'react';

/**
 * ClaimProfitButton Component
 * Shows claimable profit and allows users to claim daily profits
 */
export default function ClaimProfitButton({ depositId, onClaimed = () => {} }) {
  const [claimable, setClaimable] = useState(null);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  // Fetch claimable profit amount
  useEffect(() => {
    const fetchClaimable = async () => {
      try {
        setLoading(true);
        setError(null);

        const response = await fetch('/api/trading/can-claim-today', {
          method: 'GET',
          credentials: 'include',
        });

        if (!response.ok) {
          throw new Error('Failed to fetch claimable profit');
        }

        const data = await response.json();
        setClaimable({
          claimableProfit: data.dailyProfitAmount || 0,
          alreadyClaimedToday: !data.canClaimToday,
        });
      } catch (err) {
        setError(err.message);
        console.error('Error fetching claimable profit:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchClaimable();
  }, []);

  // Claim profit handler
  const handleClaimProfit = async () => {
    try {
      setClaiming(true);
      setError(null);
      setSuccess(false);

      const response = await fetch('/api/trading/claim-daily-trade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to claim profit');
      }

      setSuccess(true);
      setClaimable({ claimableProfit: 0, alreadyClaimedToday: true });
      onClaimed(data.earnedAmount);

      // Clear success message after 3 seconds
      setTimeout(() => setSuccess(false), 3000);

      // Refresh claimable amount
      setTimeout(() => {
        const fetchClaimable = async () => {
          try {
            const res = await fetch('/api/trading/can-claim-today', {
              credentials: 'include',
            });
            const updated = await res.json();
            setClaimable({
              claimableProfit: updated.dailyProfitAmount || 0,
              alreadyClaimedToday: !updated.canClaimToday,
            });
          } catch (err) {
            console.error('Error refreshing claimable:', err);
          }
        };
        fetchClaimable();
      }, 1000);
    } catch (err) {
      setError(err.message);
      console.error('Error claiming profit:', err);
    } finally {
      setClaiming(false);
    }
  };

  if (loading) {
    return (
      <div className="claim-profit-card loading">
        <p>Loading profit info...</p>
      </div>
    );
  }

  if (!claimable) {
    return (
      <div className="claim-profit-card error">
        <p>Unable to load profit data</p>
      </div>
    );
  }

  const isDisabled = claimable.alreadyClaimedToday || claimable.claimableProfit <= 0;

  return (
    <div className="claim-profit-card">
      <div className="profit-info">
        <div className="profit-amount">
          <span className="label">Claimable Profit</span>
          <span className={`amount ${claimable.claimableProfit > 0 ? 'available' : 'unavailable'}`}>
            ${claimable.claimableProfit.toFixed(2)}
          </span>
        </div>

        {claimable.alreadyClaimedToday && (
          <div className="claimed-today">
            ✅ Already claimed today
          </div>
        )}
      </div>

      {error && (
        <div className="error-message">
          {error}
        </div>
      )}

      {success && (
        <div className="success-message">
          ✅ Profit claimed successfully!
        </div>
      )}

      <button
        onClick={handleClaimProfit}
        disabled={isDisabled || claiming}
        className={`claim-btn ${isDisabled ? 'disabled' : 'active'}`}
      >
        {claiming ? 'Claiming...' : 'Claim Profit'}
      </button>

      <p className="note">
        {claimable.alreadyClaimedToday
          ? 'You can claim profit once per day. Come back tomorrow.'
          : 'Claim your daily profits from completed trades.'}
      </p>

      <style>{`
        .claim-profit-card {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          border-radius: 12px;
          padding: 20px;
          color: white;
          margin: 15px 0;
          box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);
        }

        .claim-profit-card.loading,
        .claim-profit-card.error {
          background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
          text-align: center;
        }

        .profit-info {
          margin-bottom: 15px;
        }

        .profit-amount {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 10px;
        }

        .profit-amount .label {
          font-size: 14px;
          opacity: 0.9;
          font-weight: 500;
        }

        .profit-amount .amount {
          font-size: 28px;
          font-weight: bold;
          font-family: 'Courier New', monospace;
        }

        .profit-amount .amount.available {
          color: #4ade80;
          text-shadow: 0 0 10px rgba(74, 222, 128, 0.3);
        }

        .profit-amount .amount.unavailable {
          color: #fca5a5;
          opacity: 0.7;
        }

        .claimed-today {
          background: rgba(74, 222, 128, 0.2);
          border-left: 3px solid #4ade80;
          padding: 10px;
          border-radius: 4px;
          font-size: 13px;
          font-weight: 500;
        }

        .error-message {
          background: rgba(252, 165, 165, 0.2);
          border-left: 3px solid #f87171;
          padding: 10px;
          border-radius: 4px;
          font-size: 13px;
          margin-bottom: 10px;
          color: #fecaca;
        }

        .success-message {
          background: rgba(74, 222, 128, 0.2);
          border-left: 3px solid #4ade80;
          padding: 10px;
          border-radius: 4px;
          font-size: 13px;
          margin-bottom: 10px;
          color: #bbf7d0;
        }

        .claim-btn {
          width: 100%;
          padding: 12px 20px;
          background: rgba(255, 255, 255, 0.2);
          border: 2px solid rgba(255, 255, 255, 0.5);
          color: white;
          border-radius: 8px;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.3s ease;
          margin-bottom: 10px;
        }

        .claim-btn.active:hover:not(:disabled) {
          background: rgba(255, 255, 255, 0.3);
          border-color: white;
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
        }

        .claim-btn.active:active:not(:disabled) {
          transform: translateY(0);
        }

        .claim-btn.disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .note {
          font-size: 12px;
          opacity: 0.8;
          margin: 0;
          line-height: 1.4;
        }
      `}</style>
    </div>
  );
}
