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
const TX_TYPES = ['deposit', 'withdrawal', 'tier_reward', 'trading_profit', 'tier_salary'];
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
  { direct: 5, team: null },        // Star 1: 5 direct (no team req)
  { direct: 7, team: 13 },          // Star 2: 7 direct OR 13 team
  { direct: 8, team: 25 },          // Star 3: 8 direct OR 25 team
  { direct: 9, team: 40 },          // Star 4: 9 direct OR 40 team
  { direct: 10, team: 70 },         // Star 5: 10 direct OR 70 team
  { direct: 11, team: 150 },        // Star 6: 11 direct OR 150 team
  { direct: 12, team: 400 },        // Star 7: 12 direct OR 400 team
  { direct: 13, team: 700 },        // Star 8: 13 direct OR 700 team
  { direct: 14, team: 1000 },       // Crown Leader: 14 direct OR 1,000 team
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
    const teamMet = req.team === null || teamTotal >= req.team;

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
  let account = await sql`SELECT id, name, email FROM accounts WHERE id = ${identifier}`;

  if (account.length === 0) {
    const emailLower = identifier.toLowerCase().trim();
    account = await sql`SELECT id, name, email FROM accounts WHERE LOWER(email) = ${emailLower}`;
  }

  return account.length > 0 ? account[0] : null;
}

export async function createApp() {
  const sql = postgres(process.env.DATABASE_URL);

  // ✅ PROFIT CLAIMING TABLE INITIALIZATION
  await sql`
    CREATE TABLE IF NOT EXISTS profit_claims (
      id TEXT PRIMARY KEY,
      deposit_transaction_id TEXT NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
      account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      claim_date TEXT NOT NULL,
      profit_cents INTEGER NOT NULL CHECK(profit_cents > 0),
      claimed_at TEXT NOT NULL
    );
  `;
  await sql`CREATE INDEX IF NOT EXISTS profit_claims_deposit_idx ON profit_claims(deposit_transaction_id)`;
  await sql`CREATE INDEX IF NOT EXISTS profit_claims_account_idx ON profit_claims(account_id)`;
  await sql`CREATE INDEX IF NOT EXISTS profit_claims_date_idx ON profit_claims(claim_date)`;

  // ✅ TRADES TABLE INITIALIZATION
  await sql`
    CREATE TABLE IF NOT EXISTS trades (
      id TEXT PRIMARY KEY,
      deposit_transaction_id TEXT NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
      account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      triggered_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `;
  await sql`CREATE INDEX IF NOT EXISTS trades_deposit_idx ON trades(deposit_transaction_id)`;
  await sql`CREATE INDEX IF NOT EXISTS trades_account_idx ON trades(account_id)`;

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
      type TEXT NOT NULL CHECK(type IN ('deposit', 'withdrawal', 'tier_reward', 'trading_profit', 'tier_salary')),
      amount_cents INTEGER NOT NULL CHECK(amount_cents > 0),
      reference TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected')),
      locked_at TEXT,
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

  function recordAudit(request, action, targetId, detail = {}) {
    return sql`
      INSERT INTO audit_log (actor_id, actor_email, action, target_id, detail, ip, created_at)
      VALUES (${request.account?.id ?? null}, ${request.account?.email ?? null}, ${action}, ${targetId ?? null}, ${JSON.stringify(detail)}, ${request.ip ?? null}, ${new Date().toISOString()})
    `;
  }

  async function approvedBalanceCents(accountId) {
    const row = await sql`
      SELECT COALESCE(SUM(CASE WHEN type = 'deposit' THEN amount_cents ELSE -amount_cents END), 0) AS balance
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
      WHERE sessions.token_hash = ${tokenHash} AND sessions.expires_at > ${now}
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
      await sql`
        INSERT INTO referral_commissions (id, referrer_id, transaction_id, referred_account_id, commission_cents, commission_rate, created_at)
        VALUES (${commissionId}, ${beneficiaryId}, ${transactionId}, ${tx.account_id}, ${commissionCents}, ${commissionRate}, ${new Date().toISOString()})
      `;
      return { commissionId, amount: commissionCents / 100, bonusType, beneficiaryId };
    } catch (error) {
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
  scheduleDailyTradingProfits();

  // =========================================================================
  // REST OF YOUR APP CODE HERE (copy all existing endpoints)
  // Keep your existing endpoints from line 903 onwards
  // All public endpoints, auth endpoints, referral endpoints, trading endpoints, etc.
  // =========================================================================

  // ✅ ADD THESE PROFIT CLAIMING ENDPOINTS IN TRANSACTION ENDPOINTS SECTION

  // GET CLAIMABLE PROFIT
  app.get('/api/deposits/:id/claimable-profit', requireAccount, async (request, response) => {
    try {
      const depositId = request.params.id;
      const deposit = await sql`
        SELECT id, account_id, amount_cents, created_at
        FROM transactions
        WHERE id = ${depositId} AND account_id = ${request.account.id} AND type = 'deposit' AND status = 'approved'
      `;

      if (deposit.length === 0) {
        return response.status(404).json({ error: 'Deposit not found.' });
      }

      const depositTx = deposit[0];
      const today = new Date().toISOString().split('T')[0];

      const alreadyClaimed = await sql`
        SELECT id FROM profit_claims
        WHERE deposit_transaction_id = ${depositId} AND claim_date = ${today}
      `;

      if (alreadyClaimed.length > 0) {
        return response.json({
          claimableProfit: 0,
          alreadyClaimedToday: true,
          message: 'You have already claimed profit for today.',
          lastClaimDate: today,
        });
      }

      const tradingProfit = await sql`
        SELECT COALESCE(SUM(profit_cents), 0) AS total_profit
        FROM trading_ledger
        WHERE deposit_transaction_id = ${depositId} AND profit_date = ${today}
      `;

      let claimableAmount = tradingProfit[0]?.total_profit || 0;
      if (claimableAmount === 0) {
        const dailyProfit = getDailyProfitForDeposit(depositTx.amount_cents);
        claimableAmount = Math.round(dailyProfit * 100);
      }

      return response.json({
        claimableProfit: claimableAmount / 100,
        alreadyClaimedToday: false,
        depositAmount: depositTx.amount_cents / 100,
        message: claimableAmount > 0 ? 'Profit available to claim.' : 'No profit available yet.',
      });
    } catch (error) {
      console.error('Error calculating claimable profit:', error);
      return response.status(500).json({ error: 'Failed to calculate claimable profit.' });
    }
  });

  // CLAIM PROFIT
  app.post('/api/deposits/:id/claim-profit', requireAccount, async (request, response) => {
    try {
      const depositId = request.params.id;
      const today = new Date().toISOString().split('T')[0];

      const deposit = await sql`
        SELECT id, account_id, amount_cents, created_at, locked_at
        FROM transactions
        WHERE id = ${depositId} AND account_id = ${request.account.id} AND type = 'deposit' AND status = 'approved'
      `;

      if (deposit.length === 0) {
        return response.status(404).json({ error: 'Deposit not found.' });
      }

      const alreadyClaimed = await sql`
        SELECT id FROM profit_claims
        WHERE deposit_transaction_id = ${depositId} AND claim_date = ${today}
      `;

      if (alreadyClaimed.length > 0) {
        return response.status(409).json({ error: 'You have already claimed profit for today.' });
      }

      const tradingProfit = await sql`
        SELECT COALESCE(SUM(profit_cents), 0) AS total_profit
        FROM trading_ledger
        WHERE deposit_transaction_id = ${depositId} AND profit_date = ${today}
      `;

      let profitCents = tradingProfit[0]?.total_profit || 0;
      if (profitCents === 0) {
        const dailyProfit = getDailyProfitForDeposit(deposit[0].amount_cents);
        profitCents = Math.round(dailyProfit * 100);
      }

      if (profitCents <= 0) {
        return response.status(400).json({ error: 'No profit available to claim.' });
      }

      const claimId = randomBytes(16).toString('hex');
      await sql`
        INSERT INTO profit_claims (id, deposit_transaction_id, account_id, claim_date, profit_cents, claimed_at)
        VALUES (${claimId}, ${depositId}, ${request.account.id}, ${today}, ${profitCents}, ${new Date().toISOString()})
      `;

      const txId = randomBytes(16).toString('hex');
      await sql`
        INSERT INTO transactions (id, account_id, type, amount_cents, reference, status, created_at)
        VALUES (${txId}, ${request.account.id}, 'trading_profit', ${profitCents}, ${'Claimed profit from ' + today}, 'approved', ${new Date().toISOString()})
      `;

      return response.json({
        success: true,
        claimId,
        amount: profitCents / 100,
        date: today,
        message: `Successfully claimed ${(profitCents / 100).toFixed(2)} USD profit.`,
        transactionId: txId,
      });
    } catch (error) {
      console.error('Error claiming profit:', error);
      return response.status(500).json({ error: 'Failed to claim profit.' });
    }
  });

  // TRIGGER TRADE
  app.post('/api/trades/:depositId/trigger', requireAccount, async (request, response) => {
    try {
      const depositId = request.params.depositId;

      const deposit = await sql`
        SELECT id, account_id FROM transactions
        WHERE id = ${depositId} AND account_id = ${request.account.id} AND type = 'deposit' AND status = 'approved'
      `;

      if (deposit.length === 0) {
        return response.status(404).json({ error: 'Deposit not found.' });
      }

      const tradeId = randomBytes(16).toString('hex');
      const now = new Date().toISOString();

      await sql`
        INSERT INTO trades (id, deposit_transaction_id, account_id, triggered_at, created_at)
        VALUES (${tradeId}, ${depositId}, ${request.account.id}, ${now}, ${now})
      `;

      return response.json({
        success: true,
        tradeId,
        message: 'Trade triggered successfully.',
        triggeredAt: now,
      });
    } catch (error) {
      console.error('Error triggering trade:', error);
      return response.status(500).json({ error: 'Failed to trigger trade.' });
    }
  });

  // GET DEPOSITS WITH LOCK STATUS
  app.get('/api/deposits', requireAccount, async (request, response) => {
    try {
      const deposits = await sql`
        SELECT
          id,
          amount_cents,
          created_at,
          status,
          locked_at
        FROM transactions
        WHERE account_id = ${request.account.id} AND type = 'deposit'
        ORDER BY created_at DESC
        LIMIT 50
      `;

      return response.json({
        deposits: deposits.map(d => ({
          id: d.id,
          amount: d.amount_cents / 100,
          status: d.status,
          isLocked: d.locked_at !== null,
          lockedAt: d.locked_at,
          createdAt: d.created_at,
        })),
      });
    } catch (error) {
      console.error('Error fetching deposits:', error);
      return response.status(500).json({ error: 'Failed to fetch deposits.' });
    }
  });

  // LOCK DEPOSIT (ADMIN)
  app.patch('/api/admin/deposits/:id/lock', adminLimiter, requireAdminSession, async (request, response) => {
    try {
      const depositId = request.params.id;
      const now = new Date().toISOString();

      await sql`
        UPDATE transactions
        SET locked_at = ${now}
        WHERE id = ${depositId} AND type = 'deposit'
      `;

      return response.json({
        success: true,
        message: 'Deposit plan locked.',
        lockedAt: now,
      });
    } catch (error) {
      console.error('Error locking deposit plan:', error);
      return response.status(500).json({ error: 'Failed to lock deposit plan.' });
    }
  });

  // ✅ IN THE TRANSACTION REVIEW FUNCTION, ADD THIS WHEN APPROVING DEPOSITS:
  // Add around line ~1820 where deposits are approved:
  // await sql`UPDATE transactions SET locked_at = ${new Date().toISOString()} WHERE id = ${tx.id}`;

  // Return app and close function
  return {
    app,
    close: () => sql.end(),
  };
}
