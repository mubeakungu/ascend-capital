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
const TX_TYPES = ['deposit', 'withdrawal'];
const TX_STATUSES = ['pending', 'approved', 'rejected'];
const MAX_TX_AMOUNT = 10_000_000;
const ADMIN_USERNAME = 'admin';
// Temporary password for the first admin login; the admin is forced to change it. INITIAL_ADMIN_PASSWORD overrides it.
const DEFAULT_INITIAL_ADMIN_PASSWORD = 'Admin@123';

function accountView(row) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role ?? 'member',
    status: row.status ?? 'active',
    mustChangePassword: Boolean(row.must_change_password),
    createdAt: row.created_at,
  };
}

function transactionView(row, { admin = false } = {}) {
  const view = {
    id: row.id,
    type: row.type,
    amount: row.amount_cents / 100,
    reference: row.reference,
    status: row.status,
    createdAt: row.created_at,
    reviewedAt: row.reviewed_at ?? null,
    reviewNote: row.review_note ?? '',
  };
  if (admin) {
    view.accountId = row.account_id;
    view.accountName = row.account_name;
    view.accountEmail = row.account_email;
    view.reviewedBy = row.reviewed_by ?? null;
  }
  return view;
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

function passwordError(password) {
  if (typeof password !== 'string' || password.length < 12 || password.length > 128) {
    return 'Password must be between 12 and 128 characters.';
  }
  return null;
}

function validationMessage({ name, email, password }, requireName) {
  if (requireName && (typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 80)) {
    return 'Name must be between 2 and 80 characters.';
  }
  if (typeof email !== 'string' || email.length > 254 || !EMAIL_PATTERN.test(email.trim())) {
    return 'Enter a valid email address.';
  }
  return passwordError(password);
}

// Login accepts an email address, or the built-in admin username.
function loginMessage({ email, password }) {
  const identifier = typeof email === 'string' ? email.trim().toLowerCase() : '';
  if (identifier !== ADMIN_USERNAME && (identifier.length > 254 || !EMAIL_PATTERN.test(identifier))) {
    return 'Enter a valid email address or username.';
  }
  // Login only checks that a password was sent; the 12-character minimum applies when one is set.
  return typeof password === 'string' && password.length > 0 && password.length <= 128 ? null : 'Enter your password.';
}

async function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = await scryptAsync(password, salt, PASSWORD_BYTES, PASSWORD_OPTIONS);
  return { salt: salt.toString('hex'), hash: hash.toString('hex') };
}

function cleanText(value, { min, max }) {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (text.length < min || text.length > max) return null;
  return text;
}

function parseAmountCents(value) {
  const number = typeof value === 'string' ? Number(value.trim()) : value;
  if (typeof number !== 'number' || !Number.isFinite(number) || number <= 0 || number > MAX_TX_AMOUNT) return null;
  const cents = Math.round(number * 100);
  if (Math.abs(number * 100 - cents) > 1e-6) return null;
  return cents;
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
      role TEXT NOT NULL DEFAULT 'member' CHECK(role IN ('member', 'admin'))
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS sessions_expiry_idx ON sessions(expires_at);
  `);
  const accountColumns = db.prepare('PRAGMA table_info(accounts)').all();
  if (!accountColumns.some((column) => column.name === 'role')) {
    db.exec("ALTER TABLE accounts ADD COLUMN role TEXT NOT NULL DEFAULT 'member' CHECK(role IN ('member', 'admin'))");
  }
  if (!accountColumns.some((column) => column.name === 'status')) {
    db.exec("ALTER TABLE accounts ADD COLUMN status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'held'))");
  }
  if (!accountColumns.some((column) => column.name === 'hold_reason')) {
    db.exec('ALTER TABLE accounts ADD COLUMN hold_reason TEXT');
  }
  if (!accountColumns.some((column) => column.name === 'held_at')) {
    db.exec('ALTER TABLE accounts ADD COLUMN held_at TEXT');
  }
  if (!accountColumns.some((column) => column.name === 'must_change_password')) {
    db.exec('ALTER TABLE accounts ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0');
  }
  db.exec(`
    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      type TEXT NOT NULL CHECK(type IN ('deposit', 'withdrawal')),
      amount_cents INTEGER NOT NULL CHECK(amount_cents > 0),
      reference TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected')),
      created_at TEXT NOT NULL,
      reviewed_by TEXT,
      reviewed_at TEXT,
      review_note TEXT
    );
    CREATE INDEX IF NOT EXISTS transactions_account_idx ON transactions(account_id, created_at);
    CREATE INDEX IF NOT EXISTS transactions_status_idx ON transactions(status, created_at);
    CREATE UNIQUE INDEX IF NOT EXISTS transactions_deposit_reference_idx
      ON transactions(reference COLLATE NOCASE)
      WHERE type = 'deposit' AND status IN ('pending', 'approved');
    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      actor_id TEXT,
      actor_email TEXT,
      action TEXT NOT NULL,
      target_id TEXT,
      detail TEXT,
      ip TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS audit_log_created_idx ON audit_log(created_at);
  `);

  const app = express();
  const secureCookie = process.env.NODE_ENV === 'production';
  // Behind Render's proxy (production) trust one hop by default so request.protocol
  // reflects X-Forwarded-Proto (https) and request.ip is the real client IP.
  // TRUST_PROXY_HOPS still overrides this when set.
  const trustProxyHops = Number(process.env.TRUST_PROXY_HOPS ?? (secureCookie ? 1 : 0));
  if (!Number.isInteger(trustProxyHops) || trustProxyHops < 0) {
    throw new Error('TRUST_PROXY_HOPS must be a non-negative integer.');
  }
  const authRateLimit = createRateLimiter({ limit: 10, windowMs: 15 * 60 * 1000 });
  const passwordRateLimit = createRateLimiter({ limit: 10, windowMs: 15 * 60 * 1000 });
  const updateRateLimit = createRateLimiter({ limit: 30, windowMs: 15 * 60 * 1000 });

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

  function withTransaction(work) {
    db.exec('BEGIN IMMEDIATE');
    try {
      const result = work();
      db.exec('COMMIT');
      return result;
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }

  function recordAudit(request, action, targetId, detail = {}) {
    db.prepare(`
      INSERT INTO audit_log (actor_id, actor_email, action, target_id, detail, ip, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      request.account?.id ?? null,
      request.account?.email ?? null,
      action,
      targetId ?? null,
      JSON.stringify(detail),
      request.ip ?? null,
      new Date().toISOString(),
    );
  }

  function approvedBalanceCents(accountId) {
    const row = db.prepare(`
      SELECT COALESCE(SUM(CASE WHEN type = 'deposit' THEN amount_cents ELSE -amount_cents END), 0) AS balance
      FROM transactions
      WHERE account_id = ? AND status = 'approved'
    `).get(accountId);
    return row.balance;
  }

  function pendingWithdrawalsCents(accountId) {
    const row = db.prepare(`
      SELECT COALESCE(SUM(amount_cents), 0) AS total
      FROM transactions
      WHERE account_id = ? AND type = 'withdrawal' AND status = 'pending'
    `).get(accountId);
    return row.total;
  }

  function getTransaction(id) {
    return db.prepare(`
      SELECT t.*, a.name AS account_name, a.email AS account_email
      FROM transactions t
      JOIN accounts a ON a.id = t.account_id
      WHERE t.id = ?
    `).get(id);
  }

  function currentAccount(request) {
    const token = readCookie(request, SESSION_COOKIE);
    if (!token) return null;

    const tokenHash = hashToken(token);
    const now = Date.now();
    db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(now);
    const row = db.prepare(`
      SELECT accounts.id, accounts.name, accounts.email, accounts.created_at, accounts.role, accounts.status,
        accounts.must_change_password
      FROM sessions
      JOIN accounts ON accounts.id = sessions.account_id
      WHERE sessions.token_hash = ? AND sessions.expires_at > ? AND accounts.status = 'active'
    `).get(tokenHash, now);
    return row ?? null;
  }

  function requireAccount(request, response, next) {
    const account = currentAccount(request);
    if (!account) return response.status(401).json({ error: 'Sign in to continue.' });
    request.account = account;
    return next();
  }

  function requireAdmin(request, response, next) {
    if (request.account.role !== 'admin') {
      return response.status(403).json({ error: 'Administrator access is required.' });
    }
    if (request.account.must_change_password) {
      return response.status(403).json({
        error: 'Change your temporary password to continue.',
        code: 'PASSWORD_CHANGE_REQUIRED',
      });
    }
    return next();
  }

  function seedInitialAdmin() {
    const password = process.env.INITIAL_ADMIN_PASSWORD || DEFAULT_INITIAL_ADMIN_PASSWORD;
    // The temporary seed password may be short; the admin must replace it with 12+ characters on first login.
    if (password.length > 128) throw new Error('INITIAL_ADMIN_PASSWORD must be at most 128 characters.');

    // Reset switch: set RESET_ADMIN_PASSWORD=true, redeploy, sign in, then remove the variable.
    const resetRequested = process.env.RESET_ADMIN_PASSWORD === 'true';
    const existing = db.prepare('SELECT id FROM accounts WHERE email = ?').get(ADMIN_USERNAME);
    if (existing && !resetRequested) {
      db.prepare("UPDATE accounts SET role = 'admin' WHERE id = ?").run(existing.id);
      return;
    }

    const salt = randomBytes(16);
    const passwordHash = scryptSync(password, salt, PASSWORD_BYTES, PASSWORD_OPTIONS);

    if (existing) {
      withTransaction(() => {
        db.prepare(`
          UPDATE accounts
          SET role = 'admin', status = 'active', password_salt = ?, password_hash = ?, must_change_password = 1
          WHERE id = ?
        `).run(salt.toString('hex'), passwordHash.toString('hex'), existing.id);
        db.prepare('DELETE FROM sessions WHERE account_id = ?').run(existing.id);
        recordAudit({}, 'admin.password_reset_switch', existing.id, {});
      });
      return;
    }

    const id = randomBytes(16).toString('hex');
    db.prepare(`
      INSERT INTO accounts (id, name, email, password_salt, password_hash, created_at, role, must_change_password)
      VALUES (?, 'Administrator', ?, ?, ?, ?, 'admin', 1)
    `).run(id, ADMIN_USERNAME, salt.toString('hex'), passwordHash.toString('hex'), new Date().toISOString());
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

      const account = db.prepare('SELECT id, name, email, created_at, role, status, must_change_password FROM accounts WHERE id = ?').get(id);
      await createAccountSession(id, response);
      return response.status(201).json({ account: accountView(account) });
    } catch (error) {
      return next(error);
    }
  });

  app.post('/api/auth/login', authRateLimit, async (request, response, next) => {
    try {
      const input = request.body ?? {};
      const error = loginMessage(input);
      if (error) return response.status(400).json({ error });

      const email = input.email.trim().toLowerCase();
      const row = db.prepare(`
        SELECT id, name, email, password_salt, password_hash, created_at, role, status, must_change_password
        FROM accounts WHERE email = ?
      `).get(email);

      const salt = row ? Buffer.from(row.password_salt, 'hex') : Buffer.alloc(16);
      const storedHash = row ? Buffer.from(row.password_hash, 'hex') : Buffer.alloc(PASSWORD_BYTES);
      const candidate = await scryptAsync(input.password, salt, PASSWORD_BYTES, PASSWORD_OPTIONS);
      if (!row || !timingSafeEqual(candidate, storedHash)) {
        return response.status(401).json({ error: 'Email or password is incorrect.' });
      }

      if (row.status === 'held') {
        return response.status(403).json({ error: 'This account is on hold. Please contact support.' });
      }

      db.prepare('DELETE FROM sessions WHERE account_id = ?').run(row.id);
      await createAccountSession(row.id, response);
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
    const account = db.prepare('SELECT id, name, email, created_at, role, status, must_change_password FROM accounts WHERE id = ?')
      .get(request.account.id);
    return response.json({ account: accountView(account) });
  });

  // Self-service password change (members and admins). Requires the current password.
  app.post('/api/auth/password', passwordRateLimit, requireAccount, async (request, response, next) => {
    try {
      const { currentPassword, newPassword } = request.body ?? {};
      if (typeof currentPassword !== 'string' || currentPassword.length === 0 || currentPassword.length > 128) {
        return response.status(400).json({ error: 'Enter your current password.' });
      }
      const newError = passwordError(newPassword);
      if (newError) return response.status(400).json({ error: newError });
      if (newPassword === currentPassword) {
        return response.status(400).json({ error: 'New password must be different from the current password.' });
      }

      const row = db.prepare('SELECT password_salt, password_hash FROM accounts WHERE id = ?').get(request.account.id);
      const candidate = await scryptAsync(
        currentPassword,
        Buffer.from(row.password_salt, 'hex'),
        PASSWORD_BYTES,
        PASSWORD_OPTIONS,
      );
      if (!timingSafeEqual(candidate, Buffer.from(row.password_hash, 'hex'))) {
        return response.status(401).json({ error: 'Current password is incorrect.' });
      }

      const hashed = await hashPassword(newPassword);
      withTransaction(() => {
        db.prepare('UPDATE accounts SET password_salt = ?, password_hash = ?, must_change_password = 0 WHERE id = ?')
          .run(hashed.salt, hashed.hash, request.account.id);
        db.prepare('DELETE FROM sessions WHERE account_id = ?').run(request.account.id);
        recordAudit(request, 'password.change_self', request.account.id, { role: request.account.role });
      });
      await createAccountSession(request.account.id, response);
      return response.json({ ok: true });
    } catch (error) {
      return next(error);
    }
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

  // ---------------------------------------------------------------------------
  // Member deposit / withdrawal requests (created as "pending" for admin review)
  // ---------------------------------------------------------------------------
  app.post('/api/transactions', updateRateLimit, requireAccount, (request, response, next) => {
    try {
      if (request.account.role === 'admin') {
        return response.status(403).json({ error: 'Administrator accounts cannot request transactions.' });
      }
      const input = request.body ?? {};
      if (!TX_TYPES.includes(input.type)) {
        return response.status(400).json({ error: 'Type must be deposit or withdrawal.' });
      }
      const amountCents = parseAmountCents(input.amount);
      if (amountCents === null) {
        return response.status(400).json({ error: 'Enter a valid amount with at most two decimal places.' });
      }
      const reference = cleanText(input.reference, { min: 3, max: 120 });
      if (reference === null) {
        return response.status(400).json({
          error: input.type === 'deposit'
            ? 'Enter the payment reference or transaction code (3-120 characters).'
            : 'Enter the withdrawal destination (3-120 characters).',
        });
      }

      if (input.type === 'withdrawal') {
        const available = approvedBalanceCents(request.account.id) - pendingWithdrawalsCents(request.account.id);
        if (amountCents > available) {
          return response.status(409).json({ error: 'Withdrawal exceeds your available balance.' });
        }
      } else {
        const duplicate = db.prepare(`
          SELECT id FROM transactions
          WHERE type = 'deposit' AND reference = ? COLLATE NOCASE AND status IN ('pending', 'approved')
        `).get(reference);
        if (duplicate) {
          return response.status(409).json({ error: 'A deposit with this reference was already submitted.' });
        }
      }

      const id = randomBytes(16).toString('hex');
      db.prepare(`
        INSERT INTO transactions (id, account_id, type, amount_cents, reference, status, created_at)
        VALUES (?, ?, ?, ?, ?, 'pending', ?)
      `).run(id, request.account.id, input.type, amountCents, reference, new Date().toISOString());

      return response.status(201).json({ transaction: transactionView(getTransaction(id)) });
    } catch (error) {
      return next(error);
    }
  });

  app.get('/api/transactions', requireAccount, (request, response) => {
    const rows = db.prepare(`
      SELECT t.*, a.name AS account_name, a.email AS account_email
      FROM transactions t
      JOIN accounts a ON a.id = t.account_id
      WHERE t.account_id = ?
      ORDER BY t.created_at DESC
      LIMIT 100
    `).all(request.account.id);
    return response.json({
      balance: approvedBalanceCents(request.account.id) / 100,
      pendingWithdrawals: pendingWithdrawalsCents(request.account.id) / 100,
      transactions: rows.map((row) => transactionView(row)),
    });
  });

  // ---------------------------------------------------------------------------
  // Admin
  // ---------------------------------------------------------------------------
  const adminLimiter = createRateLimiter({ limit: 60, windowMs: 15 * 60 * 1000 });

  app.get('/api/admin/accounts', adminLimiter, requireAccount, requireAdmin, (request, response) => {
    const accounts = db.prepare(`
      SELECT a.id, a.name, a.email, a.created_at, a.role, a.status, a.hold_reason, a.held_at,
        COALESCE((
          SELECT SUM(CASE WHEN t.type = 'deposit' THEN t.amount_cents ELSE -t.amount_cents END)
          FROM transactions t
          WHERE t.account_id = a.id AND t.status = 'approved'
        ), 0) AS balance_cents,
        (SELECT COUNT(*) FROM transactions t WHERE t.account_id = a.id AND t.status = 'pending') AS pending_count
      FROM accounts a
      ORDER BY a.created_at DESC
      LIMIT 100
    `).all().map((row) => ({
      ...accountView(row),
      holdReason: row.hold_reason ?? null,
      heldAt: row.held_at ?? null,
      balance: row.balance_cents / 100,
      pendingTransactions: row.pending_count,
    }));
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
    const account = db.prepare('SELECT id, name, email, created_at, role, status, must_change_password FROM accounts WHERE id = ?').get(target.id);
    return response.json({ account: accountView(account) });
  });

  // Track a client's activity: balance, totals in/out, pending items and recent transactions.
  app.get('/api/admin/accounts/:id/activity', adminLimiter, requireAccount, requireAdmin, (request, response) => {
    const account = db.prepare(`
      SELECT id, name, email, created_at, role, status, hold_reason, held_at
      FROM accounts WHERE id = ?
    `).get(request.params.id);
    if (!account) return response.status(404).json({ error: 'Account not found.' });

    const totals = db.prepare(`
      SELECT
        COALESCE(SUM(CASE WHEN status = 'approved' AND type = 'deposit' THEN amount_cents END), 0) AS deposited,
        COALESCE(SUM(CASE WHEN status = 'approved' AND type = 'withdrawal' THEN amount_cents END), 0) AS withdrawn,
        COALESCE(SUM(CASE WHEN status = 'pending' AND type = 'deposit' THEN amount_cents END), 0) AS pending_deposits,
        COALESCE(SUM(CASE WHEN status = 'pending' AND type = 'withdrawal' THEN amount_cents END), 0) AS pending_withdrawals,
        COALESCE(SUM(CASE WHEN status = 'rejected' THEN 1 END), 0) AS rejected_count
      FROM transactions WHERE account_id = ?
    `).get(account.id);

    const recent = db.prepare(`
      SELECT t.*, a.name AS account_name, a.email AS account_email
      FROM transactions t
      JOIN accounts a ON a.id = t.account_id
      WHERE t.account_id = ?
      ORDER BY t.created_at DESC
      LIMIT 50
    `).all(account.id);

    return response.json({
      account: {
        ...accountView(account),
        holdReason: account.hold_reason ?? null,
        heldAt: account.held_at ?? null,
      },
      summary: {
        balance: (totals.deposited - totals.withdrawn) / 100,
        totalDeposited: totals.deposited / 100,
        totalWithdrawn: totals.withdrawn / 100,
        pendingDeposits: totals.pending_deposits / 100,
        pendingWithdrawals: totals.pending_withdrawals / 100,
        rejectedCount: totals.rejected_count,
      },
      transactions: recent.map((row) => transactionView(row, { admin: true })),
    });
  });

  // Review queue: ?status=pending&type=withdrawal&accountId=...
  app.get('/api/admin/transactions', adminLimiter, requireAccount, requireAdmin, (request, response) => {
    const { status, type, accountId } = request.query;
    const where = [];
    const params = [];

    if (status !== undefined) {
      if (!TX_STATUSES.includes(status)) return response.status(400).json({ error: 'Invalid status filter.' });
      where.push('t.status = ?');
      params.push(status);
    }
    if (type !== undefined) {
      if (!TX_TYPES.includes(type)) return response.status(400).json({ error: 'Invalid type filter.' });
      where.push('t.type = ?');
      params.push(type);
    }
    if (accountId !== undefined) {
      if (typeof accountId !== 'string' || accountId.length === 0 || accountId.length > 64) {
        return response.status(400).json({ error: 'Invalid account filter.' });
      }
      where.push('t.account_id = ?');
      params.push(accountId);
    }

    const rows = db.prepare(`
      SELECT t.*, a.name AS account_name, a.email AS account_email
      FROM transactions t
      JOIN accounts a ON a.id = t.account_id
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY t.created_at DESC
      LIMIT 200
    `).all(...params);
    return response.json({ transactions: rows.map((row) => transactionView(row, { admin: true })) });
  });

  function reviewTransaction(decision) {
    return (request, response, next) => {
      try {
        const note = request.body?.note == null ? '' : cleanText(request.body.note, { min: 0, max: 300 });
        if (note === null) return response.status(400).json({ error: 'Note must be at most 300 characters.' });
        if (decision === 'rejected' && note.length < 3) {
          return response.status(400).json({ error: 'A reason is required to reject a transaction.' });
        }

        const tx = getTransaction(request.params.id);
        if (!tx) return response.status(404).json({ error: 'Transaction not found.' });
        if (tx.status !== 'pending') {
          return response.status(409).json({ error: `Transaction is already ${tx.status}.` });
        }
        if (decision === 'approved') {
          if (tx.account_id === request.account.id) {
            return response.status(403).json({ error: 'You cannot approve your own transaction.' });
          }
          const owner = db.prepare('SELECT status FROM accounts WHERE id = ?').get(tx.account_id);
          if (owner.status === 'held') {
            return response.status(409).json({ error: 'This account is on hold. Release it before approving.' });
          }
          if (tx.type === 'withdrawal' && approvedBalanceCents(tx.account_id) < tx.amount_cents) {
            return response.status(409).json({ error: 'Insufficient approved balance for this withdrawal.' });
          }
        }

        withTransaction(() => {
          db.prepare(`
            UPDATE transactions
            SET status = ?, reviewed_by = ?, reviewed_at = ?, review_note = ?
            WHERE id = ? AND status = 'pending'
          `).run(decision, request.account.id, new Date().toISOString(), note, tx.id);
          recordAudit(request, `transaction.${decision}`, tx.id, {
            type: tx.type,
            amount: tx.amount_cents / 100,
            accountId: tx.account_id,
            accountEmail: tx.account_email,
            note,
          });
        });

        return response.json({ transaction: transactionView(getTransaction(tx.id), { admin: true }) });
      } catch (error) {
        return next(error);
      }
    };
  }

  app.post('/api/admin/transactions/:id/approve', adminLimiter, requireAccount, requireAdmin, reviewTransaction('approved'));
  app.post('/api/admin/transactions/:id/reject', adminLimiter, requireAccount, requireAdmin, reviewTransaction('rejected'));

  // Put an account on hold (suspected fraud): blocks login, ends sessions, blocks approvals.
  app.post('/api/admin/accounts/:id/hold', adminLimiter, requireAccount, requireAdmin, (request, response, next) => {
    try {
      const reason = cleanText(request.body?.reason, { min: 3, max: 300 });
      if (reason === null) {
        return response.status(400).json({ error: 'A hold reason of 3-300 characters is required.' });
      }
      const target = db.prepare('SELECT id, email, role, status FROM accounts WHERE id = ?').get(request.params.id);
      if (!target) return response.status(404).json({ error: 'Member account not found.' });
      if (target.role === 'admin') return response.status(403).json({ error: 'Administrator accounts cannot be put on hold.' });
      if (target.status === 'held') return response.status(409).json({ error: 'Account is already on hold.' });

      withTransaction(() => {
        db.prepare("UPDATE accounts SET status = 'held', hold_reason = ?, held_at = ? WHERE id = ?")
          .run(reason, new Date().toISOString(), target.id);
        db.prepare('DELETE FROM sessions WHERE account_id = ?').run(target.id);
        recordAudit(request, 'account.hold', target.id, { email: target.email, reason });
      });

      const account = db.prepare('SELECT id, name, email, created_at, role, status, must_change_password FROM accounts WHERE id = ?').get(target.id);
      return response.json({ account: accountView(account) });
    } catch (error) {
      return next(error);
    }
  });

  app.post('/api/admin/accounts/:id/release', adminLimiter, requireAccount, requireAdmin, (request, response, next) => {
    try {
      const note = request.body?.note == null ? '' : cleanText(request.body.note, { min: 0, max: 300 });
      if (note === null) return response.status(400).json({ error: 'Note must be at most 300 characters.' });

      const target = db.prepare('SELECT id, email, role, status FROM accounts WHERE id = ?').get(request.params.id);
      if (!target) return response.status(404).json({ error: 'Member account not found.' });
      if (target.status !== 'held') return response.status(409).json({ error: 'Account is not on hold.' });

      withTransaction(() => {
        db.prepare("UPDATE accounts SET status = 'active', hold_reason = NULL, held_at = NULL WHERE id = ?")
          .run(target.id);
        recordAudit(request, 'account.release', target.id, { email: target.email, note });
      });

      const account = db.prepare('SELECT id, name, email, created_at, role, status, must_change_password FROM accounts WHERE id = ?').get(target.id);
      return response.json({ account: accountView(account) });
    } catch (error) {
      return next(error);
    }
  });

  // Admin sets a new password for a member. The password is only ever stored as a salted hash;
  // the member's sessions are ended and the action is recorded in the audit log.
  app.post('/api/admin/accounts/:id/password', adminLimiter, requireAccount, requireAdmin, async (request, response, next) => {
    try {
      const newError = passwordError(request.body?.newPassword);
      if (newError) return response.status(400).json({ error: newError });

      const target = db.prepare('SELECT id, email, role FROM accounts WHERE id = ?').get(request.params.id);
      if (!target) return response.status(404).json({ error: 'Member account not found.' });
      if (target.role === 'admin') {
        return response.status(403).json({ error: 'Administrator passwords can only be changed by that administrator.' });
      }

      const hashed = await hashPassword(request.body.newPassword);
      withTransaction(() => {
        db.prepare('UPDATE accounts SET password_salt = ?, password_hash = ? WHERE id = ?')
          .run(hashed.salt, hashed.hash, target.id);
        db.prepare('DELETE FROM sessions WHERE account_id = ?').run(target.id);
        recordAudit(request, 'password.reset_by_admin', target.id, { email: target.email });
      });
      return response.json({ ok: true });
    } catch (error) {
      return next(error);
    }
  });

  // Audit trail of admin actions (who, what, when, from which IP).
  app.get('/api/admin/audit', adminLimiter, requireAccount, requireAdmin, (request, response) => {
    const { action } = request.query;
    if (action !== undefined && (typeof action !== 'string' || action.length === 0 || action.length > 64)) {
      return response.status(400).json({ error: 'Invalid action filter.' });
    }
    const rows = db.prepare(`
      SELECT id, actor_id, actor_email, action, target_id, detail, ip, created_at
      FROM audit_log
      ${action ? 'WHERE action = ?' : ''}
      ORDER BY id DESC
      LIMIT 200
    `).all(...(action ? [action] : []));
    return response.json({
      entries: rows.map((row) => ({
        id: row.id,
        actorId: row.actor_id,
        actorEmail: row.actor_email,
        action: row.action,
        targetId: row.target_id,
        detail: row.detail ? JSON.parse(row.detail) : {},
        ip: row.ip,
        createdAt: row.created_at,
      })),
    });
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
