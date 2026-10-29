import React, { useState } from 'react';
import ClaimProfitButton from './ClaimProfitButton';

/**
 * DepositCard Component
 * Displays a deposit with:
 * - Locked status (plan cannot be changed)
 * - Manual trade trigger button
 * - Claim profit button
 */
export default function DepositCard({ deposit, onClaimed = () => {} }) {
  const [triggeringTrade, setTriggeringTrade] = useState(false);
  const [tradeError, setTradeError] = useState(null);
  const [tradeSuccess, setTradeSuccess] = useState(false);

  const handleTriggerTrade = async () => {
    try {
      setTriggeringTrade(true);
      setTradeError(null);
      setTradeSuccess(false);

      // Manual trade claiming is done through the trading endpoints
      const response = await fetch('/api/trading/claim-daily-trade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to trigger trade');
      }

      setTradeSuccess(true);
      onClaimed(data.earnedAmount);
      setTimeout(() => setTradeSuccess(false), 3000);
    } catch (err) {
      setTradeError(err.message);
      console.error('Error triggering trade:', err);
    } finally {
      setTriggeringTrade(false);
    }
  };

  return (
    <div className="deposit-card">
      <div className="deposit-header">
        <div className="deposit-amount">
          <span className="label">Deposit Amount</span>
          <span className="amount">${deposit.amount.toFixed(2)}</span>
        </div>

        <div className="deposit-status">
          {deposit.isLocked ? (
            <span className="locked-badge">
              🔒 Plan Locked
            </span>
          ) : (
            <span className="unlocked-badge">
              Unlock
            </span>
          )}
        </div>
      </div>

      <div className="deposit-meta">
        <span className="meta-item">
          <strong>Status:</strong> {deposit.status}
        </span>
        <span className="meta-item">
          <strong>Created:</strong> {new Date(deposit.createdAt).toLocaleDateString('en-US', { timeZone: 'Africa/Nairobi' })}
        </span>
      </div>

      {deposit.isLocked && (
        <div className="locked-info">
          ℹ️ Your plan is locked. You cannot change your deposit plan.
        </div>
      )}

      {/* Manual Trade Trigger */}
      <div className="trade-section">
        <h4>Manual Trade</h4>
        {tradeError && <div className="error-message">{tradeError}</div>}
        {tradeSuccess && <div className="success-message">✅ Trade triggered!</div>}

        <button
          onClick={handleTriggerTrade}
          disabled={triggeringTrade}
          className="trigger-trade-btn"
        >
          {triggeringTrade ? '⏳ Triggering...' : '▶ Trigger Trade'}
        </button>
        <p className="hint">
          Manually trigger a trade for this deposit. Trading is manual, not automatic.
        </p>
      </div>

      {/* Claim Profit Section */}
      <div className="profit-section">
        <h4>Daily Profit</h4>
        <ClaimProfitButton depositId={deposit.id} onClaimed={onClaimed} />
      </div>

      <style>{`
        .deposit-card {
          background: white;
          border-radius: 12px;
          padding: 20px;
          border: 1px solid #e5e7eb;
          margin-bottom: 20px;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
        }

        .deposit-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 15px;
          padding-bottom: 15px;
          border-bottom: 1px solid #e5e7eb;
        }

        .deposit-amount {
          display: flex;
          flex-direction: column;
        }

        .deposit-amount .label {
          font-size: 12px;
          color: #6b7280;
          font-weight: 500;
          margin-bottom: 4px;
        }

        .deposit-amount .amount {
          font-size: 24px;
          font-weight: bold;
          color: #1f2937;
          font-family: 'Courier New', monospace;
        }

        .deposit-status {
          text-align: right;
        }

        .locked-badge {
          display: inline-block;
          background: #10b981;
          color: white;
          padding: 6px 12px;
          border-radius: 6px;
          font-size: 12px;
          font-weight: 600;
          box-shadow: 0 2px 8px rgba(16, 185, 129, 0.2);
        }

        .unlocked-badge {
          display: inline-block;
          background: #f3f4f6;
          color: #6b7280;
          padding: 6px 12px;
          border-radius: 6px;
          font-size: 12px;
          font-weight: 600;
        }

        .deposit-meta {
          display: flex;
          gap: 20px;
          margin-bottom: 15px;
          font-size: 13px;
          color: #6b7280;
        }

        .meta-item strong {
          color: #1f2937;
          margin-right: 6px;
        }

        .locked-info {
          background: #dbeafe;
          border-left: 4px solid #3b82f6;
          padding: 12px;
          border-radius: 6px;
          color: #1e40af;
          font-size: 13px;
          margin-bottom: 15px;
        }

        .trade-section {
          background: #f9fafb;
          padding: 15px;
          border-radius: 8px;
          margin-bottom: 15px;
        }

        .trade-section h4 {
          margin: 0 0 12px 0;
          font-size: 14px;
          color: #1f2937;
          font-weight: 600;
        }

        .error-message {
          background: #fee2e2;
          border-left: 3px solid #ef4444;
          padding: 10px;
          border-radius: 4px;
          font-size: 13px;
          color: #991b1b;
          margin-bottom: 10px;
        }

        .success-message {
          background: #dcfce7;
          border-left: 3px solid #22c55e;
          padding: 10px;
          border-radius: 4px;
          font-size: 13px;
          color: #166534;
          margin-bottom: 10px;
        }

        .trigger-trade-btn {
          width: 100%;
          padding: 10px 16px;
          background: #3b82f6;
          color: white;
          border: none;
          border-radius: 6px;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.3s ease;
          margin-bottom: 10px;
        }

        .trigger-trade-btn:hover:not(:disabled) {
          background: #2563eb;
          box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);
          transform: translateY(-2px);
        }

        .trigger-trade-btn:active:not(:disabled) {
          transform: translateY(0);
        }

        .trigger-trade-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .hint {
          font-size: 12px;
          color: #6b7280;
          margin: 0;
          line-height: 1.4;
        }

        .profit-section {
          margin-top: 20px;
        }

        .profit-section h4 {
          margin: 0 0 15px 0;
          font-size: 14px;
          color: #1f2937;
          font-weight: 600;
        }

        @media (max-width: 640px) {
          .deposit-header {
            flex-direction: column;
            align-items: flex-start;
          }

          .deposit-meta {
            flex-direction: column;
            gap: 8px;
          }
        }
      `}</style>
    </div>
  );
}
