import React, { useState, useEffect } from 'react';
import AdminDashboard from './AdminDashboard';

export default function App() {
  const [account, setAccount] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showLoginForm, setShowLoginForm] = useState(true);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [registerEmail, setRegisterEmail] = useState('');
  const [registerPassword, setRegisterPassword] = useState('');
  const [registerName, setRegisterName] = useState('');
  const [registerReferralCode, setRegisterReferralCode] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);
  const [message, setMessage] = useState('');
  const [referralCode, setReferralCode] = useState('');
  const [transactionData, setTransactionData] = useState(null);
  const [showAdminPasswordDialog, setShowAdminPasswordDialog] = useState(false);
  const [adminPasswordChange, setAdminPasswordChange] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });

  useEffect(() => {
    checkSession();
  }, []);

  const checkSession = async () => {
    try {
      const res = await fetch('/api/auth/me', {
        credentials: 'include',
      });
      if (res.ok) {
        const data = await res.json();
        setAccount(data.account);
        setShowLoginForm(false);
      }
    } catch (err) {
      console.error('Session check failed');
    }
    setLoading(false);
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setMessage('');
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: loginEmail,
          password: loginPassword,
        }),
        credentials: 'include',
      });

      if (res.ok) {
        const data = await res.json();
        setAccount(data.account);
        setShowLoginForm(false);
        setLoginEmail('');
        setLoginPassword('');
      } else {
        const data = await res.json();
        setMessage(data.error || 'Login failed');
      }
    } catch (err) {
      setMessage('Error logging in');
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setMessage('');
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: registerName,
          email: registerEmail,
          password: registerPassword,
          referralCode: registerReferralCode || undefined,
        }),
        credentials: 'include',
      });

      if (res.ok) {
        const data = await res.json();
        setAccount(data.account);
        setShowLoginForm(false);
        setIsRegistering(false);
        setRegisterEmail('');
        setRegisterPassword('');
        setRegisterName('');
        setRegisterReferralCode('');
      } else {
        const data = await res.json();
        setMessage(data.error || 'Registration failed');
      }
    } catch (err) {
      setMessage('Error registering');
    }
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include',
      });
    } catch (err) {
      console.error('Logout error');
    }
    setAccount(null);
    setShowLoginForm(true);
    setMessage('');
  };

  const handleAdminLogout = async () => {
    try {
      await fetch('/api/admin/auth/logout', {
        method: 'POST',
        credentials: 'include',
      });
    } catch (err) {
      console.error('Admin logout error');
    }
    setAccount(null);
    setShowLoginForm(true);
  };

  const handleChangeAdminPassword = async (e) => {
    e.preventDefault();
    
    if (adminPasswordChange.newPassword !== adminPasswordChange.confirmPassword) {
      setMessage('Passwords do not match');
      return;
    }

    try {
      const res = await fetch('/api/admin/auth/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword: adminPasswordChange.currentPassword,
          newPassword: adminPasswordChange.newPassword,
        }),
        credentials: 'include',
      });

      if (res.ok) {
        setMessage('Password changed successfully');
        setShowAdminPasswordDialog(false);
        setAdminPasswordChange({
          currentPassword: '',
          newPassword: '',
          confirmPassword: ''
        });
        setAccount(null);
        setShowLoginForm(true);
      } else {
        const data = await res.json();
        setMessage(data.error || 'Failed to change password');
      }
    } catch (err) {
      setMessage('Error changing password');
    }
  };

  const getReferralCode = async () => {
    try {
      const res = await fetch('/api/referrals/code', {
        credentials: 'include',
      });
      if (res.ok) {
        const data = await res.json();
        setReferralCode(data.code);
      }
    } catch (err) {
      console.error('Failed to get referral code');
    }
  };

  const fetchTransactionData = async () => {
    try {
      const res = await fetch('/api/transactions', {
        credentials: 'include',
      });
      if (res.ok) {
        const data = await res.json();
        setTransactionData(data);
      }
    } catch (err) {
      console.error('Failed to fetch transaction data');
    }
  };

  const openAdminPasswordDialog = () => {
    setShowAdminPasswordDialog(true);
  };

  if (loading) {
    return <div className="loading">Loading...</div>;
  }

  // Admin dashboard
  if (account && account.role === 'admin') {
    return <AdminDashboard onLogout={handleAdminLogout} />;
  }

  // Member login/register
  if (showLoginForm) {
    return (
      <div className="auth-container">
        <div className="auth-card">
          <h1>Ascend Capital</h1>
          {message && <div className="message error">{message}</div>}

          {!isRegistering ? (
            <form onSubmit={handleLogin}>
              <h2>Login</h2>
              <div className="form-group">
                <label>Email</label>
                <input
                  type="email"
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label>Password</label>
                <input
                  type="password"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  required
                />
              </div>
              <button type="submit" className="btn-primary">Login</button>
              <div className="auth-toggle">
                Don't have an account? <button type="button" onClick={() => setIsRegistering(true)}>Register</button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleRegister}>
              <h2>Register</h2>
              <div className="form-group">
                <label>Full Name</label>
                <input
                  type="text"
                  value={registerName}
                  onChange={(e) => setRegisterName(e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label>Email</label>
                <input
                  type="email"
                  value={registerEmail}
                  onChange={(e) => setRegisterEmail(e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label>Password</label>
                <input
                  type="password"
                  value={registerPassword}
                  onChange={(e) => setRegisterPassword(e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label>Referral Code (Optional)</label>
                <input
                  type="text"
                  value={registerReferralCode}
                  onChange={(e) => setRegisterReferralCode(e.target.value)}
                />
              </div>
              <button type="submit" className="btn-primary">Register</button>
              <div className="auth-toggle">
                Already have an account? <button type="button" onClick={() => setIsRegistering(false)}>Login</button>
              </div>
            </form>
          )}
        </div>

        <style jsx>{`
          .auth-container {
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          }

          .auth-card {
            background: white;
            padding: 40px;
            border-radius: 8px;
            box-shadow: 0 10px 25px rgba(0, 0, 0, 0.2);
            width: 100%;
            max-width: 400px;
          }

          .auth-card h1 {
            text-align: center;
            color: #333;
            margin-bottom: 30px;
          }

          .auth-card h2 {
            color: #555;
            margin-bottom: 20px;
          }

          .form-group {
            margin-bottom: 20px;
          }

          .form-group label {
            display: block;
            margin-bottom: 8px;
            color: #555;
            font-weight: 500;
          }

          .form-group input {
            width: 100%;
            padding: 12px;
            border: 1px solid #ddd;
            border-radius: 4px;
            font-size: 14px;
            box-sizing: border-box;
          }

          .btn-primary {
            width: 100%;
            padding: 12px;
            background: #667eea;
            color: white;
            border: none;
            border-radius: 4px;
            font-size: 16px;
            cursor: pointer;
            margin-top: 10px;
          }

          .btn-primary:hover {
            background: #5568d3;
          }

          .auth-toggle {
            text-align: center;
            margin-top: 20px;
            color: #666;
            font-size: 14px;
          }

          .auth-toggle button {
            background: none;
            border: none;
            color: #667eea;
            cursor: pointer;
            text-decoration: underline;
          }

          .message {
            padding: 12px;
            border-radius: 4px;
            margin-bottom: 20px;
            font-size: 14px;
          }

          .message.error {
            background: #f8d7da;
            color: #721c24;
          }

          .loading {
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            font-size: 18px;
            color: #666;
          }
        `}</style>
      </div>
    );
  }

  // Member dashboard
  return (
    <div className="member-dashboard">
      <header className="dashboard-header">
        <h1>Ascend Capital - Member Dashboard</h1>
        <button onClick={handleLogout} className="logout-btn">Logout</button>
      </header>

      <div className="dashboard-content">
        <div className="profile-section">
          <h2>Welcome, {account?.name}</h2>
          <p>Email: {account?.email}</p>
        </div>

        <div className="dashboard-grid">
          <div className="card">
            <h3>Quick Actions</h3>
            <button onClick={getReferralCode} className="btn-action">Get Referral Code</button>
            <button onClick={fetchTransactionData} className="btn-action">View Transactions</button>
          </div>

          {referralCode && (
            <div className="card">
              <h3>Your Referral Code</h3>
              <div className="referral-code">{referralCode}</div>
              <p>Share this code with friends to earn commissions</p>
            </div>
          )}

          {transactionData && (
            <div className="card">
              <h3>Account Balance</h3>
              <div className="balance-display">${transactionData.balance.toFixed(2)}</div>
              <p>Pending Withdrawals: ${transactionData.pendingWithdrawals.toFixed(2)}</p>
            </div>
          )}
        </div>

        {showAdminPasswordDialog && (
          <div className="modal-overlay">
            <div className="modal-content">
              <h2>Change Admin Password</h2>
              <form onSubmit={handleChangeAdminPassword}>
                <div className="form-group">
                  <label>Current Password</label>
                  <input
                    type="password"
                    value={adminPasswordChange.currentPassword}
                    onChange={(e) => setAdminPasswordChange({
                      ...adminPasswordChange,
                      currentPassword: e.target.value
                    })}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>New Password</label>
                  <input
                    type="password"
                    value={adminPasswordChange.newPassword}
                    onChange={(e) => setAdminPasswordChange({
                      ...adminPasswordChange,
                      newPassword: e.target.value
                    })}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Confirm Password</label>
                  <input
                    type="password"
                    value={adminPasswordChange.confirmPassword}
                    onChange={(e) => setAdminPasswordChange({
                      ...adminPasswordChange,
                      confirmPassword: e.target.value
                    })}
                    required
                  />
                </div>
                {message && <div className="message error">{message}</div>}
                <div className="modal-actions">
                  <button type="submit" className="btn-primary">Change Password</button>
                  <button type="button" onClick={() => setShowAdminPasswordDialog(false)} className="btn-secondary">Cancel</button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>

      <style jsx>{`
        .member-dashboard {
          background: #f5f5f5;
          min-height: 100vh;
        }

        .dashboard-header {
          background: #333;
          color: white;
          padding: 20px;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .dashboard-header h1 {
          margin: 0;
        }

        .logout-btn {
          background: #dc3545;
          color: white;
          border: none;
          padding: 8px 16px;
          border-radius: 4px;
          cursor: pointer;
        }

        .dashboard-content {
          padding: 20px;
          max-width: 1200px;
          margin: 0 auto;
        }

        .profile-section {
          background: white;
          padding: 20px;
          border-radius: 8px;
          margin-bottom: 20px;
        }

        .profile-section h2 {
          margin: 0 0 10px 0;
        }

        .dashboard-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
          gap: 20px;
        }

        .card {
          background: white;
          padding: 20px;
          border-radius: 8px;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
        }

        .card h3 {
          margin-top: 0;
          color: #333;
        }

        .btn-action {
          display: block;
          width: 100%;
          padding: 10px;
          background: #667eea;
          color: white;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          margin-bottom: 10px;
          font-size: 14px;
        }

        .btn-action:hover {
          background: #5568d3;
        }

        .referral-code {
          font-size: 20px;
          font-weight: bold;
          color: #667eea;
          padding: 15px;
          background: #f8f9fa;
          border-radius: 4px;
          text-align: center;
          margin: 10px 0;
        }

        .balance-display {
          font-size: 28px;
          font-weight: bold;
          color: #28a745;
          margin: 15px 0;
        }

        .modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.5);
          display: flex;
          justify-content: center;
          align-items: center;
          z-index: 1000;
        }

        .modal-content {
          background: white;
          padding: 30px;
          border-radius: 8px;
          max-width: 400px;
          width: 100%;
        }

        .form-group {
          margin-bottom: 20px;
        }

        .form-group label {
          display: block;
          margin-bottom: 8px;
          color: #555;
          font-weight: 500;
        }

        .form-group input {
          width: 100%;
          padding: 10px;
          border: 1px solid #ddd;
          border-radius: 4px;
          box-sizing: border-box;
        }

        .modal-actions {
          display: flex;
          gap: 10px;
        }

        .btn-primary, .btn-secondary {
          flex: 1;
          padding: 10px;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          font-size: 14px;
        }

        .btn-primary {
          background: #667eea;
          color: white;
        }

        .btn-secondary {
          background: #ddd;
          color: #333;
        }

        .message {
          padding: 12px;
          border-radius: 4px;
          margin-bottom: 20px;
        }

        .message.error {
          background: #f8d7da;
          color: #721c24;
        }
      `}</style>
    </div>
  );
}
