import { useState, useEffect } from 'react';
import { RegistrationPage } from './RegistrationPage';
import './styles.css';

export default function App() {
  const [account, setAccount] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check if user is logged in
    const checkAuth = async () => {
      try {
        const response = await fetch('/api/auth/me', {
          credentials: 'same-origin',
        });
        if (response.ok) {
          const data = await response.json();
          setAccount(data.account);
        }
      } catch (error) {
        console.error('Auth check failed:', error);
      } finally {
        setLoading(false);
      }
    };

    checkAuth();
  }, []);

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
        <p>Loading...</p>
      </div>
    );
  }

  // Not logged in - show registration/login
  if (!account) {
    return <RegistrationPage onLoginSuccess={setAccount} />;
  }

  // Logged in - show member dashboard
  return (
    <div className="container">
      <h1>Welcome, {account.name}</h1>
      <p>Email: {account.email}</p>
      <p>Account ID: {account.id}</p>
      <p>Member dashboard coming soon...</p>
    </div>
  );
}
