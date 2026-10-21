import { randomBytes, scrypt, scryptSync, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import postgres from 'postgres';
import express from 'express';
import {
  initializeTierRewardsTable,
  checkAndCreditTierReward,
  getTierProgression,
  getDirectReferralCount,
  getTeamTotal,
  TIER_REQUIREMENTS,
} from './referral-rewards-enhancement-v2.js';

const scryptAsync = promisify(scrypt);
const SESSION_COOKIE = 'ascend_session';
const ADMIN_SESSION_COOKIE = 'ascend_admin_session';
const SESSION_DURATION_SECONDS = 60 * 60 * 24 * 30;
const PASSWORD_BYTES = 64;
const PASSWORD_OPTIONS = { N: 16384, r: 8, p: 1 };
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_PATTERN = /^[0-9+\-\s()]{7,20}$/;
const PIN_PATTERN = /^\d{6}$/;
const TX_TYPES = ['deposit', 'withdrawal', 'tier_reward', 'trading_profit', 'tier_salary', 'referral_commission'];
const TX_STATUSES = ['pending', 'approved', 'rejected'];
const MAX_TX_AMOUNT = 10_000_000;
const ADMIN_USERNAME = 'admin';
const DEFAULT_INITIAL_ADMIN_PASSWORD = 'Admin@123';

// Earnings activation settings
const EARNINGS_ACTIVATION_HOUR = parseInt(process.env.EARNINGS_ACTIVATION_HOUR ?? '10', 10);
const EARNINGS_ACTIVATION_MINUTE = parseInt(process.env.EARNINGS_ACTIVATION_MINUTE ?? '0', 10);

// Referral tier commission rates
const REFERRAL_COMMISSION_RATES = [
  0.05,  // Star 1: 5%
  0.06,  // Star 2: 6%
  0.07,  // Star 3: 7%
  0.08,  // Star 4: 8%
  0.10,  // Star 5: 10%
  0.12,  // Star 6: 12%
  0.14,  // Star 7: 14%
  0.16,  // Star 8: 16%
  0.18,  // Crown Leader: 18%
];

// Weekly tier salaries
const TIER_SALARIES = [
  0,        // Star 1: $0 (no salary)
  100,      // Star 2: $100/week
  200,      // Star 3: $200/week
  300,      // Star 4: $300/week
  450,      // Star 5: $450/week
  900,      // Star 6: $900/week
  1500,     // Star 7: $1,500/week
  2500,     // Star 8: $2,500/week
  5000,     // Crown Leader: $5,000/week
];

const TIER_NAMES = [
  'Star 1', 'Star 2', 'Star 3', 'Star 4', 'Star 5',
  'Star 6', 'Star 7', 'Star 8', 'Crown Leader',
];

// Deposit plans: amount → daily profit
const DEPOSIT_PLANS = [
  { deposit: 300, dailyProfit: 8 },
  { deposit: 400, dailyProfit: 11 },
  { deposit: 500, dailyProfit: 15.5 },
  { deposit: 750, dailyProfit: 25 },
  { deposit: 1000, dailyProfit: 35 },
  { deposit: 2000, dailyProfit: 70 },
  { deposit: 5000, dailyProfit: 180 },
  { deposit: 10000, dailyProfit: 370 },
  { deposit: 20000, dailyProfit: 750 },
  { deposit: 35000, dailyProfit: 1400 },
];

const TIER_REQUIREMENTS_DETAILED = [
  { direct: 5, team: 0 },           // Star 1: 5 direct (no team req)
  { direct: 7, team: 13 },          // Star 2: 7 direct AND 13 team
  { direct: 8, team: 25 },          // Star 3: 8 direct AND 25 team
  { direct: 9, team: 40 },          // Star 4: 9 direct AND 40 team
  { direct: 10, team: 70 },         // Star 5: 10 direct AND 70 team
  { direct: 11, team: 150 },        // Star 6: 11 direct AND 150 team
  { direct: 12, team: 400 },        // Star 7: 12 direct AND 400 team
  { direct: 13, team: 700 },        // Star 8: 13 direct AND 700 team
  { direct: 14, team: 1000 },       // Crown Leader: 14 direct AND 1,000 team
];

function accountView(row) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone ?? null,
    role: row.role ?? 'member',
    status: row.status ?? 'active',
    mustChangePassword: Boolean(row.must_change_password),
    createdAt: row.created_at,
  };
}

function transactionView(row, { admin = false } = {}) {
  const typeMap = {
    'tier_reward': 'Tier Reward',
    'trading_profit': 'Trading Profit',
    'tier_salary': 'Weekly Salary',
  };

  const view = {
    id: row.id,
    type: typeMap[row.type] || row.type,
    amount: row.amount_cents / 100,
    reference: row.reference,
    status: row.status,
    createdAt: row.created_at,
    reviewedAt: row.reviewed_at ?? null,
    reviewNote: row.review_note ?? '',
    isTierReward: row.type === 'tier_reward',
    isTradingProfit: row.type === 'trading_profit',
    isTierSalary: row.type === 'tier_salary',
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

function setSessionCookie(response, token, secure, cookieName = SESSION_COOKIE) {
  response.append(
    'Set-Cookie',
    `${cookieName}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_DURATION_SECONDS}${secure ? '; Secure' : ''}`,
  );
}

function clearSessionCookie(response, secure, cookieName = SESSION_COOKIE) {
  response.append(
    'Set-Cookie',
    `${cookieName}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure ? '; Secure' : ''}`,
  );
}

function hashToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

function passwordError(password) {
  if (typeof password !== 'string' || password.length < 6 || password.length > 128) {
    return 'Password must be between 6 and 128 characters.';
  }
  return null;
}

function validationMessage({ name, email, password, phone, pin }, requireName) {
  if (requireName && (typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 80)) {
    return 'Name must be between 2 and 80 characters.';
  }
  if (typeof email !== 'string' || email.length > 254 || !EMAIL_PATTERN.test(email.trim())) {
    return 'Enter a valid email address.';
  }
  if (phone && (typeof phone !== 'string' || !PHONE_PATTERN.test(phone.trim()))) {
    return 'Enter a valid phone number.';
  }
  if (pin && (typeof pin !== 'string' || !PIN_PATTERN.test(pin))) {
    return 'PIN must be exactly 6 digits.';
  }
  return passwordError(password);
}

function loginMessage({ email, password }) {
  const identifier = typeof email === 'string' ? email.trim().toLowerCase() : '';
  if (identifier !== ADMIN_USERNAME && (identifier.length > 254 || !EMAIL_PATTERN.test(identifier))) {
    return 'Enter a valid email address or username.';
  }
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

function calculateEarningsStatus(lastDepositTime) {
  if (!lastDepositTime) {
    return {
      earningsActive: false,
      earningsStartTime: null,
    };
  }

  const depositDate = new Date(lastDepositTime);
  const nextDay = new Date(depositDate);
  nextDay.setDate(nextDay.getDate() + 1);
  nextDay.setHours(EARNINGS_ACTIVATION_HOUR, EARNINGS_ACTIVATION_MINUTE, 0, 0);

  const now = new Date();
  const isActive = now >= nextDay;

  const timeStr = isActive ? null : nextDay.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });

  return {
    earningsActive: isActive,
    earningsStartTime: timeStr,
  };
}

function generateReferralCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

function getTierByDirectReferrals(directCount) {
  if (directCount < 1) return -1;
  if (directCount < 3) return 0;
  if (directCount < 6) return 1;
  if (directCount < 10) return 2;
  if (directCount < 15) return 3;
  if (directCount < 25) return 4;
  if (directCount < 40) return 5;
  if (directCount < 60) return 6;
  if (directCount < 100) return 7;
  return 8;
}

function getTierByProgress(directCount, teamTotal) {
  for (let i = TIER_REQUIREMENTS_DETAILED.length - 1; i >= 0; i--) {
    const req = TIER_REQUIREMENTS_DETAILED[i];
    const directMet = directCount >= req.direct;
    // Star 1 has team: 0 (no team requirement), others require BOTH conditions to be met
    const teamMet = req.team === 0 || teamTotal >= req.team;

    if (directMet && teamMet) return i;
  }
  return -1;
}

function getDailyProfitForDeposit(depositCents) {
  const depositAmount = depositCents / 100;
  for (let i = DEPOSIT_PLANS.length - 1; i >= 0; i--) {
    if (depositAmount >= DEPOSIT_PLANS[i].deposit) {
      return DEPOSIT_PLANS[i].dailyProfit;
    }
  }
  return 0;
}

// ✅ HELPER FUNCTION: Find account by ID or email
async function findAccountByIdentifier(sql, identifier) {
  // Try to find by ID first (faster)
  let account = await sql`SELECT id, name, email FROM accounts WHERE id = ${identifier}`;

  if (account.length === 0) {
    // If not found by ID, try by email (case-insensitive)
    const emailLower = identifier.toLowerCase().trim();
    account = await sql`SELECT id, name, email FROM accounts WHERE LOWER(email) = ${emailLower}`;
  }

  return account.length > 0 ? account[0] : null;
}

export async function createApp() {
  const sql = postgres(process.env.DATABASE_URL);

  // Initialize tables
  await sql`
    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_salt TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      phone TEXT,
      pin TEXT,
      role TEXT NOT NULL DEFAULT 'member' CHECK(role IN ('member', 'admin')),
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'held')),
      hold_reason TEXT,
      held_at TEXT,
      must_change_password INTEGER NOT NULL DEFAULT 0,
      last_deposit_time TEXT,
      created_at TEXT NOT NULL
    );
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      expires_at BIGINT NOT NULL
    );
  `;

  await sql`CREATE INDEX IF NOT EXISTS sessions_expiry_idx ON sessions(expires_at)`;

  await sql`
    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      type TEXT NOT NULL CHECK(type IN ('deposit', 'withdrawal', 'tier_reward', 'trading_profit', 'tier_salary', 'referral_commission')),
      amount_cents INTEGER NOT NULL CHECK(amount_cents > 0),
      reference TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected')),
      created_at TEXT NOT NULL,
      reviewed_by TEXT,
      reviewed_at TEXT,
      review_note TEXT
    );
  `;

  await sql`CREATE INDEX IF NOT EXISTS transactions_account_idx ON transactions(account_id, created_at)`;
  await sql`CREATE INDEX IF NOT EXISTS transactions_status_idx ON transactions(status, created_at)`;

  await sql`
    CREATE TABLE IF NOT EXISTS audit_log (
      id SERIAL PRIMARY KEY,
      actor_id TEXT,
      actor_email TEXT,
      action TEXT NOT NULL,
      target_id TEXT,
      detail TEXT,
      ip TEXT,
      created_at TEXT NOT NULL
    );
  `;

  await sql`CREATE INDEX IF NOT EXISTS audit_log_created_idx ON audit_log(created_at)`;

  await sql`
    CREATE TABLE IF NOT EXISTS referral_codes (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      code TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL
    );
  `;

  await sql`CREATE INDEX IF NOT EXISTS referral_codes_account_idx ON referral_codes(account_id)`;

  await sql`
    CREATE TABLE IF NOT EXISTS referral_signups (
      id TEXT PRIMARY KEY,
      referrer_id TEXT REFERENCES accounts(id) ON DELETE SET NULL,
      referral_code TEXT REFERENCES referral_codes(code) ON DELETE SET NULL,
      referred_account_id TEXT NOT NULL UNIQUE REFERENCES accounts(id) ON DELETE CASCADE,
      signed_up_at TEXT NOT NULL
    );
  `;

  await sql`CREATE INDEX IF NOT EXISTS referral_signups_referrer_idx ON referral_signups(referrer_id)`;
  await sql`CREATE INDEX IF NOT EXISTS referral_signups_referred_idx ON referral_signups(referred_account_id)`;

  await sql`
    CREATE TABLE IF NOT EXISTS referral_commissions (
      id TEXT PRIMARY KEY,
      referrer_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      transaction_id TEXT NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
      referred_account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      commission_cents INTEGER NOT NULL CHECK(commission_cents > 0),
      commission_rate REAL NOT NULL,
      created_at TEXT NOT NULL
    );
  `;

  await sql`CREATE INDEX IF NOT EXISTS referral_commissions_referrer_idx ON referral_commissions(referrer_id)`;
  await sql`CREATE INDEX IF NOT EXISTS referral_commissions_transaction_idx ON referral_commissions(transaction_id)`;

  await sql`
    CREATE TABLE IF NOT EXISTS trading_ledger (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      deposit_transaction_id TEXT NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
      profit_cents INTEGER NOT NULL CHECK(profit_cents > 0),
      profit_date TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `;

  await sql`CREATE INDEX IF NOT EXISTS trading_ledger_account_idx ON trading_ledger(account_id)`;
  await sql`CREATE INDEX IF NOT EXISTS trading_ledger_deposit_idx ON trading_ledger(deposit_transaction_id)`;
  await sql`CREATE INDEX IF NOT EXISTS trading_ledger_date_idx ON trading_ledger(profit_date)`;

  await sql`
    CREATE TABLE IF NOT EXISTS weekly_salary_payments (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      tier_index INTEGER NOT NULL,
      tier_name TEXT NOT NULL,
      salary_cents INTEGER NOT NULL CHECK(salary_cents > 0),
      payment_week TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'credited' CHECK(status IN ('pending', 'credited', 'held')),
      credited_at TEXT,
      created_at TEXT NOT NULL
    );
  `;

  await sql`CREATE INDEX IF NOT EXISTS weekly_salary_payments_account_idx ON weekly_salary_payments(account_id)`;
  await sql`CREATE INDEX IF NOT EXISTS weekly_salary_payments_week_idx ON weekly_salary_payments(payment_week)`;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS weekly_salary_payments_unique_idx ON weekly_salary_payments(account_id, payment_week)`;

  // ✅ ADD: Prime Hour Wallet table
  await sql`
    CREATE TABLE IF NOT EXISTS prime_hour_wallets (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL UNIQUE REFERENCES accounts(id) ON DELETE CASCADE,
      balance_cents INTEGER NOT NULL DEFAULT 0 CHECK(balance_cents >= 0),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `;

  await sql`CREATE INDEX IF NOT EXISTS prime_hour_wallets_account_idx ON prime_hour_wallets(account_id)`;

  // ✅ ADD: Prime Hour transactions table
  await sql`
    CREATE TABLE IF NOT EXISTS prime_hour_transactions (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      type TEXT NOT NULL CHECK(type IN ('deposit', 'withdrawal')),
      amount_cents INTEGER NOT NULL CHECK(amount_cents > 0),
      reference TEXT,
      status TEXT NOT NULL DEFAULT 'approved' CHECK(status IN ('pending', 'approved', 'rejected')),
      created_at TEXT NOT NULL
    );
  `;

  await sql`CREATE INDEX IF NOT EXISTS prime_hour_transactions_account_idx ON prime_hour_transactions(account_id)`;
  await sql`CREATE INDEX IF NOT EXISTS prime_hour_transactions_created_idx ON prime_hour_transactions(created_at)`;

  await initializeTierRewardsTable(sql);

  const app = express();
  const secureCookie = process.env.NODE_ENV === 'production';
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

  function recordAudit(request, action, targetId, detail = {}) {
    return sql`
      INSERT INTO audit_log (actor_id, actor_email, action, target_id, detail, ip, created_at)
      VALUES (${request.account?.id ?? null}, ${request.account?.email ?? null}, ${action}, ${targetId ?? null}, ${JSON.stringify(detail)}, ${request.ip ?? null}, ${new Date().toISOString()})
    `;
  }

  async function approvedBalanceCents(accountId) {
    const row = await sql`
      SELECT COALESCE(SUM(CASE
        WHEN type IN ('deposit', 'tier_reward', 'trading_profit', 'tier_salary', 'referral_commission') THEN amount_cents
        WHEN type = 'withdrawal' THEN -amount_cents
        ELSE 0
      END), 0) AS balance
      FROM transactions
      WHERE account_id = ${accountId} AND status = 'approved'
    `;
    return row[0]?.balance || 0;
  }

  async function pendingWithdrawalsCents(accountId) {
    const row = await sql`
      SELECT COALESCE(SUM(amount_cents), 0) AS total
      FROM transactions
      WHERE account_id = ${accountId} AND type = 'withdrawal' AND status = 'pending'
    `;
    return row[0]?.total || 0;
  }

  async function getTransaction(id) {
    const row = await sql`
      SELECT t.*, a.name AS account_name, a.email AS account_email
      FROM transactions t
      JOIN accounts a ON a.id = t.account_id
      WHERE t.id = ${id}
    `;
    return row[0];
  }

  async function getCurrentAccountAsync(request, cookieName = SESSION_COOKIE, requireAdminRole = false) {
    const token = readCookie(request, cookieName);
    if (!token) return null;

    const tokenHash = hashToken(token);
    const now = Date.now();

    await sql`DELETE FROM sessions WHERE expires_at <= ${now}`;

    const rows = await sql`
      SELECT accounts.id, accounts.name, accounts.email, accounts.phone, accounts.created_at, accounts.role, accounts.status,
        accounts.must_change_password
      FROM sessions
      JOIN accounts ON accounts.id = sessions.account_id
      WHERE sessions.token_hash = ${tokenHash} AND sessions.expires_at > ${now} AND accounts.status = 'active'
    `;

    if (rows.length === 0) return null;
    const row = rows[0];
    if (requireAdminRole && row.role !== 'admin') return null;
    return row;
  }

  async function requireAccount(request, response, next) {
    const account = await getCurrentAccountAsync(request);
    if (!account) return response.status(401).json({ error: 'Sign in to continue.' });
    request.account = account;
    return next();
  }

  async function requireAdminSession(request, response, next) {
    const account = await getCurrentAccountAsync(request, ADMIN_SESSION_COOKIE, true);
    if (!account) return response.status(401).json({ error: 'Admin authentication required.' });
    request.account = account;
    return next();
  }

  async function seedInitialAdmin() {
    const password = process.env.INITIAL_ADMIN_PASSWORD || DEFAULT_INITIAL_ADMIN_PASSWORD;
    if (password.length > 128) throw new Error('INITIAL_ADMIN_PASSWORD must be at most 128 characters.');

    const resetRequested = process.env.RESET_ADMIN_PASSWORD === 'true';
    const existing = await sql`SELECT id FROM accounts WHERE email = ${ADMIN_USERNAME}`;

    if (existing.length > 0 && !resetRequested) {
      await sql`UPDATE accounts SET role = 'admin' WHERE id = ${existing[0].id}`;
      return;
    }

    const salt = randomBytes(16);
    const passwordHash = scryptSync(password, salt, PASSWORD_BYTES, PASSWORD_OPTIONS);

    if (existing.length > 0) {
      await sql`
        UPDATE accounts
        SET role = 'admin', status = 'active', password_salt = ${salt.toString('hex')}, password_hash = ${passwordHash.toString('hex')}, must_change_password = 1
        WHERE id = ${existing[0].id}
      `;
      await sql`DELETE FROM sessions WHERE account_id = ${existing[0].id}`;
      await recordAudit({}, 'admin.password_reset_switch', existing[0].id, {});
      return;
    }

    const id = randomBytes(16).toString('hex');
    await sql`
      INSERT INTO accounts (id, name, email, password_salt, password_hash, created_at, role, must_change_password)
      VALUES (${id}, 'Administrator', ${ADMIN_USERNAME}, ${salt.toString('hex')}, ${passwordHash.toString('hex')}, ${new Date().toISOString()}, 'admin', 1)
    `;
  }

  async function createAccountSession(accountId, response) {
    const token = randomBytes(32).toString('base64url');
    const expiresAt = Date.now() + SESSION_DURATION_SECONDS * 1000;
    await sql`INSERT INTO sessions (token_hash, account_id, expires_at) VALUES (${hashToken(token)}, ${accountId}, ${expiresAt})`;
    setSessionCookie(response, token, secureCookie);
  }

  async function trackReferralSignup(accountId, referralCode) {
    if (!referralCode || typeof referralCode !== 'string') return;
    const codeRecord = await sql`SELECT account_id FROM referral_codes WHERE code = ${referralCode}`;

    if (codeRecord.length === 0) return;

    const id = randomBytes(16).toString('hex');
    try {
      await sql`
        INSERT INTO referral_signups (id, referrer_id, referral_code, referred_account_id, signed_up_at)
        VALUES (${id}, ${codeRecord[0].account_id}, ${referralCode.toUpperCase()}, ${accountId}, ${new Date().toISOString()})
      `;

      const directCount = await getDirectReferralCount(sql, codeRecord[0].account_id);
      const teamTotal = await getTeamTotal(sql, codeRecord[0].account_id);
      const tier = getTierByProgress(directCount, teamTotal);

      if (tier >= 0) {
        const tierReward = await checkAndCreditTierReward(sql, codeRecord[0].account_id);
        if (tierReward) {
          await recordAudit({}, 'referral.tier_reward_credited', codeRecord[0].account_id, {
            tierIndex: tierReward.tierId,
            tierName: tierReward.tierName,
            amountUSD: tierReward.amountCents / 100,
            directCount,
            teamTotal,
          });
        }
      }

      const directReferrerOf = await sql`
        SELECT referrer_id FROM referral_signups WHERE referred_account_id = ${codeRecord[0].account_id}
      `;

      if (directReferrerOf.length > 0 && directReferrerOf[0].referrer_id) {
        const grandDirect = await getDirectReferralCount(sql, directReferrerOf[0].referrer_id);
        const grandTeam = await getTeamTotal(sql, directReferrerOf[0].referrer_id);
        const grandTier = getTierByProgress(grandDirect, grandTeam);

        if (grandTier >= 0) {
          const grandParentTierReward = await checkAndCreditTierReward(sql, directReferrerOf[0].referrer_id);
          if (grandParentTierReward) {
            await recordAudit({}, 'referral.tier_reward_credited', directReferrerOf[0].referrer_id, {
              tierIndex: grandParentTierReward.tierId,
              tierName: grandParentTierReward.tierName,
              amountUSD: grandParentTierReward.amountCents / 100,
              directCount: grandDirect,
              teamTotal: grandTeam,
            });
          }
        }
      }
    } catch (error) {
      // Ignore duplicate referral signups
    }
  }

  async function applyReferralCommission(transactionId) {
    const txRows = await sql`
      SELECT t.*, a.id AS account_id
      FROM transactions t
      JOIN accounts a ON a.id = t.account_id
      WHERE t.id = ${transactionId}
    `;

    if (txRows.length === 0) return null;
    const tx = txRows[0];

    if (tx.type !== 'deposit' || tx.status !== 'approved') return null;

    const previousDeposits = await sql`
      SELECT COUNT(*) AS cnt FROM transactions
      WHERE account_id = ${tx.account_id} AND type = 'deposit' AND status = 'approved' AND created_at < ${tx.created_at}
    `;

    const isFirstDeposit = previousDeposits[0].cnt === 0;

    const referralSignup = await sql`
      SELECT referrer_id FROM referral_signups WHERE referred_account_id = ${tx.account_id} LIMIT 1
    `;

    const referrerId = referralSignup[0]?.referrer_id;

    let commissionCents;
    let commissionRate;
    let beneficiaryId = referrerId;
    let bonusType;

    if (isFirstDeposit) {
      if (referrerId) {
        commissionRate = 0.05;
        commissionCents = Math.round(tx.amount_cents * commissionRate);
        bonusType = 'referral_bonus_5%';
      } else {
        commissionRate = 0.025;
        commissionCents = Math.round(tx.amount_cents * commissionRate);
        beneficiaryId = tx.account_id;
        bonusType = 'first_deposit_bonus_2.5%';
      }
    } else {
      const firstDeposit = await sql`
        SELECT amount_cents FROM transactions
        WHERE account_id = ${tx.account_id} AND type = 'deposit' AND status = 'approved'
        ORDER BY created_at ASC
        LIMIT 1
      `;

      if (firstDeposit.length === 0) return null;

      commissionRate = 0.025;
      commissionCents = Math.round(firstDeposit[0].amount_cents * commissionRate);
      bonusType = 'recharge_bonus_2.5%';

      if (!referrerId) {
        beneficiaryId = tx.account_id;
      }
    }

    const commissionId = randomBytes(16).toString('hex');
    try {
      const now = new Date().toISOString();

      // ✅ INSERT commission record
      await sql`
        INSERT INTO referral_commissions (id, referrer_id, transaction_id, referred_account_id, commission_cents, commission_rate, created_at)
        VALUES (${commissionId}, ${beneficiaryId}, ${transactionId}, ${tx.account_id}, ${commissionCents}, ${commissionRate}, ${now})
      `;

      // ✅ ADD: Credit commission directly to Ascend wallet as approved transaction
      const commissionTxId = randomBytes(16).toString('hex');
      const reference = bonusType === 'referral_bonus_5%'
        ? `Referral bonus (5%) from ${tx.account_id}`
        : bonusType === 'first_deposit_bonus_2.5%'
        ? `First deposit bonus (2.5%)`
        : `Recharge bonus (2.5%)`;

      await sql`
        INSERT INTO transactions (id, account_id, type, amount_cents, reference, status, created_at)
        VALUES (${commissionTxId}, ${beneficiaryId}, 'referral_commission', ${commissionCents}, ${reference}, 'approved', ${now})
      `;

      return { commissionId, amount: commissionCents / 100, bonusType, beneficiaryId, commissionTxId };
    } catch (error) {
      console.error('Failed to apply referral commission:', error);
      return null;
    }
  }

  async function applyDailyTradingProfits() {
    const today = new Date().toISOString().split('T')[0];
    const now = new Date();

    const activeDeposits = await sql`
      SELECT t.id, t.account_id, t.amount_cents, t.created_at
      FROM transactions t
      WHERE t.type = 'deposit' AND t.status = 'approved'
      ORDER BY t.account_id
    `;

    for (const deposit of activeDeposits) {
      const alreadyCredited = await sql`
        SELECT id FROM trading_ledger
        WHERE deposit_transaction_id = ${deposit.id} AND profit_date = ${today}
      `;

      if (alreadyCredited.length > 0) continue;

      const depositDate = new Date(deposit.created_at);
      const depositDay = depositDate.toISOString().split('T')[0];

      if (depositDay === today) {
        continue;
      }

      const currentMinutesOfDay = now.getHours() * 60 + now.getMinutes();
      const activationMinutesOfDay = EARNINGS_ACTIVATION_HOUR * 60 + EARNINGS_ACTIVATION_MINUTE;

      if (currentMinutesOfDay < activationMinutesOfDay) {
        continue;
      }

      const dailyProfit = getDailyProfitForDeposit(deposit.amount_cents);
      if (dailyProfit <= 0) continue;

      const profitCents = Math.round(dailyProfit * 100);
      const ledgerId = randomBytes(16).toString('hex');

      try {
        const ledgerInsert = sql`
          INSERT INTO trading_ledger (id, account_id, deposit_transaction_id, profit_cents, profit_date, created_at)
          VALUES (${ledgerId}, ${deposit.account_id}, ${deposit.id}, ${profitCents}, ${today}, ${new Date().toISOString()})
        `;

        const txId = randomBytes(16).toString('hex');
        const txInsert = sql`
          INSERT INTO transactions (id, account_id, type, amount_cents, reference, status, created_at)
          VALUES (${txId}, ${deposit.account_id}, 'trading_profit', ${profitCents}, ${`Trading profit from ${today}`}, 'approved', ${new Date().toISOString()})
        `;

        await Promise.all([ledgerInsert, txInsert]);
      } catch (error) {
        console.error(`Failed to credit profit for deposit ${deposit.id}:`, error);
      }
    }
  }

  async function applyWeeklySalaries() {
    const now = new Date();
    const year = now.getUTCFullYear();
    const weekNumber = Math.ceil((now.getUTCDate() - now.getUTCDay() + 1) / 7);
    const paymentWeek = `${year}-W${String(weekNumber).padStart(2, '0')}`;

    const members = await sql`
      SELECT DISTINCT
        a.id,
        a.email,
        a.name
      FROM accounts a
      WHERE a.role = 'member' AND a.status = 'active'
    `;

    for (const member of members) {
      const alreadyPaid = await sql`
        SELECT id FROM weekly_salary_payments
        WHERE account_id = ${member.id} AND payment_week = ${paymentWeek}
      `;

      if (alreadyPaid.length > 0) continue;

      const directCount = await getDirectReferralCount(sql, member.id);
      const teamTotal = await getTeamTotal(sql, member.id);
      const tier = getTierByProgress(directCount, teamTotal);

      if (tier < 1) continue;

      const tierName = TIER_NAMES[tier];
      const salaryCents = Math.round(TIER_SALARIES[tier] * 100);

      if (salaryCents <= 0) continue;

      const salaryId = randomBytes(16).toString('hex');
      const txId = randomBytes(16).toString('hex');

      try {
        const salaryInsert = sql`
          INSERT INTO weekly_salary_payments (id, account_id, tier_index, tier_name, salary_cents, payment_week, credited_at, created_at)
          VALUES (${salaryId}, ${member.id}, ${tier}, ${tierName}, ${salaryCents}, ${paymentWeek}, ${new Date().toISOString()}, ${new Date().toISOString()})
        `;

        const txInsert = sql`
          INSERT INTO transactions (id, account_id, type, amount_cents, reference, status, created_at)
          VALUES (${txId}, ${member.id}, 'tier_salary', ${salaryCents}, ${`Weekly ${tierName} salary for ${paymentWeek}`}, 'approved', ${new Date().toISOString()})
        `;

        await Promise.all([salaryInsert, txInsert]);

        await recordAudit({}, 'salary.weekly_credited', member.id, {
          tierIndex: tier,
          tierName,
          amountUSD: salaryCents / 100,
          paymentWeek,
          directCount,
          teamTotal,
        });
      } catch (error) {
        console.error(`Failed to credit weekly salary for member ${member.id}:`, error);
      }
    }
  }

  function scheduleDailyTradingProfits() {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    tomorrow.setUTCHours(0, 0, 0, 0);

    const timeUntilMidnight = tomorrow.getTime() - now.getTime();

    setTimeout(() => {
      applyDailyTradingProfits();
      setInterval(() => {
        applyDailyTradingProfits();
      }, 24 * 60 * 60 * 1000);
    }, timeUntilMidnight);
  }

  function scheduleWeeklySalaries() {
    const now = new Date();
    const daysUntilMonday = (1 - now.getUTCDay() + 7) % 7 || 7;
    const nextMonday = new Date(now);
    nextMonday.setUTCDate(nextMonday.getUTCDate() + daysUntilMonday);
    nextMonday.setUTCHours(0, 0, 0, 0);

    const timeUntilMonday = nextMonday.getTime() - now.getTime();

    setTimeout(() => {
      applyWeeklySalaries();
      setInterval(() => {
        applyWeeklySalaries();
      }, 7 * 24 * 60 * 60 * 1000);
    }, timeUntilMonday);
  }

  await seedInitialAdmin();
  scheduleWeeklySalaries();
  // ✅ DISABLED: Daily trading profits are now claimed MANUALLY only via /api/trading/claim-daily-trade
  // scheduleDailyTradingProfits();

  // =========================================================================
  // PUBLIC ENDPOINTS
  // =========================================================================

  app.get('/api/health', (_request, response) => response.json({
    status: 'ok',
    accountStorage: 'postgresql',
  }));

  app.get('/api/public-config', (_request, response) => response.json({
    binanceWalletAddress: process.env.BINANCE_WALLET_ADDRESS?.trim() ?? '',
  }));

  app.get('/api/public/logo', (_request, response) => {
    const logoPath = process.env.LOGO_PATH?.trim();
    if (!logoPath) {
      return response.status(404).json({ error: 'Logo not configured.' });
    }
    try {
      const fs = require('fs');
      const logoBuffer = fs.readFileSync(logoPath);
      const ext = logoPath.split('.').pop().toLowerCase();
      const mimeTypes = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', svg: 'image/svg+xml', webp: 'image/webp' };
      response.set('Content-Type', mimeTypes[ext] || 'image/png');
      return response.send(logoBuffer);
    } catch (error) {
      return response.status(404).json({ error: 'Logo file not found.' });
    }
  });

  app.get('/api/public/download/android-app', (_request, response) => {
    const apkPath = process.env.APK_PATH?.trim();
    if (!apkPath) {
      return response.status(404).json({ error: 'Android app not available for download.' });
    }
    try {
      const fs = require('fs');
      const apkBuffer = fs.readFileSync(apkPath);
      response.set({
        'Content-Type': 'application/vnd.android.package-archive',
        'Content-Disposition': 'attachment; filename="ascend-capital.apk"',
        'Content-Length': apkBuffer.length,
      });
      return response.send(apkBuffer);
    } catch (error) {
      return response.status(404).json({ error: 'Android app file not found.' });
    }
  });

  // =========================================================================
  // AUTHENTICATION ENDPOINTS
  // =========================================================================

  app.post('/api/auth/register', authRateLimit, async (request, response, next) => {
    try {
      const input = request.body ?? {};
      const error = validationMessage(input, true);
      if (error) return response.status(400).json({ error });

      const email = input.email.trim().toLowerCase();
      const existing = await sql`SELECT id FROM accounts WHERE email = ${email}`;
      if (existing.length > 0) return response.status(409).json({ error: 'An account with this email already exists.' });

      const salt = randomBytes(16);
      const passwordHash = await scryptAsync(input.password, salt, PASSWORD_BYTES, PASSWORD_OPTIONS);
      const id = randomBytes(16).toString('hex');
      const createdAt = new Date().toISOString();

      await sql`
        INSERT INTO accounts (id, name, email, password_salt, password_hash, phone, pin, created_at)
        VALUES (${id}, ${input.name.trim()}, ${email}, ${salt.toString('hex')}, ${passwordHash.toString('hex')}, ${input.phone?.trim() || null}, ${input.pin || null}, ${createdAt})
      `;

      const referralCode = input.referralCode?.trim().toUpperCase();
      if (referralCode) {
        await trackReferralSignup(id, referralCode);
      }

      const account = await sql`SELECT id, name, email, phone, created_at, role, status, must_change_password FROM accounts WHERE id = ${id}`;
      await createAccountSession(id, response);
      return response.status(201).json({ account: accountView(account[0]) });
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
      const rows = await sql`
        SELECT id, name, email, phone, password_salt, password_hash, created_at, role, status, must_change_password
        FROM accounts WHERE email = ${email}
      `;

      const row = rows[0];
      const salt = row ? Buffer.from(row.password_salt, 'hex') : Buffer.alloc(16);
      const storedHash = row ? Buffer.from(row.password_hash, 'hex') : Buffer.alloc(PASSWORD_BYTES);
      const candidate = await scryptAsync(input.password, salt, PASSWORD_BYTES, PASSWORD_OPTIONS);
      if (!row || !timingSafeEqual(candidate, storedHash)) {
        return response.status(401).json({ error: 'Email or password is incorrect.' });
      }

      if (row.status === 'held') {
        return response.status(403).json({ error: 'This account is on hold. Please contact support.' });
      }

      await sql`DELETE FROM sessions WHERE account_id = ${row.id}`;
      await createAccountSession(row.id, response);
      return response.json({ account: accountView(row) });
    } catch (error) {
      return next(error);
    }
  });

  app.get('/api/auth/me', async (request, response) => {
    const account = await getCurrentAccountAsync(request, SESSION_COOKIE);
    return response.json({ account: account ? accountView(account) : null });
  });

  app.patch('/api/auth/profile', updateRateLimit, requireAccount, async (request, response) => {
    const name = request.body?.name;
    if (typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 80) {
      return response.status(400).json({ error: 'Name must be between 2 and 80 characters.' });
    }
    await sql`UPDATE accounts SET name = ${name.trim()} WHERE id = ${request.account.id}`;
    const account = await sql`SELECT id, name, email, phone, created_at, role, status, must_change_password FROM accounts WHERE id = ${request.account.id}`;
    return response.json({ account: accountView(account[0]) });
  });

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

      const rows = await sql`SELECT password_salt, password_hash FROM accounts WHERE id = ${request.account.id}`;
      const row = rows[0];
      const candidate = await scryptAsync(currentPassword, Buffer.from(row.password_salt, 'hex'), PASSWORD_BYTES, PASSWORD_OPTIONS);
      if (!timingSafeEqual(candidate, Buffer.from(row.password_hash, 'hex'))) {
        return response.status(401).json({ error: 'Current password is incorrect.' });
      }

      const hashed = await hashPassword(newPassword);
      await sql`UPDATE accounts SET password_salt = ${hashed.salt}, password_hash = ${hashed.hash}, must_change_password = 0 WHERE id = ${request.account.id}`;
      await sql`DELETE FROM sessions WHERE account_id = ${request.account.id}`;
      await recordAudit(request, 'password.change_self', request.account.id, { role: request.account.role });
      await createAccountSession(request.account.id, response);
      return response.json({ ok: true });
    } catch (error) {
      return next(error);
    }
  });

  app.post('/api/auth/logout', async (request, response, next) => {
    try {
      const token = readCookie(request, SESSION_COOKIE);
      if (token) await sql`DELETE FROM sessions WHERE token_hash = ${hashToken(token)}`;
      clearSessionCookie(response, secureCookie);
      return response.status(204).end();
    } catch (error) {
      return next(error);
    }
  });

  // =========================================================================
  // ADMIN AUTHENTICATION ENDPOINTS
  // =========================================================================

  app.post('/api/admin/auth/login', authRateLimit, async (request, response, next) => {
    try {
      const input = request.body ?? {};
      const error = loginMessage(input);
      if (error) return response.status(400).json({ error });

      const email = input.email.trim().toLowerCase();
      const rows = await sql`
        SELECT id, name, email, phone, password_salt, password_hash, created_at, role, status, must_change_password
        FROM accounts WHERE email = ${email} AND role = 'admin'
      `;

      const row = rows[0];
      const salt = row ? Buffer.from(row.password_salt, 'hex') : Buffer.alloc(16);
      const storedHash = row ? Buffer.from(row.password_hash, 'hex') : Buffer.alloc(PASSWORD_BYTES);
      const candidate = await scryptAsync(input.password, salt, PASSWORD_BYTES, PASSWORD_OPTIONS);
      if (!row || !timingSafeEqual(candidate, storedHash)) {
        return response.status(401).json({ error: 'Admin credentials are incorrect.' });
      }

      if (row.status === 'held') {
        return response.status(403).json({ error: 'This admin account is on hold.' });
      }

      await sql`DELETE FROM sessions WHERE account_id = ${row.id}`;

      const token = randomBytes(32).toString('base64url');
      const expiresAt = Date.now() + SESSION_DURATION_SECONDS * 1000;
      await sql`INSERT INTO sessions (token_hash, account_id, expires_at) VALUES (${hashToken(token)}, ${row.id}, ${expiresAt})`;
      setSessionCookie(response, token, secureCookie, ADMIN_SESSION_COOKIE);

      await recordAudit({ ip: request.ip }, 'admin.login', row.id, { email });
      return response.json({ account: accountView(row) });
    } catch (error) {
      return next(error);
    }
  });

  app.get('/api/admin/auth/me', async (request, response) => {
    const account = await getCurrentAccountAsync(request, ADMIN_SESSION_COOKIE, true);
    return response.json({ account: account ? accountView(account) : null });
  });

  app.post('/api/admin/auth/logout', async (request, response, next) => {
    try {
      const token = readCookie(request, ADMIN_SESSION_COOKIE);
      if (token) await sql`DELETE FROM sessions WHERE token_hash = ${hashToken(token)}`;
      clearSessionCookie(response, secureCookie, ADMIN_SESSION_COOKIE);
      return response.status(204).end();
    } catch (error) {
      return next(error);
    }
  });

  app.post('/api/admin/auth/password', passwordRateLimit, requireAdminSession, async (request, response, next) => {
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

      const rows = await sql`SELECT password_salt, password_hash FROM accounts WHERE id = ${request.account.id}`;
      const row = rows[0];
      const candidate = await scryptAsync(currentPassword, Buffer.from(row.password_salt, 'hex'), PASSWORD_BYTES, PASSWORD_OPTIONS);
      if (!timingSafeEqual(candidate, Buffer.from(row.password_hash, 'hex'))) {
        return response.status(401).json({ error: 'Current password is incorrect.' });
      }

      const hashed = await hashPassword(newPassword);
      await sql`UPDATE accounts SET password_salt = ${hashed.salt}, password_hash = ${hashed.hash}, must_change_password = 0 WHERE id = ${request.account.id}`;
      await sql`DELETE FROM sessions WHERE account_id = ${request.account.id}`;
      await recordAudit(request, 'password.change_admin', request.account.id, { role: request.account.role });
      await createAccountSession(request.account.id, response);
      return response.json({ ok: true });
    } catch (error) {
      return next(error);
    }
  });

  // =========================================================================
  // REFERRAL ENDPOINTS
  // =========================================================================

  app.get('/api/referrals/code', requireAccount, async (request, response) => {
    const existing = await sql`SELECT code FROM referral_codes WHERE account_id = ${request.account.id} LIMIT 1`;

    if (existing.length > 0) {
      return response.json({ code: existing[0].code });
    }

    const code = generateReferralCode();
    const id = randomBytes(16).toString('hex');
    await sql`
      INSERT INTO referral_codes (id, account_id, code, created_at)
      VALUES (${id}, ${request.account.id}, ${code}, ${new Date().toISOString()})
    `;

    return response.status(201).json({ code });
  });

  app.get('/api/referrals/tier-progression', requireAccount, async (request, response) => {
    const progression = await getTierProgression(sql, request.account.id);
    return response.json(progression);
  });

  app.get('/api/referrals/earned-rewards', requireAccount, async (request, response) => {
    const rewards = await sql`
      SELECT tier_index, tier_name, reward_cents, physical_reward,
        physical_reward_value_cents, direct_referrals_at_award,
        team_total_at_award, credited_at
      FROM referral_tier_rewards
      WHERE referrer_id = ${request.account.id}
      ORDER BY tier_index ASC
    `;

    const directCount = await getDirectReferralCount(sql, request.account.id);
    const teamTotal = await getTeamTotal(sql, request.account.id);
    const totalRewardsUSD = rewards.reduce((sum, r) => sum + r.reward_cents / 100, 0);

    return response.json({
      directReferrals: directCount,
      teamTotal,
      totalRewardsUSD,
      rewards: rewards.map(r => ({
        tierIndex: r.tier_index,
        tierName: r.tier_name,
        amountUSD: r.reward_cents / 100,
        physicalReward: r.physical_reward,
        directWhen: r.direct_referrals_at_award,
        teamTotalWhen: r.team_total_at_award,
        creditedAt: r.credited_at,
      })),
    });
  });

  app.get('/api/referrals/stats', requireAccount, async (request, response) => {
    try {
      // ✅ FIX: Count DISTINCT referral_signups, not all transaction rows
      const directStats = await sql`
        SELECT COUNT(DISTINCT rs.id) AS direct_count,
          COALESCE(SUM(CASE WHEN t.type = 'deposit' AND t.status = 'approved' THEN t.amount_cents ELSE 0 END), 0) AS direct_volume
        FROM referral_signups rs
        LEFT JOIN transactions t ON t.account_id = rs.referred_account_id
        WHERE rs.referrer_id = ${request.account.id}
      `;

      const commissionStats = await sql`
        SELECT COUNT(*) AS commission_count,
          COALESCE(SUM(commission_cents), 0) AS total_commission_cents
        FROM referral_commissions
        WHERE referrer_id = ${request.account.id}
      `;

      const directCount = directStats[0]?.direct_count || 0;
      const teamTotal = await getTeamTotal(sql, request.account.id);
      const tier = getTierByProgress(directCount, teamTotal);
      const tierName = tier >= 0 ? TIER_NAMES[tier] : null;
      const commissionRate = tier >= 0 ? REFERRAL_COMMISSION_RATES[tier] : 0;

      const referralCode = await sql`SELECT code FROM referral_codes WHERE account_id = ${request.account.id}`;

      return response.json({
        referralCode: referralCode[0]?.code || null,
        tier: tierName,
        commissionRate: commissionRate,
        directReferrals: directCount,
        directVolume: (directStats[0]?.direct_volume || 0) / 100,
        commissionsEarned: commissionStats[0]?.commission_count || 0,
        totalEarnings: (commissionStats[0]?.total_commission_cents || 0) / 100,
        teamTotal: teamTotal,
      });
    } catch (error) {
      console.error('Error in /api/referrals/stats:', error);
      return response.status(500).json({ error: 'Failed to fetch referral stats.' });
    }
  });

  // ✅ NEW: DEBUG ENDPOINT - See raw referral data for troubleshooting
  app.get('/api/referrals/debug', requireAccount, async (request, response) => {
    try {
      const rawSignups = await sql`
        SELECT rs.id, rs.referrer_id, rs.referred_account_id, a.name, a.email, rs.signed_up_at
        FROM referral_signups rs
        JOIN accounts a ON a.id = rs.referred_account_id
        WHERE rs.referrer_id = ${request.account.id}
      `;

      const countTest = await sql`
        SELECT COUNT(*) AS total FROM referral_signups
        WHERE referrer_id = ${request.account.id}
      `;

      return response.json({
        directCount: countTest[0]?.total || 0,
        referrals: rawSignups,
      });
    } catch (error) {
      console.error('Error in debug endpoint:', error);
      return response.status(500).json({ error: 'Debug error.' });
    }
  });

  app.get('/api/referrals/list', requireAccount, async (request, response) => {
    const referrals = await sql`
      SELECT
        rs.id,
        a.id AS account_id,
        a.name,
        a.email,
        rs.signed_up_at,
        COALESCE(SUM(CASE WHEN t.type = 'deposit' AND t.status = 'approved' THEN t.amount_cents ELSE 0 END), 0) AS total_deposits_cents
      FROM referral_signups rs
      JOIN accounts a ON a.id = rs.referred_account_id
      LEFT JOIN transactions t ON t.account_id = a.id AND t.type = 'deposit' AND t.status = 'approved'
      WHERE rs.referrer_id = ${request.account.id}
      GROUP BY rs.id, a.id, a.name, a.email, rs.signed_up_at
      ORDER BY rs.signed_up_at DESC
      LIMIT 100
    `;

    return response.json({
      referrals: referrals.map(r => ({
        id: r.account_id,
        name: r.name,
        email: r.email,
        signedUpAt: r.signed_up_at,
        totalDeposits: r.total_deposits_cents / 100,
      })),
    });
  });

  app.get('/api/referrals/weekly-salary', requireAccount, async (request, response) => {
    const directCount = await getDirectReferralCount(sql, request.account.id);
    const teamTotal = await getTeamTotal(sql, request.account.id);
    const tier = getTierByProgress(directCount, teamTotal);

    if (tier < 1) {
      return response.json({
        tier: null,
        weeklySalary: 0,
        message: 'Star 2 tier and above receive weekly salaries.',
        directCount,
        teamTotal,
      });
    }

    const tierName = TIER_NAMES[tier];
    const weeklySalary = TIER_SALARIES[tier];

    const payments = await sql`
      SELECT id, tier_name, salary_cents, payment_week, credited_at
      FROM weekly_salary_payments
      WHERE account_id = ${request.account.id}
      ORDER BY payment_week DESC
      LIMIT 12
    `;

    const totalEarned = payments.reduce((sum, p) => sum + (p.salary_cents / 100), 0);

    return response.json({
      tier: tierName,
      weeklySalary,
      directCount,
      teamTotal,
      totalEarned,
      recentPayments: payments.map(p => ({
        week: p.payment_week,
        amount: p.salary_cents / 100,
        creditedAt: p.credited_at,
      })),
    });
  });

  // ✅ NEW: Manual AutoTrade Endpoints (Claim Daily Trade)
  // =========================================================================

  app.get('/api/trading/can-claim-today', requireAccount, async (request, response) => {
    try {
      const today = new Date().toISOString().split('T')[0];

      // Check if user has active deposit
      const activeDeposits = await sql`
        SELECT id, amount_cents FROM transactions
        WHERE account_id = ${request.account.id} AND type = 'deposit' AND status = 'approved'
        LIMIT 1
      `;

      if (activeDeposits.length === 0) {
        return response.json({
          canClaimToday: false,
          hasActiveDeposit: false,
          alreadyClaimedToday: false,
          dailyProfitAmount: 0,
        });
      }

      // Check if already claimed today
      const alreadyClaimed = await sql`
        SELECT id FROM trading_ledger
        WHERE account_id = ${request.account.id} AND profit_date = ${today}
      `;

      const dailyProfit = getDailyProfitForDeposit(activeDeposits[0].amount_cents);

      return response.json({
        canClaimToday: alreadyClaimed.length === 0,
        hasActiveDeposit: true,
        alreadyClaimedToday: alreadyClaimed.length > 0,
        dailyProfitAmount: dailyProfit,
      });
    } catch (error) {
      console.error('Error in /api/trading/can-claim-today:', error);
      return response.status(500).json({ error: 'Failed to check claim status.' });
    }
  });

  app.post('/api/trading/claim-daily-trade', updateRateLimit, requireAccount, async (request, response, next) => {
    try {
      const today = new Date().toISOString().split('T')[0];

      // Check if user has active deposit
      const activeDeposits = await sql`
        SELECT id, amount_cents FROM transactions
        WHERE account_id = ${request.account.id} AND type = 'deposit' AND status = 'approved'
      `;

      if (activeDeposits.length === 0) {
        return response.status(409).json({ error: 'No active deposits found.' });
      }

      // Check if already claimed today
      const alreadyClaimed = await sql`
        SELECT id FROM trading_ledger
        WHERE account_id = ${request.account.id} AND profit_date = ${today}
      `;

      if (alreadyClaimed.length > 0) {
        return response.status(409).json({ error: 'You have already claimed your trade today.' });
      }

      // Calculate total daily profit from all active deposits
      let totalProfitCents = 0;
      for (const deposit of activeDeposits) {
        const dailyProfit = getDailyProfitForDeposit(deposit.amount_cents);
        if (dailyProfit > 0) {
          totalProfitCents += Math.round(dailyProfit * 100);
        }
      }

      if (totalProfitCents <= 0) {
        return response.status(409).json({ error: 'No profit available to claim.' });
      }

      // Create trading ledger entry for the first deposit (or sum if multiple)
      const ledgerId = randomBytes(16).toString('hex');
      const txId = randomBytes(16).toString('hex');

      await sql`
        INSERT INTO trading_ledger (id, account_id, deposit_transaction_id, profit_cents, profit_date, created_at)
        VALUES (${ledgerId}, ${request.account.id}, ${activeDeposits[0].id}, ${totalProfitCents}, ${today}, ${new Date().toISOString()})
      `;

      await sql`
        INSERT INTO transactions (id, account_id, type, amount_cents, reference, status, created_at)
        VALUES (${txId}, ${request.account.id}, 'trading_profit', ${totalProfitCents}, ${`Manual daily trade claim from ${today}`}, 'approved', ${new Date().toISOString()})
      `;

      await recordAudit(request, 'trading.claim_daily_trade', ledgerId, {
        profitAmount: totalProfitCents / 100,
        profitDate: today,
      });

      return response.status(201).json({
        ok: true,
        message: `Successfully claimed $${(totalProfitCents / 100).toFixed(2)} in daily trading profit.`,
        earnedAmount: totalProfitCents / 100,
        transactionId: txId,
      });
    } catch (error) {
      console.error('Error in /api/trading/claim-daily-trade:', error);
      return next(error);
    }
  });

  // =========================================================================
  // TRADING ENDPOINTS
  // =========================================================================

  app.get('/api/trading/history', requireAccount, async (request, response) => {
    const profits = await sql`
      SELECT
        tl.id,
        tl.profit_cents,
        tl.profit_date,
        tl.created_at,
        t.amount_cents AS deposit_amount,
        t.created_at AS deposit_date
      FROM trading_ledger tl
      JOIN transactions t ON t.id = tl.deposit_transaction_id
      WHERE tl.account_id = ${request.account.id}
      ORDER BY tl.profit_date DESC
      LIMIT 365
    `;

    const totalProfit = profits.reduce((sum, p) => sum + (p.profit_cents / 100), 0);
    const totalProfitDays = new Set(profits.map(p => p.profit_date)).size;

    return response.json({
      totalProfit,
      totalProfitDays,
      profits: profits.map(p => ({
        id: p.id,
        profitAmount: p.profit_cents / 100,
        profitDate: p.profit_date,
        depositAmount: p.deposit_amount / 100,
        creditedAt: p.created_at,
      })),
    });
  });

  // ✅ ADD: Prime Hour Wallet Endpoints
  // =========================================================================

  app.get('/api/prime-hour/balance', requireAccount, async (request, response) => {
    try {
      const wallet = await sql`
        SELECT balance_cents FROM prime_hour_wallets
        WHERE account_id = ${request.account.id}
      `;

      if (wallet.length === 0) {
        // Initialize wallet if it doesn't exist
        const id = randomBytes(16).toString('hex');
        const now = new Date().toISOString();
        await sql`
          INSERT INTO prime_hour_wallets (id, account_id, balance_cents, created_at, updated_at)
          VALUES (${id}, ${request.account.id}, 0, ${now}, ${now})
        `;
        return response.json({ balance: 0 });
      }

      return response.json({ balance: wallet[0].balance_cents / 100 });
    } catch (error) {
      console.error('Error fetching prime hour balance:', error);
      return response.status(500).json({ error: 'Failed to fetch prime hour balance.' });
    }
  });

  app.post('/api/prime-hour/transaction', updateRateLimit, requireAccount, async (request, response, next) => {
    try {
      const { type, amount, reference } = request.body ?? {};

      // Validate transaction type
      if (!['deposit', 'withdrawal'].includes(type)) {
        return response.status(400).json({ error: 'Transaction type must be deposit or withdrawal.' });
      }

      // Validate amount
      const amountCents = parseAmountCents(amount);
      if (amountCents === null || amountCents < 5000) { // $50 minimum
        return response.status(400).json({ error: 'Minimum transaction amount is $50.' });
      }

      // ✅ Check Prime Hour time window (3:45 AM - 4:15 AM EAT/UTC+3)
      const currentTime = new Date();
      const hours = currentTime.getHours();
      const minutes = currentTime.getMinutes();
      const currentMinutes = hours * 60 + minutes;
      const primeStart = 3 * 60 + 45;  // 3:45 AM = 225 minutes
      const primeEnd = 4 * 60 + 15;    // 4:15 AM = 255 minutes
      const isPrimeHourActive = currentMinutes >= primeStart && currentMinutes < primeEnd;

      if (!isPrimeHourActive) {
        return response.status(403).json({
          error: 'Prime Hour is only available from 3:45 AM to 4:15 AM EAT. Check back during this window.'
        });
      }

      // Get referral stats for qualification check
      const directCount = await getDirectReferralCount(sql, request.account.id);
      const tradingDays = await sql`
        SELECT COUNT(DISTINCT DATE(profit_date)) AS days
        FROM trading_ledger
        WHERE account_id = ${request.account.id}
      `;

      const tradingDaysCount = tradingDays[0]?.days || 0;

      // ✅ Check if referral has DEPOSITED (not just signed up)
      const referralDeposits = await sql`
        SELECT COUNT(DISTINCT rs.referred_account_id) AS count
        FROM referral_signups rs
        JOIN transactions t ON t.account_id = rs.referred_account_id
        WHERE rs.referrer_id = ${request.account.id}
        AND t.type = 'deposit'
        AND t.status = 'approved'
      `;

      const hasReferralWithDeposit = referralDeposits[0]?.count > 0;

      // Prime Hour qualification: 3+ days trading AND 1+ referral who DEPOSITED
      if (type === 'deposit') {
        if (tradingDaysCount < 3) {
          return response.status(403).json({
            error: 'You must have traded for at least 3 days on Ascend to access Prime Hour.'
          });
        }

        if (!hasReferralWithDeposit) {
          return response.status(403).json({
            error: 'You must have at least 1 referral who has made a deposit to access Prime Hour deposits.'
          });
        }
      }

      // Get or create wallet
      let wallet = await sql`
        SELECT id, balance_cents FROM prime_hour_wallets
        WHERE account_id = ${request.account.id}
      `;

      let walletId;
      if (wallet.length === 0) {
        walletId = randomBytes(16).toString('hex');
        const now = new Date().toISOString();
        await sql`
          INSERT INTO prime_hour_wallets (id, account_id, balance_cents, created_at, updated_at)
          VALUES (${walletId}, ${request.account.id}, 0, ${now}, ${now})
        `;
        wallet = [{ id: walletId, balance_cents: 0 }];
      } else {
        walletId = wallet[0].id;
      }

      const currentBalance = wallet[0].balance_cents;

      // Handle withdrawal
      if (type === 'withdrawal') {
        if (amountCents > currentBalance) {
          return response.status(409).json({
            error: 'Insufficient prime hour balance for this withdrawal.'
          });
        }

        // Validate wallet address
        if (!reference || typeof reference !== 'string' || reference.trim().length < 8) {
          return response.status(400).json({
            error: 'Enter a valid wallet address (minimum 8 characters).'
          });
        }
      }

      // Process transaction
      const txId = randomBytes(16).toString('hex');
      const now = new Date().toISOString();

      let newBalance = currentBalance;
      if (type === 'deposit') {
        // Add $5 bonus to deposit
        newBalance = currentBalance + amountCents + 500; // $5 = 500 cents
      } else {
        newBalance = currentBalance - amountCents;
      }

      // Update wallet balance
      await sql`
        UPDATE prime_hour_wallets
        SET balance_cents = ${newBalance}, updated_at = ${now}
        WHERE id = ${walletId}
      `;

      // Record transaction
      await sql`
        INSERT INTO prime_hour_transactions (id, account_id, type, amount_cents, reference, status, created_at)
        VALUES (${txId}, ${request.account.id}, ${type}, ${amountCents}, ${reference || `Prime Hour ${type}`}, 'approved', ${now})
      `;

      // Log audit
      await recordAudit(request, `prime_hour.${type}`, txId, {
        amount: amountCents / 100,
        newBalance: newBalance / 100,
        bonus: type === 'deposit' ? 5 : 0,
      });

      const message = type === 'deposit'
        ? `Prime deposit of $${(amountCents / 100).toFixed(2)} successful! +$5 bonus added.`
        : `Prime withdrawal of $${(amountCents / 100).toFixed(2)} completed.`;

      return response.status(201).json({
        ok: true,
        message,
        transactionId: txId,
        balance: newBalance / 100,
      });
    } catch (error) {
      console.error('Error in prime hour transaction:', error);
      return next(error);
    }
  });

  // =========================================================================
  // TRANSACTION ENDPOINTS
  // =========================================================================

  app.post('/api/transactions', updateRateLimit, requireAccount, async (request, response, next) => {
    try {
      if (request.account.role === 'admin') {
        return response.status(403).json({ error: 'Administrator accounts cannot request transactions.' });
      }
      const input = request.body ?? {};
      if (!TX_TYPES.slice(0, 2).includes(input.type)) {
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
        const available = await approvedBalanceCents(request.account.id) - await pendingWithdrawalsCents(request.account.id);
        if (amountCents > available) {
          return response.status(409).json({ error: 'Withdrawal exceeds your available balance.' });
        }
      } else {
        const duplicate = await sql`
          SELECT id FROM transactions
          WHERE type = 'deposit' AND reference = ${reference} AND status IN ('pending', 'approved')
        `;
        if (duplicate.length > 0) {
          return response.status(409).json({ error: 'A deposit with this reference was already submitted.' });
        }
      }

      const id = randomBytes(16).toString('hex');
      const now = new Date().toISOString();

      await sql`
        INSERT INTO transactions (id, account_id, type, amount_cents, reference, status, created_at)
        VALUES (${id}, ${request.account.id}, ${input.type}, ${amountCents}, ${reference}, 'pending', ${now})
      `;

      if (input.type === 'deposit') {
        await sql`UPDATE accounts SET last_deposit_time = ${now} WHERE id = ${request.account.id}`;
      }

      const transaction = await getTransaction(id);
      return response.status(201).json({ transaction: transactionView(transaction) });
    } catch (error) {
      return next(error);
    }
  });

  app.get('/api/transactions', requireAccount, async (request, response) => {
    const rows = await sql`
      SELECT t.*, a.name AS account_name, a.email AS account_email
      FROM transactions t
      JOIN accounts a ON a.id = t.account_id
      WHERE t.account_id = ${request.account.id}
      ORDER BY t.created_at DESC
      LIMIT 100
    `;

    const accountRow = await sql`SELECT last_deposit_time FROM accounts WHERE id = ${request.account.id}`;
    const lastDepositTime = accountRow[0]?.last_deposit_time || null;
    const earningsStatus = calculateEarningsStatus(lastDepositTime);

    // ✅ FIX: Get the actual approved balance (includes ALL earnings)
    const approvedBalance = await approvedBalanceCents(request.account.id) / 100;

    let dailyIncome = 0;
    if (earningsStatus.earningsActive && lastDepositTime) {
      const matchingPlan = DEPOSIT_PLANS.find((plan) => plan.deposit === approvedBalance);
      dailyIncome = matchingPlan ? matchingPlan.dailyProfit : 0;
    }

    return response.json({
      balance: approvedBalance,
      pendingWithdrawals: await pendingWithdrawalsCents(request.account.id) / 100,
      transactions: rows.map((row) => transactionView(row)),
      lastDepositTime,
      earningsActive: earningsStatus.earningsActive,
      earningsStartTime: earningsStatus.earningsStartTime,
      dailyIncome,
    });
  });

  // ✅ NEW: COMPREHENSIVE WALLET - All earnings aggregated
  app.get('/api/wallet/comprehensive', requireAccount, async (request, response) => {
    try {
      // Get all transaction-based earnings (deposits, withdrawals, and all earning types)
      const allTransactions = await sql`
        SELECT
          type,
          COUNT(*) AS count,
          COALESCE(SUM(amount_cents), 0) AS total_cents
        FROM transactions
        WHERE account_id = ${request.account.id} AND status = 'approved'
        GROUP BY type
      `;

      // Build transaction breakdown by type
      const txByType = {};
      let totalDepositsCents = 0;
      let totalWithdrawalsCents = 0;
      let totalEarningsCents = 0;

      for (const row of allTransactions) {
        txByType[row.type] = {
          count: row.count,
          amount_cents: row.total_cents,
          amount: row.total_cents / 100,
        };

        if (row.type === 'deposit') {
          totalDepositsCents += row.total_cents;
        } else if (row.type === 'withdrawal') {
          totalWithdrawalsCents += row.total_cents;
        } else {
          // All other types are earnings: trading_profit, tier_reward, tier_salary, referral_commission
          totalEarningsCents += row.total_cents;
        }
      }

      // Calculate wallet totals
      const totalDeposits = totalDepositsCents / 100;
      const totalWithdrawals = totalWithdrawalsCents / 100;
      const totalEarnings = totalEarningsCents / 100;
      const totalIncome = totalDeposits + totalEarnings;
      const walletBalance = totalIncome - totalWithdrawals;

      return response.json({
        wallet: {
          totalIncome,
          totalDeposits,
          totalWithdrawals,
          walletBalance,
          availableToWithdraw: Math.max(0, walletBalance),
        },
        earnings: {
          tradingProfit: txByType['trading_profit'] ? { count: txByType['trading_profit'].count, amount: txByType['trading_profit'].amount } : { count: 0, amount: 0 },
          tierRewards: txByType['tier_reward'] ? { count: txByType['tier_reward'].count, amount: txByType['tier_reward'].amount } : { count: 0, amount: 0 },
          weeklySalary: txByType['tier_salary'] ? { count: txByType['tier_salary'].count, amount: txByType['tier_salary'].amount } : { count: 0, amount: 0 },
          referralCommissions: txByType['referral_commission'] ? { count: txByType['referral_commission'].count, amount: txByType['referral_commission'].amount } : { count: 0, amount: 0 },
          totalEarnings,
        },
        breakdown: {
          'Trading Profit': txByType['trading_profit']?.amount || 0,
          'Tier Rewards': txByType['tier_reward']?.amount || 0,
          'Weekly Salary': txByType['tier_salary']?.amount || 0,
          'Referral Commissions': txByType['referral_commission']?.amount || 0,
          'Total Earnings': totalEarnings,
          'Total Deposits': totalDeposits,
          'Total Withdrawals': totalWithdrawals,
          'Net Wallet Balance': walletBalance,
        },
        summary: {
          income: totalIncome,
          withdrawals: totalWithdrawals,
          balance: walletBalance,
        },
      });
    } catch (error) {
      console.error('Error fetching comprehensive wallet:', error);
      return response.status(500).json({ error: 'Failed to fetch wallet data.' });
    }
  });

  // =========================================================================
  // ADMIN ENDPOINTS
  // =========================================================================

  const adminLimiter = createRateLimiter({ limit: 60, windowMs: 15 * 60 * 1000 });

  // ✅ NEW: Admin endpoint to check and fix member balance reconciliation
  // ✅ NEW: Admin endpoint to add/create trades for members (automatically updates balance)
  app.post('/api/admin/trading/add-trade', adminLimiter, requireAdminSession, async (request, response, next) => {
    try {
      const { accountId, profitAmount, profitDate } = request.body ?? {};

      if (!accountId || !profitAmount || !profitDate) {
        return response.status(400).json({ error: 'accountId, profitAmount, and profitDate are required.' });
      }

      const profitNum = parseFloat(profitAmount);
      if (isNaN(profitNum) || profitNum <= 0) {
        return response.status(400).json({ error: 'Profit amount must be a positive number.' });
      }

      // Verify member exists
      const member = await sql`SELECT id, name, email FROM accounts WHERE id = ${accountId}`;
      if (member.length === 0) {
        return response.status(404).json({ error: 'Member not found.' });
      }

      // Check if trade already exists for this date
      const existing = await sql`
        SELECT id FROM trading_ledger
        WHERE account_id = ${accountId} AND profit_date = ${profitDate}
      `;

      if (existing.length > 0) {
        return response.status(409).json({ error: 'Trade already exists for this member on this date.' });
      }

      // Get a deposit to link to (or create entry)
      const deposits = await sql`
        SELECT id FROM transactions
        WHERE account_id = ${accountId} AND type = 'deposit' AND status = 'approved'
        LIMIT 1
      `;

      if (deposits.length === 0) {
        return response.status(409).json({ error: 'Member has no approved deposits. Cannot add trade.' });
      }

      const profitCents = Math.round(profitNum * 100);
      const ledgerId = randomBytes(16).toString('hex');
      const txId = randomBytes(16).toString('hex');
      const now = new Date().toISOString();

      // Create trading ledger entry
      await sql`
        INSERT INTO trading_ledger (id, account_id, deposit_transaction_id, profit_cents, profit_date, created_at)
        VALUES (${ledgerId}, ${accountId}, ${deposits[0].id}, ${profitCents}, ${profitDate}, ${now})
      `;

      // Create approved transaction (adds directly to balance)
      await sql`
        INSERT INTO transactions (id, account_id, type, amount_cents, reference, status, created_at)
        VALUES (${txId}, ${accountId}, 'trading_profit', ${profitCents}, ${`Manual trade added on ${profitDate}`}, 'approved', ${now})
      `;

      // Record audit
      await recordAudit(request, 'admin.trading.add_trade', ledgerId, {
        accountId,
        accountName: member[0].name,
        accountEmail: member[0].email,
        profitAmount: profitNum,
        profitDate,
      });

      // Get updated balance
      const newBalance = await approvedBalanceCents(accountId) / 100;

      return response.status(201).json({
        ok: true,
        message: `✅ Added $${profitNum.toFixed(2)} trade for ${member[0].name}. New balance: $${newBalance.toFixed(2)}`,
        ledgerId,
        transactionId: txId,
        memberName: member[0].name,
        profitAmount: profitNum,
        newBalance,
      });
    } catch (error) {
      console.error('Error adding trade:', error);
      return next(error);
    }
  });

  app.get('/api/admin/balance-reconciliation', adminLimiter, requireAdminSession, async (request, response) => {
    try {
      // Get all members with their transactions
      const members = await sql`
        SELECT DISTINCT a.id, a.name, a.email, a.created_at
        FROM accounts a
        WHERE a.role = 'member' AND a.status = 'active'
        ORDER BY a.created_at DESC
        LIMIT 100
      `;

      const reconciliationData = [];

      for (const member of members) {
        // Get current balance using approvedBalanceCents (should include ALL earnings)
        const currentBalance = await approvedBalanceCents(member.id) / 100;

        // Get all approved transactions breakdown
        const txBreakdown = await sql`
          SELECT
            type,
            COUNT(*) as count,
            COALESCE(SUM(amount_cents), 0) as total_cents
          FROM transactions
          WHERE account_id = ${member.id} AND status = 'approved'
          GROUP BY type
        `;

        const txByType = {};
        let deposits = 0, withdrawals = 0, earnings = 0;

        for (const tx of txBreakdown) {
          txByType[tx.type] = {
            count: tx.count,
            amount: tx.total_cents / 100,
          };

          if (tx.type === 'deposit') deposits += tx.total_cents;
          else if (tx.type === 'withdrawal') withdrawals += tx.total_cents;
          else earnings += tx.total_cents;
        }

        const tradingProfit = (txByType['trading_profit']?.amount || 0);
        const referralCommission = (txByType['referral_commission']?.amount || 0);
        const tierReward = (txByType['tier_reward']?.amount || 0);
        const tierSalary = (txByType['tier_salary']?.amount || 0);

        // Check if balance is correct
        const calculatedBalance = (deposits + earnings - withdrawals) / 100;
        const isBalanceCorrect = Math.abs(currentBalance - calculatedBalance) < 0.01; // Allow 1 cent variance

        // Add to reconciliation report only if there's trading profit or balance mismatch
        if (tradingProfit > 0 || !isBalanceCorrect) {
          reconciliationData.push({
            memberId: member.id,
            memberName: member.name,
            memberEmail: member.email,
            currentBalance,
            calculatedBalance,
            isBalanceCorrect,
            deposits: deposits / 100,
            withdrawals: withdrawals / 100,
            earnings: earnings / 100,
            breakdown: {
              tradingProfit,
              referralCommission,
              tierReward,
              tierSalary,
            },
            transactionCounts: {
              deposits: txByType['deposit']?.count || 0,
              withdrawals: txByType['withdrawal']?.count || 0,
              tradingProfits: txByType['trading_profit']?.count || 0,
              referralCommissions: txByType['referral_commission']?.count || 0,
              tierRewards: txByType['tier_reward']?.count || 0,
              tierSalaries: txByType['tier_salary']?.count || 0,
            },
          });
        }
      }

      return response.json({
        totalMembersChecked: members.length,
        membersWithIssues: reconciliationData.length,
        reconciliation: reconciliationData,
      });
    } catch (error) {
      console.error('Error in balance reconciliation:', error);
      return response.status(500).json({ error: 'Failed to check balance reconciliation.' });
    }
  });

  app.get('/api/admin/accounts', adminLimiter, requireAdminSession, async (request, response) => {
    const accounts = await sql`
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
    `;

    return response.json({
      accounts: accounts.map((row) => ({
        ...accountView(row),
        holdReason: row.hold_reason ?? null,
        heldAt: row.held_at ?? null,
        balance: row.balance_cents / 100,
        pendingTransactions: row.pending_count,
      }))
    });
  });

  app.patch('/api/admin/accounts/:id/profile', adminLimiter, requireAdminSession, async (request, response) => {
    const name = request.body?.name;
    if (typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 80) {
      return response.status(400).json({ error: 'Name must be between 2 and 80 characters.' });
    }

    const target = await sql`SELECT id, role FROM accounts WHERE id = ${request.params.id}`;
    if (target.length === 0) return response.status(404).json({ error: 'Member account not found.' });
    if (target[0].role === 'admin') return response.status(403).json({ error: 'Administrator profiles cannot be changed here.' });

    await sql`UPDATE accounts SET name = ${name.trim()} WHERE id = ${target[0].id}`;
    const account = await sql`SELECT id, name, email, phone, created_at, role, status, must_change_password FROM accounts WHERE id = ${target[0].id}`;
    return response.json({ account: accountView(account[0]) });
  });

  app.get('/api/admin/accounts/:id/activity', adminLimiter, requireAdminSession, async (request, response) => {
    const account = await sql`
      SELECT id, name, email, created_at, role, status, hold_reason, held_at
      FROM accounts WHERE id = ${request.params.id}
    `;
    if (account.length === 0) return response.status(404).json({ error: 'Account not found.' });

    const totals = await sql`
      SELECT
        COALESCE(SUM(CASE WHEN status = 'approved' AND type = 'deposit' THEN amount_cents END), 0) AS deposited,
        COALESCE(SUM(CASE WHEN status = 'approved' AND type = 'withdrawal' THEN amount_cents END), 0) AS withdrawn,
        COALESCE(SUM(CASE WHEN status = 'pending' AND type = 'deposit' THEN amount_cents END), 0) AS pending_deposits,
        COALESCE(SUM(CASE WHEN status = 'pending' AND type = 'withdrawal' THEN amount_cents END), 0) AS pending_withdrawals,
        COALESCE(SUM(CASE WHEN status = 'rejected' THEN 1 END), 0) AS rejected_count
      FROM transactions WHERE account_id = ${request.params.id}
    `;

    const recent = await sql`
      SELECT t.*, a.name AS account_name, a.email AS account_email
      FROM transactions t
      JOIN accounts a ON a.id = t.account_id
      WHERE t.account_id = ${request.params.id}
      ORDER BY t.created_at DESC
      LIMIT 50
    `;

    return response.json({
      account: {
        ...accountView(account[0]),
        holdReason: account[0].hold_reason ?? null,
        heldAt: account[0].held_at ?? null,
      },
      summary: {
        balance: (totals[0].deposited - totals[0].withdrawn) / 100,
        totalDeposited: totals[0].deposited / 100,
        totalWithdrawn: totals[0].withdrawn / 100,
        pendingDeposits: totals[0].pending_deposits / 100,
        pendingWithdrawals: totals[0].pending_withdrawals / 100,
        rejectedCount: totals[0].rejected_count,
      },
      transactions: recent.map((row) => transactionView(row, { admin: true })),
    });
  });

  app.patch('/api/admin/accounts/:id', adminLimiter, requireAdminSession, async (request, response, next) => {
    try {
      const target = await sql`SELECT id, name, email, role, status FROM accounts WHERE id = ${request.params.id}`;
      if (target.length === 0) return response.status(404).json({ error: 'Account not found.' });
      if (target[0].role === 'admin') return response.status(403).json({ error: 'Cannot edit administrator accounts.' });

      const name = request.body?.name;
      const email = request.body?.email;

      if (typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 80) {
        return response.status(400).json({ error: 'Name must be between 2 and 80 characters.' });
      }

      const cleanEmail = email?.trim().toLowerCase();
      if (typeof cleanEmail !== 'string' || !EMAIL_PATTERN.test(cleanEmail)) {
        return response.status(400).json({ error: 'Enter a valid email address.' });
      }

      if (cleanEmail !== target[0].email) {
        const existing = await sql`SELECT id FROM accounts WHERE email = ${cleanEmail} AND id != ${target[0].id}`;
        if (existing.length > 0) return response.status(409).json({ error: 'This email is already in use.' });
      }

      await sql`UPDATE accounts SET name = ${name.trim()}, email = ${cleanEmail} WHERE id = ${target[0].id}`;
      await recordAudit(request, 'account.edit', target[0].id, {
        email: target[0].email,
        newName: name.trim(),
        newEmail: cleanEmail,
      });

      const account = await sql`SELECT id, name, email, phone, created_at, role, status, must_change_password FROM accounts WHERE id = ${target[0].id}`;
      return response.json({ account: accountView(account[0]) });
    } catch (error) {
      return next(error);
    }
  });

  app.delete('/api/admin/accounts/:id', adminLimiter, requireAdminSession, async (request, response, next) => {
    try {
      const confirm = request.body?.confirm;
      if (confirm !== 'DELETE') {
        return response.status(400).json({ error: 'Confirmation required to delete account.' });
      }

      const target = await sql`SELECT id, email, role FROM accounts WHERE id = ${request.params.id}`;
      if (target.length === 0) return response.status(404).json({ error: 'Account not found.' });
      if (target[0].role === 'admin') return response.status(403).json({ error: 'Cannot delete administrator accounts.' });

      await sql`DELETE FROM accounts WHERE id = ${target[0].id}`;
      await recordAudit(request, 'account.delete', target[0].id, { email: target[0].email });

      return response.status(204).end();
    } catch (error) {
      return next(error);
    }
  });

  app.post('/api/admin/accounts/:id/balance', adminLimiter, requireAdminSession, async (request, response, next) => {
    try {
      const { action, amountCents, reason } = request.body ?? {};

      if (!['adjust', 'deduct', 'set'].includes(action)) {
        return response.status(400).json({ error: 'Action must be adjust, deduct, or set.' });
      }

      if (typeof amountCents !== 'number' || !Number.isFinite(amountCents) || amountCents <= 0) {
        return response.status(400).json({ error: 'Amount must be a positive number in cents.' });
      }

      const cleanReason = cleanText(reason, { min: 3, max: 300 });
      if (cleanReason === null) {
        return response.status(400).json({ error: 'Reason must be between 3 and 300 characters.' });
      }

      const target = await sql`SELECT id, email, role, status FROM accounts WHERE id = ${request.params.id}`;
      if (target.length === 0) return response.status(404).json({ error: 'Member account not found.' });
      if (target[0].role === 'admin') return response.status(403).json({ error: 'Cannot adjust admin account balances.' });

      const currentBalance = await approvedBalanceCents(request.params.id);
      let txType;
      let txAmount;
      let reference;

      if (action === 'adjust') {
        txType = 'deposit';
        txAmount = amountCents;
        reference = `Admin adjustment: +${(amountCents / 100).toFixed(2)} USD`;
      } else if (action === 'deduct') {
        txType = 'withdrawal';
        txAmount = amountCents;
        reference = `Admin adjustment: -${(amountCents / 100).toFixed(2)} USD`;
      } else if (action === 'set') {
        if (amountCents > currentBalance) {
          txType = 'deposit';
          txAmount = amountCents - currentBalance;
          reference = `Admin set balance: ${(amountCents / 100).toFixed(2)} USD`;
        } else if (amountCents < currentBalance) {
          txType = 'withdrawal';
          txAmount = currentBalance - amountCents;
          reference = `Admin set balance: ${(amountCents / 100).toFixed(2)} USD`;
        } else {
          return response.json({ ok: true, message: 'Balance unchanged.' });
        }
      }

      const txId = randomBytes(16).toString('hex');
      await sql`
        INSERT INTO transactions (id, account_id, type, amount_cents, reference, status, created_at)
        VALUES (${txId}, ${request.params.id}, ${txType}, ${txAmount}, ${reference}, 'approved', ${new Date().toISOString()})
      `;

      await recordAudit(request, 'balance.adjustment', request.params.id, {
        action,
        amountCents,
        reason: cleanReason,
        email: target[0].email,
        previousBalance: currentBalance / 100,
        newBalance: (action === 'set' ? amountCents : (txType === 'deposit' ? currentBalance + txAmount : currentBalance - txAmount)) / 100,
      });

      const newBalance = await approvedBalanceCents(request.params.id);
      return response.json({
        ok: true,
        message: `Balance ${action}ed successfully.`,
        previousBalance: currentBalance / 100,
        newBalance: newBalance / 100,
        transactionId: txId,
      });
    } catch (error) {
      return next(error);
    }
  });

  app.get('/api/admin/transactions', adminLimiter, requireAdminSession, async (request, response) => {
    const { status, type, accountId } = request.query;

    if (status !== undefined && !TX_STATUSES.includes(status)) {
      return response.status(400).json({ error: 'Invalid status filter.' });
    }
    if (type !== undefined && !TX_TYPES.slice(0, 2).includes(type)) {
      return response.status(400).json({ error: 'Invalid type filter.' });
    }
    if (accountId !== undefined && (typeof accountId !== 'string' || accountId.length === 0 || accountId.length > 64)) {
      return response.status(400).json({ error: 'Invalid account filter.' });
    }

    let rows;

    if (status && type && accountId) {
      rows = await sql`
        SELECT t.*, a.name AS account_name, a.email AS account_email
        FROM transactions t
        JOIN accounts a ON a.id = t.account_id
        WHERE t.status = ${status} AND t.type = ${type} AND t.account_id = ${accountId}
        ORDER BY t.created_at DESC
        LIMIT 200
      `;
    } else if (status && type) {
      rows = await sql`
        SELECT t.*, a.name AS account_name, a.email AS account_email
        FROM transactions t
        JOIN accounts a ON a.id = t.account_id
        WHERE t.status = ${status} AND t.type = ${type}
        ORDER BY t.created_at DESC
        LIMIT 200
      `;
    } else if (status && accountId) {
      rows = await sql`
        SELECT t.*, a.name AS account_name, a.email AS account_email
        FROM transactions t
        JOIN accounts a ON a.id = t.account_id
        WHERE t.status = ${status} AND t.account_id = ${accountId}
        ORDER BY t.created_at DESC
        LIMIT 200
      `;
    } else if (type && accountId) {
      rows = await sql`
        SELECT t.*, a.name AS account_name, a.email AS account_email
        FROM transactions t
        JOIN accounts a ON a.id = t.account_id
        WHERE t.type = ${type} AND t.account_id = ${accountId}
        ORDER BY t.created_at DESC
        LIMIT 200
      `;
    } else if (status) {
      rows = await sql`
        SELECT t.*, a.name AS account_name, a.email AS account_email
        FROM transactions t
        JOIN accounts a ON a.id = t.account_id
        WHERE t.status = ${status}
        ORDER BY t.created_at DESC
        LIMIT 200
      `;
    } else if (type) {
      rows = await sql`
        SELECT t.*, a.name AS account_name, a.email AS account_email
        FROM transactions t
        JOIN accounts a ON a.id = t.account_id
        WHERE t.type = ${type}
        ORDER BY t.created_at DESC
        LIMIT 200
      `;
    } else if (accountId) {
      rows = await sql`
        SELECT t.*, a.name AS account_name, a.email AS account_email
        FROM transactions t
        JOIN accounts a ON a.id = t.account_id
        WHERE t.account_id = ${accountId}
        ORDER BY t.created_at DESC
        LIMIT 200
      `;
    } else {
      rows = await sql`
        SELECT t.*, a.name AS account_name, a.email AS account_email
        FROM transactions t
        JOIN accounts a ON a.id = t.account_id
        ORDER BY t.created_at DESC
        LIMIT 200
      `;
    }

    return response.json({ transactions: rows.map((row) => transactionView(row, { admin: true })) });
  });

  function reviewTransaction(decision) {
    return async (request, response, next) => {
      try {
        const note = request.body?.note == null ? '' : cleanText(request.body.note, { min: 0, max: 300 });
        if (note === null) return response.status(400).json({ error: 'Note must be at most 300 characters.' });
        if (decision === 'rejected' && note.length < 3) {
          return response.status(400).json({ error: 'A reason is required to reject a transaction.' });
        }

        const tx = await getTransaction(request.params.id);
        if (!tx) return response.status(404).json({ error: 'Transaction not found.' });
        if (tx.status !== 'pending') {
          return response.status(409).json({ error: `Transaction is already ${tx.status}.` });
        }
        if (decision === 'approved') {
          if (tx.account_id === request.account.id) {
            return response.status(403).json({ error: 'You cannot approve your own transaction.' });
          }
          const owner = await sql`SELECT status FROM accounts WHERE id = ${tx.account_id}`;
          if (owner[0].status === 'held') {
            return response.status(409).json({ error: 'This account is on hold. Release it before approving.' });
          }
          if (tx.type === 'withdrawal' && await approvedBalanceCents(tx.account_id) < tx.amount_cents) {
            return response.status(409).json({ error: 'Insufficient approved balance for this withdrawal.' });
          }
        }

        await sql`
          UPDATE transactions
          SET status = ${decision}, reviewed_by = ${request.account.id}, reviewed_at = ${new Date().toISOString()}, review_note = ${note}
          WHERE id = ${tx.id} AND status = 'pending'
        `;

        await recordAudit(request, `transaction.${decision}`, tx.id, {
          type: tx.type,
          amount: tx.amount_cents / 100,
          accountId: tx.account_id,
          accountEmail: tx.account_email,
          note,
        });

        if (decision === 'approved' && tx.type === 'deposit') {
          const commission = await applyReferralCommission(tx.id);
          if (commission) {
            await recordAudit(request, 'referral.commission_earned', tx.account_id, {
              amount: commission.amount,
              commissionId: commission.commissionId,
              type: commission.bonusType,
              beneficiary: commission.beneficiaryId === tx.account_id ? 'member_self' : 'referrer',
            });
          }

          const referralSignup = await sql`
            SELECT referrer_id FROM referral_signups WHERE referred_account_id = ${tx.account_id} LIMIT 1
          `;

          if (referralSignup.length > 0 && referralSignup[0].referrer_id) {
            const directCount = await getDirectReferralCount(sql, referralSignup[0].referrer_id);
            const teamTotal = await getTeamTotal(sql, referralSignup[0].referrer_id);
            const tier = getTierByProgress(directCount, teamTotal);

            if (tier >= 0) {
              const tierReward = await checkAndCreditTierReward(sql, referralSignup[0].referrer_id);
              if (tierReward) {
                await recordAudit(request, 'referral.tier_reward_credited', referralSignup[0].referrer_id, {
                  tierIndex: tierReward.tierId,
                  tierName: tierReward.tierName,
                  amountUSD: tierReward.amountCents / 100,
                  directCount,
                  teamTotal,
                  triggeredBy: tx.account_id,
                });
              }
            }

            const grandParentSignup = await sql`
              SELECT referrer_id FROM referral_signups WHERE referred_account_id = ${referralSignup[0].referrer_id}
            `;

            if (grandParentSignup.length > 0 && grandParentSignup[0].referrer_id) {
              const grandDirect = await getDirectReferralCount(sql, grandParentSignup[0].referrer_id);
              const grandTeam = await getTeamTotal(sql, grandParentSignup[0].referrer_id);
              const grandTier = getTierByProgress(grandDirect, grandTeam);

              if (grandTier >= 0) {
                const grandParentTierReward = await checkAndCreditTierReward(sql, grandParentSignup[0].referrer_id);
                if (grandParentTierReward) {
                  await recordAudit(request, 'referral.tier_reward_credited', grandParentSignup[0].referrer_id, {
                    tierIndex: grandParentTierReward.tierId,
                    tierName: grandParentTierReward.tierName,
                    amountUSD: grandParentTierReward.amountCents / 100,
                    directCount: grandDirect,
                    teamTotal: grandTeam,
                    triggeredBy: tx.account_id,
                  });
                }
              }
            }
          }
        }

        const updated = await getTransaction(tx.id);
        return response.json({ transaction: transactionView(updated, { admin: true }) });
      } catch (error) {
        return next(error);
      }
    };
  }

  app.post('/api/admin/transactions/:id/approve', adminLimiter, requireAdminSession, reviewTransaction('approved'));
  app.post('/api/admin/transactions/:id/reject', adminLimiter, requireAdminSession, reviewTransaction('rejected'));

  app.post('/api/admin/accounts/:id/hold', adminLimiter, requireAdminSession, async (request, response, next) => {
    try {
      const reason = cleanText(request.body?.reason, { min: 3, max: 300 });
      if (reason === null) {
        return response.status(400).json({ error: 'A hold reason of 3-300 characters is required.' });
      }
      const target = await sql`SELECT id, email, role, status FROM accounts WHERE id = ${request.params.id}`;
      if (target.length === 0) return response.status(404).json({ error: 'Member account not found.' });
      if (target[0].role === 'admin') return response.status(403).json({ error: 'Administrator accounts cannot be put on hold.' });
      if (target[0].status === 'held') return response.status(409).json({ error: 'Account is already on hold.' });

      await sql`UPDATE accounts SET status = 'held', hold_reason = ${reason}, held_at = ${new Date().toISOString()} WHERE id = ${target[0].id}`;
      await sql`DELETE FROM sessions WHERE account_id = ${target[0].id}`;
      await recordAudit(request, 'account.hold', target[0].id, { email: target[0].email, reason });

      const account = await sql`SELECT id, name, email, phone, created_at, role, status, must_change_password FROM accounts WHERE id = ${target[0].id}`;
      return response.json({ account: accountView(account[0]) });
    } catch (error) {
      return next(error);
    }
  });

  app.post('/api/admin/accounts/:id/release', adminLimiter, requireAdminSession, async (request, response, next) => {
    try {
      const note = request.body?.note == null ? '' : cleanText(request.body.note, { min: 0, max: 300 });
      if (note === null) return response.status(400).json({ error: 'Note must be at most 300 characters.' });

      const target = await sql`SELECT id, email, role, status FROM accounts WHERE id = ${request.params.id}`;
      if (target.length === 0) return response.status(404).json({ error: 'Member account not found.' });
      if (target[0].status !== 'held') return response.status(409).json({ error: 'Account is not on hold.' });

      await sql`UPDATE accounts SET status = 'active', hold_reason = NULL, held_at = NULL WHERE id = ${target[0].id}`;
      await recordAudit(request, 'account.release', target[0].id, { email: target[0].email, note });

      const account = await sql`SELECT id, name, email, phone, created_at, role, status, must_change_password FROM accounts WHERE id = ${target[0].id}`;
      return response.json({ account: accountView(account[0]) });
    } catch (error) {
      return next(error);
    }
  });

  app.post('/api/admin/accounts/:id/password', adminLimiter, requireAdminSession, async (request, response, next) => {
    try {
      const newError = passwordError(request.body?.newPassword);
      if (newError) return response.status(400).json({ error: newError });

      const target = await sql`SELECT id, email, role FROM accounts WHERE id = ${request.params.id}`;
      if (target.length === 0) return response.status(404).json({ error: 'Member account not found.' });
      if (target[0].role === 'admin') {
        return response.status(403).json({ error: 'Administrator passwords can only be changed by that administrator.' });
      }

      const hashed = await hashPassword(request.body.newPassword);
      await sql`UPDATE accounts SET password_salt = ${hashed.salt}, password_hash = ${hashed.hash} WHERE id = ${target[0].id}`;
      await sql`DELETE FROM sessions WHERE account_id = ${target[0].id}`;
      await recordAudit(request, 'password.reset_by_admin', target[0].id, { email: target[0].email });
      return response.json({ ok: true });
    } catch (error) {
      return next(error);
    }
  });

  // ✅ ADMIN REFERRAL ENDPOINTS - Accepts ID or Email
  app.get('/api/admin/referrals/:identifier', adminLimiter, requireAdminSession, async (request, response) => {
    const account = await findAccountByIdentifier(sql, request.params.identifier);
    if (!account) return response.status(404).json({ error: 'Account not found.' });

    const directStats = await sql`
      SELECT COUNT(*) AS direct_count
      FROM referral_signups WHERE referrer_id = ${account.id}
    `;

    const commissions = await sql`
      SELECT
        rc.id,
        rc.commission_cents,
        rc.commission_rate,
        rc.created_at,
        a.name AS referred_name,
        a.email AS referred_email,
        t.amount_cents,
        t.type
      FROM referral_commissions rc
      JOIN accounts a ON a.id = rc.referred_account_id
      JOIN transactions t ON t.id = rc.transaction_id
      WHERE rc.referrer_id = ${account.id}
      ORDER BY rc.created_at DESC
      LIMIT 100
    `;

    const directCount = directStats[0].direct_count;
    const teamTotal = await getTeamTotal(sql, account.id);
    const tier = getTierByProgress(directCount, teamTotal);

    return response.json({
      account: { id: account.id, name: account.name, email: account.email },
      tier: tier >= 0 ? TIER_NAMES[tier] : null,
      directReferrals: directCount,
      teamTotal,
      commissions: commissions.map(c => ({
        id: c.id,
        referredName: c.referred_name,
        referredEmail: c.referred_email,
        transactionAmount: c.amount_cents / 100,
        transactionType: c.type,
        commissionRate: c.commission_rate,
        commissionEarned: c.commission_cents / 100,
        earnedAt: c.created_at,
      })),
    });
  });

  // ✅ REFERRED MEMBERS ENDPOINT - Accepts ID or Email
  app.get('/api/admin/referrals/:identifier/referred-members', adminLimiter, requireAdminSession, async (request, response) => {
    const account = await findAccountByIdentifier(sql, request.params.identifier);
    if (!account) return response.status(404).json({ error: 'Account not found.' });

    const referrals = await sql`
      SELECT
        rs.id,
        a.id AS account_id,
        a.name,
        a.email,
        rs.signed_up_at,
        COALESCE(SUM(CASE WHEN t.type = 'deposit' AND t.status = 'approved' THEN t.amount_cents ELSE 0 END), 0) AS total_deposits_cents
      FROM referral_signups rs
      JOIN accounts a ON a.id = rs.referred_account_id
      LEFT JOIN transactions t ON t.account_id = a.id AND t.type = 'deposit' AND t.status = 'approved'
      WHERE rs.referrer_id = ${account.id}
      GROUP BY rs.id, a.id, a.name, a.email, rs.signed_up_at
      ORDER BY rs.signed_up_at DESC
      LIMIT 100
    `;

    return response.json({
      referrer: { id: account.id, name: account.name, email: account.email },
      referrals: referrals.map(r => ({
        id: r.account_id,
        name: r.name,
        email: r.email,
        signedUpAt: r.signed_up_at,
        totalDeposits: r.total_deposits_cents / 100,
      })),
    });
  });

  app.get('/api/admin/audit', adminLimiter, requireAdminSession, async (request, response) => {
    const { action } = request.query;
    if (action !== undefined && (typeof action !== 'string' || action.length === 0 || action.length > 64)) {
      return response.status(400).json({ error: 'Invalid action filter.' });
    }
    const rows = await (action
      ? sql`SELECT id, actor_id, actor_email, action, target_id, detail, ip, created_at FROM audit_log WHERE action = ${action} ORDER BY id DESC LIMIT 200`
      : sql`SELECT id, actor_id, actor_email, action, target_id, detail, ip, created_at FROM audit_log ORDER BY id DESC LIMIT 200`
    );
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

  app.get('/api/admin/trading/ledger', adminLimiter, requireAdminSession, async (request, response) => {
    const { accountId } = request.query;
    let query = sql`
      SELECT
        tl.id,
        tl.account_id,
        tl.profit_cents,
        tl.profit_date,
        tl.created_at,
        a.name AS account_name,
        a.email AS account_email,
        t.amount_cents AS deposit_amount
      FROM trading_ledger tl
      JOIN accounts a ON a.id = tl.account_id
      JOIN transactions t ON t.id = tl.deposit_transaction_id
    `;

    if (accountId) {
      query = sql`${query} WHERE tl.account_id = ${accountId}`;
    }

    const rows = await sql`${query} ORDER BY tl.profit_date DESC LIMIT 500`;
    const totalProfit = rows.reduce((sum, r) => sum + (r.profit_cents / 100), 0);

    return response.json({
      totalProfit,
      count: rows.length,
      ledger: rows.map(r => ({
        id: r.id,
        accountId: r.account_id,
        accountName: r.account_name,
        accountEmail: r.account_email,
        profitAmount: r.profit_cents / 100,
        depositAmount: r.deposit_amount / 100,
        profitDate: r.profit_date,
        creditedAt: r.created_at,
      })),
    });
  });

  app.post('/api/admin/trading/apply-profits', adminLimiter, requireAdminSession, async (request, response, next) => {
    try {
      await applyDailyTradingProfits();
      await recordAudit(request, 'admin.trading_profits_applied', null, {});
      return response.json({ ok: true, message: 'Daily trading profits applied.' });
    } catch (error) {
      return next(error);
    }
  });

  app.get('/api/admin/salary/ledger', adminLimiter, requireAdminSession, async (request, response) => {
    const { accountId, tier } = request.query;
    let query = sql`
      SELECT
        wsp.id,
        wsp.account_id,
        wsp.tier_name,
        wsp.salary_cents,
        wsp.payment_week,
        wsp.credited_at,
        a.name AS account_name,
        a.email AS account_email
      FROM weekly_salary_payments wsp
      JOIN accounts a ON a.id = wsp.account_id
    `;
    const filters = [];

    if (accountId) {
      filters.push(sql`wsp.account_id = ${accountId}`);
    }
    if (tier !== undefined) {
      const tierIndex = TIER_NAMES.indexOf(tier);
      if (tierIndex >= 0) {
        filters.push(sql`wsp.tier_index = ${tierIndex}`);
      }
    }

    if (filters.length > 0) {
      query = sql`${query} WHERE ${sql.join(filters, sql` AND `)}`;
    }

    const rows = await sql`${query} ORDER BY wsp.payment_week DESC LIMIT 500`;
    const totalPaid = rows.reduce((sum, r) => sum + (r.salary_cents / 100), 0);

    return response.json({
      totalPaid,
      count: rows.length,
      payments: rows.map(r => ({
        id: r.id,
        accountId: r.account_id,
        accountName: r.account_name,
        accountEmail: r.account_email,
        tier: r.tier_name,
        amount: r.salary_cents / 100,
        week: r.payment_week,
        creditedAt: r.credited_at,
      })),
    });
  });

  app.post('/api/admin/salary/apply-now', adminLimiter, requireAdminSession, async (request, response, next) => {
    try {
      await applyWeeklySalaries();
      await recordAudit(request, 'admin.weekly_salaries_applied', null, {});
      return response.json({ ok: true, message: 'Weekly salaries applied immediately.' });
    } catch (error) {
      return next(error);
    }
  });

  // =========================================================================
  // ERROR HANDLERS - MUST BE LAST
  // =========================================================================

  app.use('/api', (_request, response) => response.status(404).json({ error: 'API endpoint not found.' }));

  app.use((error, _request, response, _next) => {
    if (error instanceof SyntaxError && 'body' in error) {
      return response.status(400).json({ error: 'Request body must contain valid JSON.' });
    }
    console.error('Request failed:', error);
    return response.status(500).json({ error: 'An unexpected server error occurred.' });
  });

  return { app, close: () => sql.end() };
}

export default createApp;
