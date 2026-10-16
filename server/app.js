import { randomBytes, scrypt, scryptSync, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { DatabaseSync } from 'node:sqlite';
import express from 'express';

const scryptAsync = promisify(scrypt);
const SESSION_COOKIE = 'ascend_session';
const SESSION_DURATION_SECONDS = 60 * 60 * 24 * 30;
const PASSWORD_BYTES = 64;
const PASSWORD_OPTIONS = { N: 16384, r: 8, p: 1 };
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DEVELOPER_EMAIL = process.env.DEVELOPER_EMAIL || 'developer@ascend.local';

function accountView(row) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role ?? 'member',
    createdAt: row.created_at,
    status: row.status ?? 'active',
  };
}

function readCookie(request, name) {
  const prefix = `${name}=`;
  const value = request.headers.cookie
    ?.split(';')
    .map((cookie) => cookie.trim())
    .find((cookie) => cookie.startsWith(prefix))
    ?.slice(prefix.length);

  return value ? decodeURIComponent(value) : null;
}

function setSessionCookie(response, token, secure) {
  response.append(
    'Set-Cookie',
    `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_DURATION_SECONDS}${secure ? '; Secure' : ''}`,
  );
}

function clearSessionCookie(response, secure) {
  response.append(
    'Set-Cookie',
    `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure ? '; Secure' : ''}`,
  );
}

function hashToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

function validationMessage({ name, email, password }, requireName) {
  if (requireName && (typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 80)) {
    return 'Name must be between 2 and 80 characters.';
  }
  if (typeof email !== 'string' || email.length > 254 || !EMAIL_PATTERN.test(email.trim())) {
    return 'Enter a valid email address.';
  }
  if (typeof password !== 'string' || password.length < 12 || password.length > 128) {
    return 'Password must be between 12 and 128 characters.';
  }
  return null;
}

function createRateLimiter({ limit, windowMs }) {
  const attempts = new Map();
  let nextCleanup = 0;

  return (request, response, next) => {
    const now = Date.now();
    if (now >= nextCleanup) {
      for (const [ip, entry] of attempts) {
        if (entry.resetAt <= now) attempts.delete(ip);
      }
      nextCleanup = now + windowMs;
    }

    const ip = request.ip;
    let entry = attempts.get(ip);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      attempts.set(ip, entry);
    }

    entry.count += 1;
    if (entry.count > limit) {
      response.set('Retry-After', String(Math.ceil((entry.resetAt - now) / 1000)));
      return response.status(429).json({ error: 'Too many account requests. Try again later.' });
    }
    return next();
  };
}

export function createApp({ databasePath }) {
  const db = new DatabaseSync(databasePath);
  db.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE COLLATE NOCASE,
      password_salt TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'member' CHECK(role IN ('member', 'admin')),
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'frozen'))
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS sessions_expiry_idx ON sessions(expires_at);
    CREATE TABLE IF NOT EXISTS deposits (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      amount REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected')),
      requested_at TEXT NOT NULL,
      approved_at TEXT,
      approved_by TEXT REFERENCES accounts(id),
      rejection_reason TEXT
    );
    CREATE INDEX IF NOT EXISTS deposits_account_idx ON deposits(account_id);
    CREATE INDEX IF NOT EXISTS deposits_status_idx ON deposits(status);
    CREATE TABLE IF NOT EXISTS withdrawals (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      amount REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected')),
      requested_at TEXT NOT NULL,
      approved_at TEXT,
      approved_by TEXT REFERENCES accounts(id),
      rejection_reason TEXT
    );
    CREATE INDEX IF NOT EXISTS withdrawals_account_idx ON withdrawals(account_id);
    CREATE INDEX IF NOT EXISTS withdrawals_status_idx ON withdrawals(status);
    CREATE TABLE IF NOT EXISTS password_changes (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      changed_by TEXT REFERENCES accounts(id),
      changed_at TEXT NOT NULL,
      is_admin_change INTEGER DEFAULT 0,
      temp_password TEXT,
      is_developer_visible INTEGER DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS password_changes_account_idx ON password_changes(account_id);
    CREATE TABLE IF NOT EXISTS account_activity (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      activity_type TEXT NOT NULL,
      details TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS activity_account_idx ON account_activity(account_id);
  `);

  const accountColumns = db.prepare('PRAGMA table_info(accounts)').all();
  if (!accountColumns.some((column) => column.name === 'status')) {
    db.exec("ALTER TABLE accounts ADD COLUMN status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'frozen'))");
  }

  const app = express();
  const secureCookie = process.env.NODE_ENV === 'production';
  const trustProxyHops = Number(process.env.TRUST_PROXY_HOPS ?? 0);
  if (!Number.isInteger(trustProxyHops) || trustProxyHops < 0) {
    throw new Error('TRUST_PROXY_HOPS must be a non-negative integer.');
  }
  const authRateLimit = createRateLimiter({ limit: 10, windowMs: 15 * 60 * 1000 });
  const updateRateLimit = createRateLimiter({ limit: 30, windowMs: 15 * 60 * 1000 });
  const adminLimiter = createRateLimiter({ limit: 60, windowMs: 15 * 60 * 1000 });

  app.disable('x-powered-by');
  app.set('trust proxy', trustProxyHops);
  app.use((request, response, next) => {
    response.set({
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'same-origin',
      'X-Frame-Options': 'DENY',
    });

    if (request.path.startsWith('/api/') && ['POST', 'PATCH', 'PUT', 'DELETE'].includes(request.method)) {
      const origin = request.get('origin');
      if (origin && origin !== `${request.protocol}://${request.get('host')}`) {
        return response.status(403).json({ error: 'Request origin is not allowed.' });
      }
      if (!request.is('application/json')) {
        return response.status(415).json({ error: 'Content-Type must be application/json.' });
      }
    }
    return next();
  });
  app.use(express.json({ limit: '10kb', strict: true }));

  function currentAccount(request) {
    const token = readCookie(request, SESSION_COOKIE);
    if (!token) return null;

    const tokenHash = hashToken(token);
    const now = Date.now();
    db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(now);
    const row = db.prepare(`
      SELECT accounts.id, accounts.name, accounts.email, accounts.created_at, accounts.role, accounts.status
      FROM sessions
      JOIN accounts ON accounts.id = sessions.account_id
      WHERE sessions.token_hash = ? AND sessions.expires_at > ?
    `).get(tokenHash, now);
    return row ?? null;
  }

  function requireAccount(request, response, next) {
    const account = currentAccount(request);
    if (!account) return response.status(401).json({ error: 'Sign in to continue.' });
    if (account.status === 'frozen') return response.status(403).json({ error: 'Your account has been frozen. Contact support.' });
    request.account = account;
    return next();
  }

  function requireAdmin(request, response, next) {
    if (request.account.role !== 'admin') {
      return response.status(403).json({ error: 'Administrator access is required.' });
    }
    return next();
  }

  function logActivity(accountId, activityType, details = null) {
    const id = randomBytes(16).toString('hex');
    db.prepare(`
      INSERT INTO account_activity (id, account_id, activity_type, details, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, accountId, activityType, details ? JSON.stringify(details) : null, new Date().toISOString());
  }

  function seedInitialAdmin() {
    const emailInput = process.env.INITIAL_ADMIN_EMAIL;
    const password = process.env.INITIAL_ADMIN_PASSWORD;
    if (!emailInput && !password) return;
    if (!emailInput || !password) {
      throw new Error('Set both INITIAL_ADMIN_EMAIL and INITIAL_ADMIN_PASSWORD to configure the initial admin.');
    }

    const email = emailInput.trim().toLowerCase();
    const validationError = validationMessage({ email, password }, false);
    if (validationError) throw new Error(`Invalid initial admin configuration: ${validationError}`);

    const existing = db.prepare('SELECT id FROM accounts WHERE email = ?').get(email);
    if (existing) {
      db.prepare("UPDATE accounts SET role = 'admin' WHERE id = ?").run(existing.id);
      return;
    }

    const salt = randomBytes(16);
    const passwordHash = scryptSync(password, salt, PASSWORD_BYTES, PASSWORD_OPTIONS);
    const id = randomBytes(16).toString('hex');
    db.prepare(`
      INSERT INTO accounts (id, name, email, password_salt, password_hash, created_at, role)
      VALUES (?, ?, ?, ?, ?, ?, 'admin')
    `).run(id, emailInput.trim(), email, salt.toString('hex'), passwordHash.toString('hex'), new Date().toISOString());
  }

  async function createAccountSession(accountId, response) {
    const token = randomBytes(32).toString('base64url');
    const expiresAt = Date.now() + SESSION_DURATION_SECONDS * 1000;
    db.prepare('INSERT INTO sessions (token_hash, account_id, expires_at) VALUES (?, ?, ?)')
      .run(hashToken(token), accountId, expiresAt);
    setSessionCookie(response, token, secureCookie);
  }

  seedInitialAdmin();

  app.get('/api/health', (_request, response) => response.json({
    status: 'ok',
    accountStorage: process.env.ACCOUNT_STORAGE_MODE ?? 'local',
  }));

  app.get('/api/public-config', (_request, response) => response.json({
    binanceWalletAddress: process.env.BINANCE_WALLET_ADDRESS?.trim() ?? '',
  }));

  app.post('/api/auth/register', authRateLimit, async (request, response, next) => {
    try {
      const input = request.body ?? {};
      const error = validationMessage(input, true);
      if (error) return response.status(400).json({ error });

      const email = input.email.trim().toLowerCase();
      const existing = db.prepare('SELECT id FROM accounts WHERE email = ?').get(email);
      if (existing) return response.status(409).json({ error: 'An account with this email already exists.' });

      const salt = randomBytes(16);
      const passwordHash = await scryptAsync(input.password, salt, PASSWORD_BYTES, PASSWORD_OPTIONS);
      const id = randomBytes(16).toString('hex');
      const createdAt = new Date().toISOString();
      db.prepare(`
        INSERT INTO accounts (id, name, email, password_salt, password_hash, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(id, input.name.trim(), email, salt.toString('hex'), passwordHash.toString('hex'), createdAt);

      const account = db.prepare('SELECT id, name, email, created_at, role, status FROM accounts WHERE id = ?').get(id);
      await createAccountSession(id, response);
      logActivity(id, 'account_created', { method: 'self_registration' });
      return response.status(201).json({ account: accountView(account) });
    } catch (error) {
      return next(error);
    }
  });

  app.post('/api/auth/login', authRateLimit, async (request, response, next) => {
    try {
      const input = request.body ?? {};
      const error = validationMessage(input, false);
      if (error) return response.status(400).json({ error });

      const email = input.email.trim().toLowerCase();
      const row = db.prepare(`
        SELECT id, name, email, password_salt, password_hash, created_at, role, status
        FROM accounts WHERE email = ?
      `).get(email);

      const salt = row ? Buffer.from(row.password_salt, 'hex') : Buffer.alloc(16);
      const storedHash = row ? Buffer.from(row.password_hash, 'hex') : Buffer.alloc(PASSWORD_BYTES);
      const candidate = await scryptAsync(input.password, salt, PASSWORD_BYTES, PASSWORD_OPTIONS);
      if (!row || !timingSafeEqual(candidate, storedHash)) {
        return response.status(401).json({ error: 'Email or password is incorrect.' });
      }

      if (row.status === 'frozen') {
        logActivity(row.id, 'login_attempt_frozen_account');
        return response.status(403).json({ error: 'Your account has been frozen. Contact support.' });
      }

      db.prepare('DELETE FROM sessions WHERE account_id = ?').run(row.id);
      await createAccountSession(row.id, response);
      logActivity(row.id, 'login_successful');
      return response.json({ account: accountView(row) });
    } catch (error) {
      return next(error);
    }
  });

  app.get('/api/auth/me', (request, response) => {
    const account = currentAccount(request);
    return response.json({ account: account ? accountView(account) : null });
  });

  app.patch('/api/auth/profile', updateRateLimit, requireAccount, (request, response) => {
    const name = request.body?.name;
    if (typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 80) {
      return response.status(400).json({ error: 'Name must be between 2 and 80 characters.' });
    }
    db.prepare('UPDATE accounts SET name = ? WHERE id = ?').run(name.trim(), request.account.id);
    const account = db.prepare('SELECT id, name, email, created_at, role, status FROM accounts WHERE id = ?')
      .get(request.account.id);
    logActivity(request.account.id, 'profile_updated', { name: name.trim() });
    return response.json({ account: accountView(account) });
  });

  app.post('/api/auth/logout', (request, response, next) => {
    try {
      const token = readCookie(request, SESSION_COOKIE);
      if (token) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hashToken(token));
      clearSessionCookie(response, secureCookie);
      return response.status(204).end();
    } catch (error) {
      return next(error);
    }
  });

  // Admin password change (admin changes own password on login)
  app.patch('/api/auth/admin-password', updateRateLimit, requireAccount, requireAdmin, async (request, response, next) => {
    try {
      const { currentPassword, newPassword } = request.body ?? {};
      const error = validationMessage({ email: 'temp@test.com', password: newPassword }, false);
      if (error) return response.status(400).json({ error });

      const account = db.prepare('SELECT password_salt, password_hash FROM accounts WHERE id = ?')
        .get(request.account.id);
      
      const salt = Buffer.from(account.password_salt, 'hex');
      const storedHash = Buffer.from(account.password_hash, 'hex');
      const candidate = await scryptAsync(currentPassword, salt, PASSWORD_BYTES, PASSWORD_OPTIONS);
      
      if (!timingSafeEqual(candidate, storedHash)) {
        return response.status(401).json({ error: 'Current password is incorrect.' });
      }

      const newSalt = randomBytes(16);
      const newHash = await scryptAsync(newPassword, newSalt, PASSWORD_BYTES, PASSWORD_OPTIONS);
      db.prepare('UPDATE accounts SET password_salt = ?, password_hash = ? WHERE id = ?')
        .run(newSalt.toString('hex'), newHash.toString('hex'), request.account.id);

      // Log the password change with developer visibility
      const changeId = randomBytes(16).toString('hex');
      db.prepare(`
        INSERT INTO password_changes (id, account_id, changed_by, changed_at, is_admin_change, is_developer_visible)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(changeId, request.account.id, request.account.id, new Date().toISOString(), 0, 1);

      logActivity(request.account.id, 'admin_password_changed_self');
      return response.json({ success: true, message: 'Password changed successfully. Developer has been notified.' });
    } catch (error) {
      return next(error);
    }
  });

  // Client deposits
  app.post('/api/deposits', updateRateLimit, requireAccount, async (request, response, next) => {
    try {
      const { amount } = request.body ?? {};
      if (typeof amount !== 'number' || amount <= 0) {
        return response.status(400).json({ error: 'Amount must be a positive number.' });
      }

      const id = randomBytes(16).toString('hex');
      const now = new Date().toISOString();
      db.prepare(`
        INSERT INTO deposits (id, account_id, amount, requested_at)
        VALUES (?, ?, ?, ?)
      `).run(id, request.account.id, amount, now);

      logActivity(request.account.id, 'deposit_requested', { amount });
      return response.status(201).json({
        deposit: {
          id,
          amount,
          status: 'pending',
          requestedAt: now,
        }
      });
    } catch (error) {
      return next(error);
    }
  });

  app.get('/api/deposits/:id', requireAccount, (request, response) => {
    const deposit = db.prepare(`
      SELECT id, account_id, amount, status, requested_at, approved_at, rejection_reason
      FROM deposits WHERE id = ? AND account_id = ?
    `).get(request.params.id, request.account.id);

    if (!deposit) return response.status(404).json({ error: 'Deposit not found.' });
    return response.json({ deposit });
  });

  // Client withdrawals
  app.post('/api/withdrawals', updateRateLimit, requireAccount, async (request, response, next) => {
    try {
      const { amount } = request.body ?? {};
      if (typeof amount !== 'number' || amount <= 0) {
        return response.status(400).json({ error: 'Amount must be a positive number.' });
      }

      const id = randomBytes(16).toString('hex');
      const now = new Date().toISOString();
      db.prepare(`
        INSERT INTO withdrawals (id, account_id, amount, requested_at)
        VALUES (?, ?, ?, ?)
      `).run(id, request.account.id, amount, now);

      logActivity(request.account.id, 'withdrawal_requested', { amount });
      return response.status(201).json({
        withdrawal: {
          id,
          amount,
          status: 'pending',
          requestedAt: now,
        }
      });
    } catch (error) {
      return next(error);
    }
  });

  app.get('/api/withdrawals/:id', requireAccount, (request, response) => {
    const withdrawal = db.prepare(`
      SELECT id, account_id, amount, status, requested_at, approved_at, rejection_reason
      FROM withdrawals WHERE id = ? AND account_id = ?
    `).get(request.params.id, request.account.id);

    if (!withdrawal) return response.status(404).json({ error: 'Withdrawal not found.' });
    return response.json({ withdrawal });
  });

  // Admin endpoints
  app.get('/api/admin/accounts', adminLimiter, requireAccount, requireAdmin, (request, response) => {
    const accounts = db.prepare(`
      SELECT id, name, email, created_at, role, status
      FROM accounts
      ORDER BY created_at DESC
      LIMIT 100
    `).all().map(accountView);
    return response.json({ accounts });
  });

  app.patch('/api/admin/accounts/:id/profile', adminLimiter, requireAccount, requireAdmin, (request, response) => {
    const name = request.body?.name;
    if (typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 80) {
      return response.status(400).json({ error: 'Name must be between 2 and 80 characters.' });
    }

    const target = db.prepare('SELECT id, role FROM accounts WHERE id = ?').get(request.params.id);
    if (!target) return response.status(404).json({ error: 'Member account not found.' });
    if (target.role === 'admin') return response.status(403).json({ error: 'Administrator profiles cannot be changed here.' });

    db.prepare('UPDATE accounts SET name = ? WHERE id = ?').run(name.trim(), target.id);
    const account = db.prepare('SELECT id, name, email, created_at, role, status FROM accounts WHERE id = ?').get(target.id);
    logActivity(target.id, 'profile_changed_by_admin', { admin_id: request.account.id, name: name.trim() });
    return response.json({ account: accountView(account) });
  });

  // Admin change client password
  app.patch('/api/admin/accounts/:id/password', adminLimiter, requireAccount, requireAdmin, async (request, response, next) => {
    try {
      const target = db.prepare('SELECT id, role FROM accounts WHERE id = ?').get(request.params.id);
      if (!target) return response.status(404).json({ error: 'Account not found.' });
      if (target.role === 'admin') return response.status(403).json({ error: 'Cannot change admin passwords here.' });

      const tempPassword = randomBytes(8).toString('hex');
      const salt = randomBytes(16);
      const passwordHash = await scryptAsync(tempPassword, salt, PASSWORD_BYTES, PASSWORD_OPTIONS);
      
      db.prepare('UPDATE accounts SET password_salt = ?, password_hash = ? WHERE id = ?')
        .run(salt.toString('hex'), passwordHash.toString('hex'), target.id);

      // Log password change with temp password visible to developer
      const changeId = randomBytes(16).toString('hex');
      db.prepare(`
        INSERT INTO password_changes (id, account_id, changed_by, changed_at, is_admin_change, temp_password, is_developer_visible)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(changeId, target.id, request.account.id, new Date().toISOString(), 1, tempPassword, 1);

      logActivity(target.id, 'password_reset_by_admin', { admin_id: request.account.id });
      
      return response.json({
        success: true,
        message: 'Password reset. Temporary password logged for developer review.',
        tempPassword,
        developerAccessUrl: `/api/admin/password-changes?changeId=${changeId}`,
      });
    } catch (error) {
      return next(error);
    }
  });

  // Developer endpoint to view password changes
  app.get('/api/admin/password-changes', adminLimiter, requireAccount, requireAdmin, (request, response) => {
    if (request.account.email !== DEVELOPER_EMAIL) {
      return response.status(403).json({ error: 'Only the developer can access this.' });
    }

    const changeId = request.query.changeId;
    if (changeId) {
      const change = db.prepare(`
        SELECT id, account_id, changed_by, changed_at, is_admin_change, temp_password
        FROM password_changes WHERE id = ? AND is_developer_visible = 1
      `).get(changeId);
      if (!change) return response.status(404).json({ error: 'Password change record not found.' });
      return response.json({ change });
    }

    const changes = db.prepare(`
      SELECT id, account_id, changed_by, changed_at, is_admin_change
      FROM password_changes WHERE is_developer_visible = 1
      ORDER BY changed_at DESC
      LIMIT 50
    `).all();
    return response.json({ changes });
  });

  // Admin freeze/unfreeze accounts (fraud detection)
  app.patch('/api/admin/accounts/:id/status', adminLimiter, requireAccount, requireAdmin, (request, response) => {
    const { status, reason } = request.body ?? {};
    if (!['active', 'frozen'].includes(status)) {
      return response.status(400).json({ error: 'Status must be "active" or "frozen".' });
    }

    const target = db.prepare('SELECT id, role, status FROM accounts WHERE id = ?').get(request.params.id);
    if (!target) return response.status(404).json({ error: 'Account not found.' });
    if (target.role === 'admin') return response.status(403).json({ error: 'Cannot freeze admin accounts.' });

    db.prepare('UPDATE accounts SET status = ? WHERE id = ?').run(status, target.id);
    logActivity(target.id, `account_${status}`, { admin_id: request.account.id, reason: reason || 'No reason provided' });

    const account = db.prepare('SELECT id, name, email, created_at, role, status FROM accounts WHERE id = ?').get(target.id);
    return response.json({
      account: accountView(account),
      message: `Account ${status === 'frozen' ? 'frozen' : 'unfrozen'} successfully.`,
    });
  });

  // Admin view deposits
  app.get('/api/admin/deposits', adminLimiter, requireAccount, requireAdmin, (request, response) => {
    const status = request.query.status || 'pending';
    const deposits = db.prepare(`
      SELECT d.id, d.account_id, d.amount, d.status, d.requested_at, d.approved_at, d.rejection_reason,
             a.name, a.email
      FROM deposits d
      JOIN accounts a ON d.account_id = a.id
      WHERE d.status = ?
      ORDER BY d.requested_at DESC
      LIMIT 100
    `).all(status);
    return response.json({ deposits });
  });

  // Admin approve deposit
  app.patch('/api/admin/deposits/:id/approve', adminLimiter, requireAccount, requireAdmin, (request, response) => {
    const deposit = db.prepare('SELECT id, account_id, status FROM deposits WHERE id = ?').get(request.params.id);
    if (!deposit) return response.status(404).json({ error: 'Deposit not found.' });
    if (deposit.status !== 'pending') return response.status(400).json({ error: 'Only pending deposits can be approved.' });

    const now = new Date().toISOString();
    db.prepare('UPDATE deposits SET status = ?, approved_at = ?, approved_by = ? WHERE id = ?')
      .run('approved', now, request.account.id, deposit.id);

    logActivity(deposit.account_id, 'deposit_approved', { deposit_id: deposit.id, admin_id: request.account.id });

    const updated = db.prepare('SELECT id, account_id, amount, status, requested_at, approved_at FROM deposits WHERE id = ?')
      .get(request.params.id);
    return response.json({ deposit: updated, message: 'Deposit approved.' });
  });

  // Admin reject deposit
  app.patch('/api/admin/deposits/:id/reject', adminLimiter, requireAccount, requireAdmin, (request, response) => {
    const { reason } = request.body ?? {};
    if (!reason || typeof reason !== 'string') {
      return response.status(400).json({ error: 'Rejection reason is required.' });
    }

    const deposit = db.prepare('SELECT id, account_id, status FROM deposits WHERE id = ?').get(request.params.id);
    if (!deposit) return response.status(404).json({ error: 'Deposit not found.' });
    if (deposit.status !== 'pending') return response.status(400).json({ error: 'Only pending deposits can be rejected.' });

    const now = new Date().toISOString();
    db.prepare('UPDATE deposits SET status = ?, approved_at = ?, approved_by = ?, rejection_reason = ? WHERE id = ?')
      .run('rejected', now, request.account.id, reason, deposit.id);

    logActivity(deposit.account_id, 'deposit_rejected', { deposit_id: deposit.id, admin_id: request.account.id, reason });

    const updated = db.prepare('SELECT id, account_id, amount, status, requested_at, approved_at, rejection_reason FROM deposits WHERE id = ?')
      .get(request.params.id);
    return response.json({ deposit: updated, message: 'Deposit rejected.' });
  });

  // Admin view withdrawals
  app.get('/api/admin/withdrawals', adminLimiter, requireAccount, requireAdmin, (request, response) => {
    const status = request.query.status || 'pending';
    const withdrawals = db.prepare(`
      SELECT w.id, w.account_id, w.amount, w.status, w.requested_at, w.approved_at, w.rejection_reason,
             a.name, a.email
      FROM withdrawals w
      JOIN accounts a ON w.account_id = a.id
      WHERE w.status = ?
      ORDER BY w.requested_at DESC
      LIMIT 100
    `).all(status);
    return response.json({ withdrawals });
  });

  // Admin approve withdrawal
  app.patch('/api/admin/withdrawals/:id/approve', adminLimiter, requireAccount, requireAdmin, (request, response) => {
    const withdrawal = db.prepare('SELECT id, account_id, status FROM withdrawals WHERE id = ?').get(request.params.id);
    if (!withdrawal) return response.status(404).json({ error: 'Withdrawal not found.' });
    if (withdrawal.status !== 'pending') return response.status(400).json({ error: 'Only pending withdrawals can be approved.' });

    const now = new Date().toISOString();
    db.prepare('UPDATE withdrawals SET status = ?, approved_at = ?, approved_by = ? WHERE id = ?')
      .run('approved', now, request.account.id, withdrawal.id);

    logActivity(withdrawal.account_id, 'withdrawal_approved', { withdrawal_id: withdrawal.id, admin_id: request.account.id });

    const updated = db.prepare('SELECT id, account_id, amount, status, requested_at, approved_at FROM withdrawals WHERE id = ?')
      .get(request.params.id);
    return response.json({ withdrawal: updated, message: 'Withdrawal approved.' });
  });

  // Admin reject withdrawal
  app.patch('/api/admin/withdrawals/:id/reject', adminLimiter, requireAccount, requireAdmin, (request, response) => {
    const { reason } = request.body ?? {};
    if (!reason || typeof reason !== 'string') {
      return response.status(400).json({ error: 'Rejection reason is required.' });
    }

    const withdrawal = db.prepare('SELECT id, account_id, status FROM withdrawals WHERE id = ?').get(request.params.id);
    if (!withdrawal) return response.status(404).json({ error: 'Withdrawal not found.' });
    if (withdrawal.status !== 'pending') return response.status(400).json({ error: 'Only pending withdrawals can be rejected.' });

    const now = new Date().toISOString();
    db.prepare('UPDATE withdrawals SET status = ?, approved_at = ?, approved_by = ?, rejection_reason = ? WHERE id = ?')
      .run('rejected', now, request.account.id, reason, withdrawal.id);

    logActivity(withdrawal.account_id, 'withdrawal_rejected', { withdrawal_id: withdrawal.id, admin_id: request.account.id, reason });

    const updated = db.prepare('SELECT id, account_id, amount, status, requested_at, approved_at, rejection_reason FROM withdrawals WHERE id = ?')
      .get(request.params.id);
    return response.json({ withdrawal: updated, message: 'Withdrawal rejected.' });
  });

  // Admin view client activity (track client output)
  app.get('/api/admin/accounts/:id/activity', adminLimiter, requireAccount, requireAdmin, (request, response) => {
    const account = db.prepare('SELECT id FROM accounts WHERE id = ?').get(request.params.id);
    if (!account) return response.status(404).json({ error: 'Account not found.' });

    const activity = db.prepare(`
      SELECT id, activity_type, details, created_at
      FROM account_activity
      WHERE account_id = ?
      ORDER BY created_at DESC
      LIMIT 200
    `).all(request.params.id);

    const parsed = activity.map(a => ({
      ...a,
      details: a.details ? JSON.parse(a.details) : null,
    }));

    return response.json({ activity: parsed });
  });

  app.use('/api', (_request, response) => response.status(404).json({ error: 'API endpoint not found.' }));

  app.use((error, _request, response, _next) => {
    if (error instanceof SyntaxError && 'body' in error) {
      return response.status(400).json({ error: 'Request body must contain valid JSON.' });
    }
    console.error('Request failed:', error);
    return response.status(500).json({ error: 'An unexpected server error occurred.' });
  });

  return { app, close: () => db.close() };
}
