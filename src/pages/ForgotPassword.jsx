import React, { useState } from 'react';

export default function ForgotPassword({ onNavigate }) {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setMessage('');

    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Failed to send reset link');
        return;
      }

      setMessage('Reset link sent! Check your email for instructions.');
      setEmail('');

      // Redirect to login after 3 seconds
      setTimeout(() => onNavigate('/login'), 3000);
    } catch (err) {
      setError('Network error. Please try again.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{minHeight: '100vh', background: 'linear-gradient(135deg, #0a0a0a 0%, #1a1a1a 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px'}}>
      <div style={{width: '100%', maxWidth: '400px'}}>
        {/* Logo/Header */}
        <div style={{textAlign: 'center', marginBottom: '32px'}}>
          <div style={{display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '64px', height: '64px', borderRadius: '8px', background: 'linear-gradient(135deg, #D4AF37 0%, #AA8C2C 100%)', marginBottom: '16px'}}>
            <span style={{fontSize: '32px'}}>🔐</span>
          </div>
          <h1 style={{fontSize: '28px', fontWeight: 'bold', color: '#f5f5f5', margin: '0 0 8px 0'}}>Reset Password</h1>
          <p style={{color: '#888', marginTop: '8px', fontSize: '14px'}}>Enter your email to receive a reset link</p>
        </div>

        {/* Form Card */}
        <div style={{background: 'rgba(26, 26, 26, 0.5)', border: '2px solid rgba(212, 175, 55, 0.3)', borderRadius: '8px', padding: '32px', backdropFilter: 'blur(8px)'}}>
          {message && (
            <div style={{marginBottom: '24px', padding: '16px', background: 'rgba(212, 175, 55, 0.1)', border: '1px solid rgba(212, 175, 55, 0.3)', borderRadius: '8px', color: '#D4AF37', fontSize: '14px'}}>
              ✓ {message}
            </div>
          )}

          {error && (
            <div style={{marginBottom: '24px', padding: '16px', background: 'rgba(220, 38, 38, 0.1)', border: '1px solid rgba(220, 38, 38, 0.3)', borderRadius: '8px', color: '#ef4444', fontSize: '14px'}}>
              ✗ {error}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div style={{marginBottom: '24px'}}>
              <label style={{display: 'block', color: '#f5f5f5', fontSize: '14px', fontWeight: '500', marginBottom: '8px'}}>
                Email Address
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                style={{width: '100%', padding: '8px 16px', background: 'rgba(26, 26, 26, 0.5)', border: '1px solid rgba(212, 175, 55, 0.3)', borderRadius: '8px', color: '#f5f5f5', fontSize: '14px', outline: 'none', transition: 'all 0.2s'}}
                onFocus={(e) => e.target.style.borderColor = '#D4AF37'}
                onBlur={(e) => e.target.style.borderColor = 'rgba(212, 175, 55, 0.3)'}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              style={{width: '100%', padding: '12px', background: loading ? 'rgba(212, 175, 55, 0.5)' : 'linear-gradient(135deg, #D4AF37 0%, #AA8C2C 100%)', color: '#003366', fontWeight: '600', borderRadius: '8px', border: 'none', cursor: loading ? 'not-allowed' : 'pointer', transition: 'all 0.2s', opacity: loading ? 0.6 : 1}}
            >
              {loading ? 'Sending...' : 'Send Reset Link'}
            </button>
          </form>

          {/* Back to Login */}
          <div style={{marginTop: '24px', textAlign: 'center'}}>
            <button
              onClick={() => onNavigate('/login')}
              style={{background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: '14px', transition: 'color 0.2s', padding: 0}}
              onMouseEnter={(e) => e.target.style.color = '#D4AF37'}
              onMouseLeave={(e) => e.target.style.color = '#888'}
            >
              Back to Login
            </button>
          </div>
        </div>

        {/* Help Text */}
        <p style={{textAlign: 'center', color: '#666', fontSize: '12px', marginTop: '24px', lineHeight: '1.5'}}>
          We'll send you a secure link to reset your password.<br />
          Check your spam folder if you don't see the email.
        </p>
      </div>
    </div>
  );
}
