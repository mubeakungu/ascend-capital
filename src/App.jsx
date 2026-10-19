// REGISTRATION FORM CHANGES (replace existing AuthPage function)
// Add phone and pin to the registration form

// In the AuthPage component, add these fields after the name field:

function AuthPage({ mode, name, email, password, phone, pin, error, storageMode, referralCode, onNameChange, onEmailChange, onPasswordChange, onPhoneChange, onPinChange, onSubmit, onNavigate }) {
  const registering = mode === 'register';

  return (
    <main className="standalone-shell">
      <a className="brand standalone-brand" href="/" onClick={(event) => { event.preventDefault(); onNavigate('/'); }}>
        <img src="/ascend-logo.jpg" alt="Ascend Capital" className="brand-logo" style={{width: '40px', height: '40px', borderRadius: '50%'}} />
        <span className="brand-name">ascend<span>capital</span></span>
      </a>
      <section className="standalone-card">
        <div className="eyebrow"><span className="eyebrow-line" /> MEMBER ACCOUNT</div>
        <h1>{registering ? 'Create your account' : 'Welcome back'}<span className="title-period">.</span></h1>
        <p className="standalone-description">Sign in to manage your member profile and process real transactions.</p>
        {registering && referralCode && (
          <div className="referral-notice" role="note">
            <Icon name="link" size={16} />
            <div>
              <strong>Referral code detected</strong>
              <span>You're registering with referral code: <code>{referralCode}</code></span>
            </div>
          </div>
        )}
        {storageMode === 'ephemeral' && <div className="storage-warning" role="note"><strong>Temporary account storage</strong><span>This free hosting setup can erase account data when the service restarts. Do not reuse a password from another service.</span></div>}
        <form onSubmit={onSubmit}>
          {registering && <label className="account-field">Full name<input type="text" autoComplete="name" minLength={2} maxLength={80} value={name} onChange={(event) => onNameChange(event.target.value)} required /></label>}
          <label className="account-field">Email address<input type="email" autoComplete="email" maxLength={254} value={email} onChange={(event) => onEmailChange(event.target.value)} required /></label>
          {registering && (
            <>
              <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px'}}>
                <label className="account-field">Phone<input type="tel" autoComplete="tel" placeholder="+254 7XX XXX XXX" value={phone} onChange={(event) => onPhoneChange(event.target.value)} /></label>
                <label className="account-field">PIN (6 digits)<input type="text" inputMode="numeric" maxLength={6} placeholder="000000" value={pin} onChange={(event) => onPinChange(event.target.value)} /></label>
              </div>
            </>
          )}
          <label className="account-field">Password<input type="password" autoComplete={registering ? 'new-password' : 'current-password'} minLength={12} maxLength={128} value={password} onChange={(event) => onPasswordChange(event.target.value)} required />{registering && <span className="field-hint">Use at least 12 characters.</span>}</label>
          {error && <div className="modal-message" role="alert">{error}</div>}
          <button className="button button-primary modal-submit" type="submit">{registering ? 'Create account' : 'Sign in'} <Icon name="arrow" size={15} /></button>
        </form>
        <button className="account-switch" onClick={() => onNavigate(registering ? '/login' : '/register')}>{registering ? 'Already registered? Sign in' : 'New here? Create an account'}</button>
        <p className="modal-footnote"><Icon name="shield" size={13} /> Secure authentication · Real transactions</p>
      </section>
    </main>
  );
}

// =========================================================================
// APP.JS CHANGES - Add weekly salary display section
// =========================================================================

// In the App component, add these state variables:
const [weeklyData, setWeeklyData] = useState(null);
const [weeklyLoading, setWeeklyLoading] = useState(false);

// Add this function to fetch weekly salary data:
async function fetchWeeklySalary() {
  if (!account) return;
  setWeeklyLoading(true);
  try {
    const result = await requestApi('/api/referrals/weekly-salary');
    setWeeklyData(result);
  } catch (error) {
    console.error('Failed to fetch weekly salary:', error);
  } finally {
    setWeeklyLoading(false);
  }
}

// Call this in useEffect when account loads:
useEffect(() => {
  if (account) {
    fetchWeeklySalary();
  }
}, [account]);

// Add this new section in the page-content, after the referral rank table:

<section className="weekly-salary-section" style={{marginTop: '40px', padding: '20px', background: 'rgba(212, 175, 55, 0.05)', borderRadius: '8px', border: '2px solid rgba(212, 175, 55, 0.2)'}}>
  <div className="section-heading">
    <div>
      <div className="eyebrow"><span className="eyebrow-line" /> TIER BENEFITS</div>
      <h2>Weekly tier salary</h2>
      <p className="section-subtitle">Automatic weekly salary based on your current tier. Star 2 and above earn weekly.</p>
    </div>
  </div>

  {weeklyLoading ? (
    <p style={{textAlign: 'center', color: 'var(--text-light)'}}>Loading salary information...</p>
  ) : weeklyData ? (
    <>
      <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px', marginBottom: '20px'}}>
        <article style={{padding: '16px', background: 'rgba(0, 0, 0, 0.3)', borderRadius: '6px', borderLeft: '3px solid var(--gold)'}}>
          <span style={{fontSize: '12px', color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.5px'}}>Current tier</span>
          <div style={{fontSize: '24px', fontWeight: '700', color: 'var(--gold)', marginTop: '4px'}}>{weeklyData.tier || 'Not qualified'}</div>
          <span style={{fontSize: '12px', color: '#666', marginTop: '8px', display: 'block'}}>Direct: {weeklyData.directCount} · Team: {weeklyData.teamTotal}</span>
        </article>
        <article style={{padding: '16px', background: 'rgba(0, 0, 0, 0.3)', borderRadius: '6px', borderLeft: '3px solid var(--gold)'}}>
          <span style={{fontSize: '12px', color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.5px'}}>Weekly salary</span>
          <div style={{fontSize: '24px', fontWeight: '700', color: 'var(--gold)', marginTop: '4px'}}>
            {weeklyData.weeklySalary > 0 ? `$${weeklyData.weeklySalary.toLocaleString('en-US')}` : 'None'}
          </div>
          <span style={{fontSize: '12px', color: '#666', marginTop: '8px', display: 'block'}}>Paid every Monday</span>
        </article>
        <article style={{padding: '16px', background: 'rgba(0, 0, 0, 0.3)', borderRadius: '6px', borderLeft: '3px solid var(--gold)'}}>
          <span style={{fontSize: '12px', color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.5px'}}>Total earned</span>
          <div style={{fontSize: '24px', fontWeight: '700', color: 'var(--gold)', marginTop: '4px'}}>
            ${weeklyData.totalEarned.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
          </div>
          <span style={{fontSize: '12px', color: '#666', marginTop: '8px', display: 'block'}}>All-time salaries</span>
        </article>
      </div>

      {weeklyData.recentPayments && weeklyData.recentPayments.length > 0 && (
        <div style={{marginTop: '20px'}}>
          <h3 style={{fontSize: '16px', marginBottom: '12px', color: 'var(--text-light)'}}>Recent payments</h3>
          <div style={{display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '300px', overflowY: 'auto'}}>
            {weeklyData.recentPayments.map((payment, idx) => (
              <div key={idx} style={{display: 'flex', justifyContent: 'space-between', padding: '10px', background: 'rgba(0, 0, 0, 0.4)', borderRadius: '4px', fontSize: '13px'}}>
                <span>{payment.week}</span>
                <span style={{color: 'var(--gold)', fontWeight: '600'}}>+${payment.amount.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  ) : null}
</section>

// =========================================================================
// ACCOUNT DIALOG CHANGES - Add phone/PIN to profile modal
// =========================================================================

// In the account state initialization, add:
const [accountPhone, setAccountPhone] = useState('');
const [accountPin, setAccountPin] = useState('');

// Update on account load:
setAccountPhone(account?.phone ?? '');
setAccountPin(''); // PIN is not displayed/stored in modal for security

// In the account form submission, send phone/pin only on register:
const result = await requestApi(`/api/auth/${register ? 'register' : 'login'}`, {
  method: 'POST',
  body: JSON.stringify({
    ...(register ? { name: accountName } : {}),
    email: accountEmail,
    password: accountPassword,
    ...(register && accountPhone ? { phone: accountPhone } : {}),
    ...(register && accountPin ? { pin: accountPin } : {}),
    ...(register && referralCode ? { referralCode } : {}),
  }),
});

// Add phone/PIN fields to account modal (registration only):
{accountMode === 'register' && (
  <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px'}}>
    <label className="account-field">Phone number
      <input type="tel" placeholder="+254 7XX XXX XXX" value={accountPhone} onChange={(event) => setAccountPhone(event.target.value)} />
    </label>
    <label className="account-field">PIN (6 digits)
      <input type="text" inputMode="numeric" maxLength={6} placeholder="000000" value={accountPin} onChange={(event) => setAccountPin(event.target.value)} />
    </label>
  </div>
)}
