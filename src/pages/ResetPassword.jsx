import React, { useState, useEffect } from 'react';

export default function ResetPassword({ onNavigate }) {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [validating, setValidating] = useState(true);
  const [tokenValid, setTokenValid] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const token = new URLSearchParams(window.location.search).get('token');

  // Validate token on mount
  useEffect(() => {
    if (!token) {
      setError('No reset token provided');
      setValidating(false);
      return;
    }

    const validateToken = async () => {
      try {
        const res = await fetch(`/api/auth/validate-reset-token?token=${token}`);
        const data = await res.json();
        setTokenValid(data.valid);
        if (!data.valid) {
          setError('Reset link is invalid or expired. Please request a new one.');
        }
      } catch (err) {
        setError('Error validating reset link');
        console.error(err);
      } finally {
        setValidating(false);
      }
    };

    validateToken();
  }, [token]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');

    // Validation
    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);

    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, newPassword }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Failed to reset password');
        return;
      }

      setMessage('Password reset successful! Redirecting to login...');
      setNewPassword('');
      setConfirmPassword('');

      // Redirect to login after 2 seconds
      setTimeout(() => onNavigate('/login'), 2000);
    } catch (err) {
      setError('Network error. Please try again.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (validating) {
    return (
      <div style={{minHeight: '100vh', background: 'linear-gradient(135deg, #0a0a0a 0%, #1a1a1a 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
        <div style={{textAlign: 'center'}}>
          <div style={{width: '48px', height: '48px', border: '4px solid rgba(212, 175, 55, 0.3)', borderTop: '4px solid #D4AF37', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 16px'}}></div>
          <p style={{color: '#f5f5f5'}}>Validating reset link...</p>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      </div>
    );
  }

  return (
    <div style={{minHeight: '100vh', background: 'linear-gradient(135deg, #0a0a0a 0%, #1a1a1a 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px'}}>
      <div style={{width: '100%', maxWidth: '400px'}}>
        {/* Logo/Header */}
        <div style={{textAlign: 'center', marginBottom: '32px'}}>
          <div style={{display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '64px', height: '64px', borderRadius: '8px', background: 'linear-gradient(135deg, #D4AF37 0%, #AA8C2C 100%)', marginBottom: '16px'}}>
            <span style={{fontSize: '32px'}}>🔐</span>
          </div>
          <h1 style={{fontSize: '28px', fontWeight: 'bold', color: '#f5f5f5', margin: '0 0 8px 0'}}>Create New Password</h1>
          <p style={{color: '#888', marginTop: '8px', fontSize: '14px'}}>Choose a strong password for your account</p>
        </div>

        {/* Form Card */}
        <div style={{background: 'rgba(26, 26, 26, 0.5)', border: '2px solid rgba(212, 175, 55, 0.3)', borderRadius: '8px', padding: '32px', backdropFilter: 'blur(8px)'}}>
          {!tokenValid ? (
            <div style={{padding: '16px', background: 'rgba(220, 38, 38, 0.1)', border: '1px solid rgba(220, 38, 38, 0.3)', borderRadius: '8px', color: '#ef4444', fontSize: '14px', marginBottom: '16px'}}>
              {error || 'Invalid or expired reset link'}
            </div>
          ) : (
            <>
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
                {/* New Password */}
                <div style={{marginBottom: '24px'}}>
                  <label style={{display: 'block', color: '#f5f5f5', fontSize: '14px', fontWeight: '500', marginBottom: '8px'}}>
                    New Password
                  </label>
                  <div style={{position: 'relative'}}>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="••••••••"
                      required
                      style={{width: '100%', padding: '8px 32px 8px 16px', background: 'rgba(26, 26, 26, 0.5)', border: '1px solid rgba(212, 175, 55, 0.3)', borderRadius: '8px', color: '#f5f5f5', fontSize: '14px', outline: 'none', boxSizing: 'border-box', transition: 'all 0.2s'}}
                      onFocus={(e) => e.target.style.borderColor = '#D4AF37'}
                      onBlur={(e) => e.target.style.borderColor = 'rgba(212, 175, 55, 0.3)'}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      style={{position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#888', fontSize: '16px', transition: 'color 0.2s'}}
                      onMouseEnter={(e) => e.target.style.color = '#D4AF37'}
                      onMouseLeave={(e) => e.target.style.color = '#888'}
                    >
                      {showPassword ? '👁️' : '👁️‍🗨️'}
                    </button>
                  </div>
                  <p style={{fontSize: '12px', color: '#666', marginTop: '4px'}}>At least 8 characters</p>
                </div>

                {/* Confirm Password */}
                <div style={{marginBottom: '24px'}}>
                  <label style={{display: 'block', color: '#f5f5f5', fontSize: '14px', fontWeight: '500', marginBottom: '8px'}}>
                    Confirm Password
                  </label>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    style={{width: '100%', padding: '8px 16px', background: 'rgba(26, 26, 26, 0.5)', border: '1px solid rgba(212, 175, 55, 0.3)', borderRadius: '8px', color: '#f5f5f5', fontSize: '14px', outline: 'none', boxSizing: 'border-box', transition: 'all 0.2s'}}
                    onFocus={(e) => e.target.style.borderColor = '#D4AF37'}
                    onBlur={(e) => e.target.style.borderColor = 'rgba(212, 175, 55, 0.3)'}
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  style={{width: '100%', padding: '12px', background: loading ? 'rgba(212, 175, 55, 0.5)' : 'linear-gradient(135deg, #D4AF37 0%, #AA8C2C 100%)', color: '#003366', fontWeight: '600', borderRadius: '8px', border: 'none', cursor: loading ? 'not-allowed' : 'pointer', transition: 'all 0.2s', opacity: loading ? 0.6 : 1}}
                >
                  {loading ? 'Resetting...' : 'Reset Password'}
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
            </>
          )}
        </div>

        {/* Help Text */}
        <p style={{textAlign: 'center', color: '#666', fontSize: '12px', marginTop: '24px', lineHeight: '1.5'}}>
          Make sure to use a strong password with a mix of letters, numbers, and symbols.
        </p>
      </div>
    </div>
  );
}
