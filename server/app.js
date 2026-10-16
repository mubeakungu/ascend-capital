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

function accountView(row) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role ?? 'member',
    createdAt: row.created_at,
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

  function currentAccount(request) {
    const token = readCookie(request, SESSION_COOKIE);
    if (!token) return null;

    const tokenHash = hashToken(token);
    const now = Date.now();
    db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(now);
    const row = db.prepare(`
      SELECT accounts.id, accounts.name, accounts.email, accounts.created_at, accounts.role
      FROM sessions
      JOIN accounts ON accounts.id = sessions.account_id
      WHERE sessions.token_hash = ? AND sessions.expires_at > ?
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
    return next();
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

      const account = db.prepare('SELECT id, name, email, created_at, role FROM accounts WHERE id = ?').get(id);
      await createAccountSession(id, response);
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
        SELECT id, name, email, password_salt, password_hash, created_at, role
        FROM accounts WHERE email = ?
      `).get(email);

      const salt = row ? Buffer.from(row.password_salt, 'hex') : Buffer.alloc(16);
      const storedHash = row ? Buffer.from(row.password_hash, 'hex') : Buffer.alloc(PASSWORD_BYTES);
      const candidate = await scryptAsync(input.password, salt, PASSWORD_BYTES, PASSWORD_OPTIONS);
      if (!row || !timingSafeEqual(candidate, storedHash)) {
        return response.status(401).json({ error: 'Email or password is incorrect.' });
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
    const account = db.prepare('SELECT id, name, email, created_at, role FROM accounts WHERE id = ?')
      .get(request.account.id);
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

  const adminLimiter = createRateLimiter({ limit: 60, windowMs: 15 * 60 * 1000 });
  app.get('/api/admin/accounts', adminLimiter, requireAccount, requireAdmin, (request, response) => {
    const accounts = db.prepare(`
      SELECT id, name, email, created_at, role
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
    const account = db.prepare('SELECT id, name, email, created_at, role FROM accounts WHERE id = ?').get(target.id);
    return response.json({ account: accountView(account) });
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
