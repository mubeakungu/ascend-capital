// FIXED: Comprehensive Wallet Breakdown Section (replace lines 1997-2113)
// Use the CORRECT response structure from backend

{account && comprehensiveWallet && (
  <section style={{ background: 'rgba(212, 175, 55, 0.08)', border: '2px solid rgba(212, 175, 55, 0.3)', borderRadius: '8px', padding: '24px', marginBottom: '20px' }}>
    <div style={{ marginBottom: '24px' }}>
      <div style={{ fontSize: '12px', color: '#D4AF37', textTransform: 'uppercase', fontWeight: '600', letterSpacing: '0.5px', marginBottom: '8px' }}>💼 COMPLETE WALLET BREAKDOWN</div>
      <h2 style={{ margin: '0', fontSize: '24px', color: '#fff' }}>Your Ascend Wallet</h2>
    </div>

    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '24px' }}>
      <article style={{ background: 'rgba(212, 175, 55, 0.1)', border: '1px solid rgba(212, 175, 55, 0.2)', borderRadius: '6px', padding: '16px' }}>
        <div style={{ fontSize: '11px', color: '#888', marginBottom: '6px', textTransform: 'uppercase' }}>Total Income</div>
        <div style={{ fontSize: '24px', fontWeight: '700', color: '#D4AF37', marginBottom: '4px' }}>
          ${(comprehensiveWallet?.totalIncome || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </div>
        <div style={{ fontSize: '11px', color: '#666' }}>Deposits + All Earnings</div>
      </article>

      <article style={{ background: 'rgba(212, 175, 55, 0.1)', border: '1px solid rgba(212, 175, 55, 0.2)', borderRadius: '6px', padding: '16px' }}>
        <div style={{ fontSize: '11px', color: '#888', marginBottom: '6px', textTransform: 'uppercase' }}>Total Withdrawals</div>
        <div style={{ fontSize: '24px', fontWeight: '700', color: '#ff6b6b', marginBottom: '4px' }}>
          -${(comprehensiveWallet?.totalWithdrawals || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </div>
        <div style={{ fontSize: '11px', color: '#666' }}>Amount withdrawn</div>
      </article>

      <article style={{ background: 'rgba(76, 175, 80, 0.15)', border: '2px solid rgba(76, 175, 80, 0.4)', borderRadius: '6px', padding: '16px' }}>
        <div style={{ fontSize: '11px', color: '#4CAF50', marginBottom: '6px', textTransform: 'uppercase', fontWeight: '600' }}>✓ Net Wallet Balance</div>
        <div style={{ fontSize: '28px', fontWeight: '700', color: '#4CAF50', marginBottom: '4px' }}>
          ${(comprehensiveWallet?.balance || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </div>
        <div style={{ fontSize: '11px', color: '#4CAF50' }}>Available balance</div>
      </article>
    </div>

    <div style={{ borderTop: '1px solid rgba(212, 175, 55, 0.2)', paddingTop: '20px', marginBottom: '20px' }}>
      <div style={{ fontSize: '12px', color: '#D4AF37', fontWeight: '600', marginBottom: '12px', textTransform: 'uppercase' }}>📊 How Your Balance Is Calculated</div>
      <div style={{ background: 'rgba(212, 175, 55, 0.05)', padding: '16px', borderRadius: '6px', fontSize: '13px', color: '#ccc', fontFamily: 'monospace', lineHeight: '1.8' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', borderBottom: '1px solid rgba(212, 175, 55, 0.2)', paddingBottom: '8px' }}>
          <span>Total Deposits:</span>
          <span style={{ color: '#4CAF50', fontWeight: '600' }}>${(comprehensiveWallet?.totalDeposits || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', borderBottom: '1px solid rgba(212, 175, 55, 0.2)', paddingBottom: '8px' }}>
          <span>+ Trading Profits:</span>
          <span style={{ color: '#FFB84D', fontWeight: '600' }}>${(comprehensiveWallet?.earnings?.tradingProfit || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', borderBottom: '1px solid rgba(212, 175, 55, 0.2)', paddingBottom: '8px' }}>
          <span>+ Referral Commissions:</span>
          <span style={{ color: '#FFB84D', fontWeight: '600' }}>${(comprehensiveWallet?.earnings?.referralCommissions || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', borderBottom: '1px solid rgba(212, 175, 55, 0.2)', paddingBottom: '8px' }}>
          <span>+ Tier Rewards:</span>
          <span style={{ color: '#FFB84D', fontWeight: '600' }}>${(comprehensiveWallet?.earnings?.tierRewards || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', borderBottom: '1px solid rgba(212, 175, 55, 0.2)', paddingBottom: '8px' }}>
          <span>+ Weekly Salaries:</span>
          <span style={{ color: '#FFB84D', fontWeight: '600' }}>${(comprehensiveWallet?.earnings?.weeklySalary || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', borderBottom: '2px solid rgba(212, 175, 55, 0.4)', paddingBottom: '8px', fontWeight: '600' }}>
          <span>= Total Income:</span>
          <span style={{ color: '#D4AF37' }}>${(comprehensiveWallet?.totalIncome || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px', borderBottom: '1px solid rgba(212, 175, 55, 0.2)', paddingBottom: '8px' }}>
          <span>- Total Withdrawals:</span>
          <span style={{ color: '#ff6b6b', fontWeight: '600' }}>-${(comprehensiveWallet?.totalWithdrawals || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', color: '#4CAF50', fontWeight: '700', padding: '8px 0' }}>
          <span>✓ Your Wallet Balance:</span>
          <span>${(comprehensiveWallet?.balance || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
        </div>
      </div>
    </div>

    <div style={{ borderTop: '1px solid rgba(212, 175, 55, 0.2)', paddingTop: '20px' }}>
      <div style={{ fontSize: '12px', color: '#D4AF37', fontWeight: '600', marginBottom: '12px', textTransform: 'uppercase' }}>💰 Earnings Breakdown by Type</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px' }}>
        <div style={{ background: 'rgba(212, 175, 55, 0.05)', padding: '12px', borderRadius: '6px', borderLeft: '3px solid #D4AF37' }}>
          <div style={{ fontSize: '11px', color: '#888', marginBottom: '4px' }}>💰 Trading Profit</div>
          <div style={{ fontSize: '16px', fontWeight: '700', color: '#fff' }}>
            ${(comprehensiveWallet?.earnings?.tradingProfit || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
        </div>

        <div style={{ background: 'rgba(212, 175, 55, 0.05)', padding: '12px', borderRadius: '6px', borderLeft: '3px solid #FFB84D' }}>
          <div style={{ fontSize: '11px', color: '#888', marginBottom: '4px' }}>🎁 Tier Rewards</div>
          <div style={{ fontSize: '16px', fontWeight: '700', color: '#fff' }}>
            ${(comprehensiveWallet?.earnings?.tierRewards || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
        </div>

        <div style={{ background: 'rgba(212, 175, 55, 0.05)', padding: '12px', borderRadius: '6px', borderLeft: '3px solid #E8C547' }}>
          <div style={{ fontSize: '11px', color: '#888', marginBottom: '4px' }}>📊 Weekly Salary</div>
          <div style={{ fontSize: '16px', fontWeight: '700', color: '#fff' }}>
            ${(comprehensiveWallet?.earnings?.weeklySalary || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
        </div>

        <div style={{ background: 'rgba(212, 175, 55, 0.05)', padding: '12px', borderRadius: '6px', borderLeft: '3px solid #AA8C2C' }}>
          <div style={{ fontSize: '11px', color: '#888', marginBottom: '4px' }}>👥 Referral Commission</div>
          <div style={{ fontSize: '16px', fontWeight: '700', color: '#fff' }}>
            ${(comprehensiveWallet?.earnings?.referralCommissions || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
        </div>
      </div>
    </div>
  </section>
)}
