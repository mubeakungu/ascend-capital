import { randomBytes, scrypt, scryptSync, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { DatabaseSync } from 'node:sqlite';
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
const TX_TYPES = ['deposit', 'withdrawal', 'tier_reward', 'trading_profit'];
const TX_STATUSES = ['pending', 'approved', 'rejected'];
const MAX_TX_AMOUNT = 10_000_000;
const ADMIN_USERNAME = 'admin';
const DEFAULT_INITIAL_ADMIN_PASSWORD = 'Admin@123';

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

// Tier requirements: qualify by EITHER direct referrals OR team total (whichever is met first)
const TIER_REQUIREMENTS_DETAILED = [
  { direct: 5, team: null },        // Star 1: 5 direct (no team req)
  { direct: 7, team: 13 },          // Star 2: 7 direct OR 13 team
  { direct: 8, team: 25 },          // Star 3: 8 direct OR 25 team
  { direct: 9, team: 40 },          // Star 4: 9 direct OR 40 team
  { direct: 10, team: 70 },         // Star 5: 10 direct OR 70 team
  { direct: 11, team: 150 },        // Star 6: 11 direct OR 150 team
  { direct: 12, team: 400 },        // Star 7: 12 direct OR 400 team
  { direct: 13, team: 700 },        // Star 8: 13 direct OR 700 team
  { direct: 14, team: 100 },        // Crown Leader: 14 direct OR 100 team
];

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
  const typeMap = {
    'tier_reward': 'Tier Reward',
    'trading_profit': 'Trading Profit',
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

// Referral helper functions
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

// Get tier based on EITHER direct referrals OR team total (automatic qualification)
function getTierByProgress(directCount, teamTotal) {
  for (let i = TIER_REQUIREMENTS_DETAILED.length - 1; i >= 0; i--) {
    const req = TIER_REQUIREMENTS_DETAILED[i];
    const directMet = directCount >= req.direct;
    const teamMet = req.team === null || teamTotal >= req.team;
    
    // Qualify if direct count is met AND (no team req OR team total is met)
    if (directMet && teamMet) return i;
  }
  return -1;
}

// Get daily profit amount for a deposit
function getDailyProfitForDeposit(depositCents) {
  const depositAmount = depositCents / 100;
  for (let i = DEPOSIT_PLANS.length - 1; i >= 0; i--) {
    if (depositAmount >= DEPOSIT_PLANS[i].deposit) {
      return DEPOSIT_PLANS[i].dailyProfit;
    }
  }
  return 0;
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
      type TEXT NOT NULL CHECK(type IN ('deposit', 'withdrawal', 'tier_reward')),
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
    CREATE TABLE IF NOT EXISTS referral_codes (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      code TEXT NOT NULL UNIQUE COLLATE NOCASE,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS referral_codes_account_idx ON referral_codes(account_id);
    CREATE TABLE IF NOT EXISTS referral_signups (
      id TEXT PRIMARY KEY,
      referrer_id TEXT REFERENCES accounts(id) ON DELETE SET NULL,
      referral_code TEXT REFERENCES referral_codes(code) ON DELETE SET NULL,
      referred_account_id TEXT NOT NULL UNIQUE REFERENCES accounts(id) ON DELETE CASCADE,
      signed_up_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS referral_signups_referrer_idx ON referral_signups(referrer_id);
    CREATE INDEX IF NOT EXISTS referral_signups_referred_idx ON referral_signups(referred_account_id);
    CREATE TABLE IF NOT EXISTS referral_commissions (
      id TEXT PRIMARY KEY,
      referrer_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      transaction_id TEXT NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
      referred_account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      commission_cents INTEGER NOT NULL CHECK(commission_cents > 0),
      commission_rate REAL NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS referral_commissions_referrer_idx ON referral_commissions(referrer_id);
    CREATE INDEX IF NOT EXISTS referral_commissions_transaction_idx ON referral_commissions(transaction_id);
    CREATE TABLE IF NOT EXISTS trading_ledger (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      deposit_transaction_id TEXT NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
      profit_cents INTEGER NOT NULL CHECK(profit_cents > 0),
      profit_date TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS trading_ledger_account_idx ON trading_ledger(account_id);
    CREATE INDEX IF NOT EXISTS trading_ledger_deposit_idx ON trading_ledger(deposit_transaction_id);
    CREATE INDEX IF NOT EXISTS trading_ledger_date_idx ON trading_ledger(profit_date);
  `);

  // Initialize tier rewards table
  initializeTierRewardsTable(db);

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

  function currentAccount(request, cookieName = SESSION_COOKIE, requireAdminRole = false) {
    const token = readCookie(request, cookieName);
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
    
    if (!row) return null;
    if (requireAdminRole && row.role !== 'admin') return null;
    return row;
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

  function requireAdminSession(request, response, next) {
    const account = currentAccount(request, ADMIN_SESSION_COOKIE, true);
    if (!account) return response.status(401).json({ error: 'Admin authentication required.' });
    request.account = account;
    if (account.mustChangePassword) {
      return response.status(403).json({
        error: 'Change your temporary password to continue.',
        code: 'PASSWORD_CHANGE_REQUIRED',
      });
    }
    return next();
  }

  function seedInitialAdmin() {
    const password = process.env.INITIAL_ADMIN_PASSWORD || DEFAULT_INITIAL_ADMIN_PASSWORD;
    if (password.length > 128) throw new Error('INITIAL_ADMIN_PASSWORD must be at most 128 characters.');

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

  function trackReferralSignup(accountId, referralCode) {
    if (!referralCode || typeof referralCode !== 'string') return;
    const codeRecord = db.prepare('SELECT account_id FROM referral_codes WHERE code = ? COLLATE NOCASE')
      .get(referralCode);

    if (!codeRecord) return;

    const id = randomBytes(16).toString('hex');
    try {
      db.prepare(`
        INSERT INTO referral_signups (id, referrer_id, referral_code, referred_account_id, signed_up_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(id, codeRecord.account_id, referralCode.toUpperCase(), accountId, new Date().toISOString());

      // Check tier reward for the person who provided the code - now uses both direct + team totals
      const directCount = getDirectReferralCount(db, codeRecord.account_id);
      const teamTotal = getTeamTotal(db, codeRecord.account_id);
      const tier = getTierByProgress(directCount, teamTotal);
      
      if (tier >= 0) {
        const tierReward = checkAndCreditTierReward(db, codeRecord.account_id);
        if (tierReward) {
          recordAudit({}, 'referral.tier_reward_credited', codeRecord.account_id, {
            tierIndex: tierReward.tierId,
            tierName: tierReward.tierName,
            amountUSD: tierReward.amountCents / 100,
            directCount,
            teamTotal,
          });
        }
      }

      // Also check tier rewards for the direct referrer of this person's referrer
      const directReferrerOf = db.prepare(`
        SELECT referrer_id FROM referral_signups WHERE referred_account_id = ?
      `).get(codeRecord.account_id);
      
      if (directReferrerOf?.referrer_id) {
        const grandDirect = getDirectReferralCount(db, directReferrerOf.referrer_id);
        const grandTeam = getTeamTotal(db, directReferrerOf.referrer_id);
        const grandTier = getTierByProgress(grandDirect, grandTeam);
        
        if (grandTier >= 0) {
          const grandParentTierReward = checkAndCreditTierReward(db, directReferrerOf.referrer_id);
          if (grandParentTierReward) {
            recordAudit({}, 'referral.tier_reward_credited', directReferrerOf.referrer_id, {
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

  function applyReferralCommission(transactionId) {
    const tx = db.prepare(`
      SELECT t.*, a.id AS account_id
      FROM transactions t
      JOIN accounts a ON a.id = t.account_id
      WHERE t.id = ?
    `).get(transactionId);

    if (!tx || tx.type !== 'deposit' || tx.status !== 'approved') return null;

    // Check if this is the first approved deposit from the member
    const previousDeposits = db.prepare(`
      SELECT COUNT(*) AS cnt FROM transactions
      WHERE account_id = ? AND type = 'deposit' AND status = 'approved' AND created_at < ?
    `).get(tx.account_id, tx.created_at).cnt;

    const isFirstDeposit = previousDeposits === 0;

    const referralSignup = db.prepare(`
      SELECT referrer_id FROM referral_signups WHERE referred_account_id = ? LIMIT 1
    `).get(tx.account_id);

    const referrerId = referralSignup?.referrer_id;
    
    let commissionCents;
    let commissionRate;
    let beneficiaryId = referrerId;
    let bonusType;
    
    if (isFirstDeposit) {
      if (referrerId) {
        // 5% of first deposit amount goes to referrer (referral bonus)
        commissionRate = 0.05;
        commissionCents = Math.round(tx.amount_cents * commissionRate);
        bonusType = 'referral_bonus_5%';
      } else {
        // Non-referred member: 2.5% of first deposit to themselves
        commissionRate = 0.025;
        commissionCents = Math.round(tx.amount_cents * commissionRate);
        beneficiaryId = tx.account_id;
        bonusType = 'first_deposit_bonus_2.5%';
      }
    } else {
      // Recharge deposit - subsequent deposits
      const firstDeposit = db.prepare(`
        SELECT amount_cents FROM transactions
        WHERE account_id = ? AND type = 'deposit' AND status = 'approved'
        ORDER BY created_at ASC
        LIMIT 1
      `).get(tx.account_id);
      
      if (!firstDeposit) return null;
      
      commissionRate = 0.025;
      commissionCents = Math.round(firstDeposit.amount_cents * commissionRate);
      bonusType = 'recharge_bonus_2.5%';
      
      // If no referrer, the member gets the 2.5% recharge bonus themselves
      if (!referrerId) {
        beneficiaryId = tx.account_id;
      }
    }

    const commissionId = randomBytes(16).toString('hex');
    try {
      db.prepare(`
        INSERT INTO referral_commissions (id, referrer_id, transaction_id, referred_account_id, commission_cents, commission_rate, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        commissionId,
        beneficiaryId,
        transactionId,
        tx.account_id,
        commissionCents,
        commissionRate,
        new Date().toISOString(),
      );
      return { commissionId, amount: commissionCents / 100, bonusType, beneficiaryId };
    } catch (error) {
      return null;
    }
  }

  // Apply daily trading profits to all active deposits
  function applyDailyTradingProfits() {
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    
    const activeDeposits = db.prepare(`
      SELECT t.id, t.account_id, t.amount_cents, t.created_at
      FROM transactions t
      WHERE t.type = 'deposit' AND t.status = 'approved'
      ORDER BY t.account_id
    `).all();

    for (const deposit of activeDeposits) {
      // Check if profit already credited today
      const alreadyCredited = db.prepare(`
        SELECT id FROM trading_ledger
        WHERE deposit_transaction_id = ? AND profit_date = ?
      `).get(deposit.id, today);

      if (alreadyCredited) continue;

      // Calculate daily profit based on plan
      const dailyProfit = getDailyProfitForDeposit(deposit.amount_cents);
      if (dailyProfit <= 0) continue;

      const profitCents = Math.round(dailyProfit * 100);
      const ledgerId = randomBytes(16).toString('hex');

      try {
        withTransaction(() => {
          // Record in trading ledger
          db.prepare(`
            INSERT INTO trading_ledger (id, account_id, deposit_transaction_id, profit_cents, profit_date, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
          `).run(ledgerId, deposit.account_id, deposit.id, profitCents, today, new Date().toISOString());

          // Credit profit as approved transaction (no admin review needed)
          const txId = randomBytes(16).toString('hex');
          db.prepare(`
            INSERT INTO transactions (id, account_id, type, amount_cents, reference, status, created_at)
            VALUES (?, ?, 'trading_profit', ?, ?, 'approved', ?)
          `).run(txId, deposit.account_id, profitCents, `Trading profit from ${today}`, new Date().toISOString());
        });
      } catch (error) {
        console.error(`Failed to credit profit for deposit ${deposit.id}:`, error);
      }
    }
  }

  // Run daily trading profit calculations every day at midnight UTC
  function scheduleDailyTradingProfits() {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    tomorrow.setUTCHours(0, 0, 0, 0);
    
    const timeUntilMidnight = tomorrow.getTime() - now.getTime();
    
    setTimeout(() => {
      applyDailyTradingProfits();
      // Run daily after first execution
      setInterval(() => {
        applyDailyTradingProfits();
      }, 24 * 60 * 60 * 1000); // 24 hours
    }, timeUntilMidnight);
  }

  seedInitialAdmin();
  scheduleDailyTradingProfits();

  // =========================================================================
  // PUBLIC ENDPOINTS
  // =========================================================================

  app.get('/api/health', (_request, response) => response.json({
    status: 'ok',
    accountStorage: process.env.ACCOUNT_STORAGE_MODE ?? 'local',
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

  // =========================================================================
  // AUTHENTICATION ENDPOINTS
  // =========================================================================

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

      // Track referral if provided
      const referralCode = input.referralCode?.trim().toUpperCase();
      if (referralCode) {
        trackReferralSignup(id, referralCode);
      }

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
    const account = currentAccount(request, SESSION_COOKIE);
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

  // =========================================================================
  // ADMIN AUTHENTICATION ENDPOINTS
  // =========================================================================

  app.post('/api/admin/auth/login', authRateLimit, async (request, response, next) => {
    try {
      const input = request.body ?? {};
      const error = loginMessage(input);
      if (error) return response.status(400).json({ error });

      const email = input.email.trim().toLowerCase();
      const row = db.prepare(`
        SELECT id, name, email, password_salt, password_hash, created_at, role, status, must_change_password
        FROM accounts WHERE email = ? AND role = 'admin'
      `).get(email);

      const salt = row ? Buffer.from(row.password_salt, 'hex') : Buffer.alloc(16);
      const storedHash = row ? Buffer.from(row.password_hash, 'hex') : Buffer.alloc(PASSWORD_BYTES);
      const candidate = await scryptAsync(input.password, salt, PASSWORD_BYTES, PASSWORD_OPTIONS);
      if (!row || !timingSafeEqual(candidate, storedHash)) {
        return response.status(401).json({ error: 'Admin credentials are incorrect.' });
      }

      if (row.status === 'held') {
        return response.status(403).json({ error: 'This admin account is on hold.' });
      }

      db.prepare('DELETE FROM sessions WHERE account_id = ? AND token_hash IN (SELECT token_hash FROM sessions WHERE account_id = ?)')
        .run(row.id, row.id);
      
      const token = randomBytes(32).toString('base64url');
      const expiresAt = Date.now() + SESSION_DURATION_SECONDS * 1000;
      db.prepare('INSERT INTO sessions (token_hash, account_id, expires_at) VALUES (?, ?, ?)')
        .run(hashToken(token), row.id, expiresAt);
      setSessionCookie(response, token, secureCookie, ADMIN_SESSION_COOKIE);
      
      recordAudit({ ip: request.ip }, 'admin.login', row.id, { email });
      return response.json({ account: accountView(row) });
    } catch (error) {
      return next(error);
    }
  });

  app.get('/api/admin/auth/me', (request, response) => {
    const account = currentAccount(request, ADMIN_SESSION_COOKIE, true);
    return response.json({ account: account ? accountView(account) : null });
  });

  app.post('/api/admin/auth/logout', (request, response, next) => {
    try {
      const token = readCookie(request, ADMIN_SESSION_COOKIE);
      if (token) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hashToken(token));
      clearSessionCookie(response, secureCookie, ADMIN_SESSION_COOKIE);
      return response.status(204).end();
    } catch (error) {
      return next(error);
    }
  });

  // =========================================================================
  // REFERRAL ENDPOINTS
  // =========================================================================

  app.get('/api/referrals/code', requireAccount, (request, response) => {
    const existing = db.prepare('SELECT code FROM referral_codes WHERE account_id = ? LIMIT 1')
      .get(request.account.id);

    if (existing) {
      return response.json({ code: existing.code });
    }

    const code = generateReferralCode();
    const id = randomBytes(16).toString('hex');
    db.prepare(`
      INSERT INTO referral_codes (id, account_id, code, created_at)
      VALUES (?, ?, ?, ?)
    `).run(id, request.account.id, code, new Date().toISOString());

    return response.status(201).json({ code });
  });

  app.get('/api/referrals/tier-progression', requireAccount, (request, response) => {
    const progression = getTierProgression(db, request.account.id);
    return response.json(progression);
  });

  app.get('/api/referrals/earned-rewards', requireAccount, (request, response) => {
    const rewards = db.prepare(`
      SELECT tier_index, tier_name, reward_cents, physical_reward,
        physical_reward_value_cents, direct_referrals_at_award, 
        team_total_at_award, credited_at
      FROM referral_tier_rewards
      WHERE referrer_id = ?
      ORDER BY tier_index ASC
    `).all(request.account.id);

    return response.json({
      directReferrals: getDirectReferralCount(db, request.account.id),
      teamTotal: getTeamTotal(db, request.account.id),
      totalRewardsUSD: rewards.reduce((sum, r) => sum + r.reward_cents / 100, 0),
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

  app.get('/api/referrals/stats', requireAccount, (request, response) => {
    try {
      const directStats = db.prepare(`
        SELECT COUNT(*) AS direct_count,
          COALESCE(SUM(CASE WHEN t.type = 'deposit' AND t.status = 'approved' THEN t.amount_cents ELSE 0 END), 0) AS direct_volume
        FROM referral_signups rs
        LEFT JOIN accounts a ON a.id = rs.referred_account_id
        LEFT JOIN transactions t ON t.account_id = a.id
        WHERE rs.referrer_id = ?
      `).get(request.account.id);

      const commissionStats = db.prepare(`
        SELECT COUNT(*) AS commission_count,
          COALESCE(SUM(commission_cents), 0) AS total_commission_cents
        FROM referral_commissions
        WHERE referrer_id = ?
      `).get(request.account.id);

      const directCount = directStats?.direct_count || 0;
      const teamTotal = getTeamTotal(db, request.account.id) || 0;
      const tier = getTierByProgress(directCount, teamTotal);
      const tierName = tier >= 0 ? TIER_NAMES[tier] : null;
      const commissionRate = tier >= 0 ? REFERRAL_COMMISSION_RATES[tier] : 0;

      return response.json({
        referralCode: db.prepare('SELECT code FROM referral_codes WHERE account_id = ?').get(request.account.id)?.code || null,
        tier: tierName,
        commissionRate: commissionRate,
        directReferrals: directCount,
        directVolume: (directStats?.direct_volume || 0) / 100,
        commissionsEarned: commissionStats?.commission_count || 0,
        totalEarnings: (commissionStats?.total_commission_cents || 0) / 100,
        teamTotal: teamTotal,
      });
    } catch (error) {
      console.error('Error in /api/referrals/stats:', error);
      return response.status(500).json({ error: 'Failed to fetch referral stats.' });
    }
  });

  app.get('/api/referrals/list', requireAccount, (request, response) => {
    const referrals = db.prepare(`
      SELECT
        rs.id,
        a.id AS account_id,
        a.name,
        a.email,
        rs.signed_up_at,
        COALESCE(SUM(CASE WHEN t.type = 'deposit' AND t.status = 'approved' THEN t.amount_cents ELSE 0 END), 0) AS total_deposits
      FROM referral_signups rs
      JOIN accounts a ON a.id = rs.referred_account_id
      LEFT JOIN transactions t ON t.account_id = a.id
      WHERE rs.referrer_id = ?
      GROUP BY a.id
      ORDER BY rs.signed_up_at DESC
      LIMIT 100
    `).all(request.account.id);

    return response.json({
      referrals: referrals.map(r => ({
        id: r.account_id,
        name: r.name,
        email: r.email,
        signedUpAt: r.signed_up_at,
        totalDeposits: r.total_deposits / 100,
      })),
    });
  });

  // =========================================================================
  // TRADING ENDPOINTS
  // =========================================================================

  app.get('/api/trading/history', requireAccount, (request, response) => {
    const profits = db.prepare(`
      SELECT
        tl.id,
        tl.profit_cents,
        tl.profit_date,
        tl.created_at,
        t.amount_cents AS deposit_amount,
        t.created_at AS deposit_date
      FROM trading_ledger tl
      JOIN transactions t ON t.id = tl.deposit_transaction_id
      WHERE tl.account_id = ?
      ORDER BY tl.profit_date DESC
      LIMIT 365
    `).all(request.account.id);

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

  // =========================================================================
  // TRANSACTION ENDPOINTS
  // =========================================================================

  app.post('/api/transactions', updateRateLimit, requireAccount, (request, response, next) => {
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

  // =========================================================================
  // ADMIN ENDPOINTS
  // =========================================================================

  const adminLimiter = createRateLimiter({ limit: 60, windowMs: 15 * 60 * 1000 });

  app.get('/api/admin/accounts', adminLimiter, requireAdminSession, (request, response) => {
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

  app.patch('/api/admin/accounts/:id/profile', adminLimiter, requireAdminSession, (request, response) => {
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

  app.get('/api/admin/accounts/:id/activity', adminLimiter, requireAdminSession, (request, response) => {
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

  app.patch('/api/admin/accounts/:id', adminLimiter, requireAdminSession, (request, response, next) => {
    try {
      const target = db.prepare('SELECT id, name, email, role, status FROM accounts WHERE id = ?').get(request.params.id);
      if (!target) return response.status(404).json({ error: 'Account not found.' });
      if (target.role === 'admin') return response.status(403).json({ error: 'Cannot edit administrator accounts.' });

      const name = request.body?.name;
      const email = request.body?.email;

      if (typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 80) {
        return response.status(400).json({ error: 'Name must be between 2 and 80 characters.' });
      }

      const cleanEmail = email?.trim().toLowerCase();
      if (typeof cleanEmail !== 'string' || !EMAIL_PATTERN.test(cleanEmail)) {
        return response.status(400).json({ error: 'Enter a valid email address.' });
      }

      // Check if new email is already in use
      if (cleanEmail !== target.email) {
        const existing = db.prepare('SELECT id FROM accounts WHERE email = ? AND id != ?').get(cleanEmail, target.id);
        if (existing) return response.status(409).json({ error: 'This email is already in use.' });
      }

      withTransaction(() => {
        db.prepare('UPDATE accounts SET name = ?, email = ? WHERE id = ?')
          .run(name.trim(), cleanEmail, target.id);
        recordAudit(request, 'account.edit', target.id, {
          email: target.email,
          newName: name.trim(),
          newEmail: cleanEmail,
        });
      });

      const account = db.prepare('SELECT id, name, email, created_at, role, status, must_change_password FROM accounts WHERE id = ?')
        .get(target.id);
      return response.json({ account: accountView(account) });
    } catch (error) {
      return next(error);
    }
  });

  app.delete('/api/admin/accounts/:id', adminLimiter, requireAdminSession, (request, response, next) => {
    try {
      const confirm = request.body?.confirm;
      if (confirm !== 'DELETE') {
        return response.status(400).json({ error: 'Confirmation required to delete account.' });
      }

      const target = db.prepare('SELECT id, email, role FROM accounts WHERE id = ?').get(request.params.id);
      if (!target) return response.status(404).json({ error: 'Account not found.' });
      if (target.role === 'admin') return response.status(403).json({ error: 'Cannot delete administrator accounts.' });

      withTransaction(() => {
        // Cascade deletes are handled by foreign keys
        db.prepare('DELETE FROM accounts WHERE id = ?').run(target.id);
        recordAudit(request, 'account.delete', target.id, { email: target.email });
      });

      return response.status(204).end();
    } catch (error) {
      return next(error);
    }
  });

  app.get('/api/admin/transactions', adminLimiter, requireAdminSession, (request, response) => {
    const { status, type, accountId } = request.query;
    const where = [];
    const params = [];

    if (status !== undefined) {
      if (!TX_STATUSES.includes(status)) return response.status(400).json({ error: 'Invalid status filter.' });
      where.push('t.status = ?');
      params.push(status);
    }
    if (type !== undefined) {
      if (!TX_TYPES.slice(0, 2).includes(type)) return response.status(400).json({ error: 'Invalid type filter.' });
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

          // Apply referral commission and tier rewards if deposit is approved
          if (decision === 'approved' && tx.type === 'deposit') {
            const commission = applyReferralCommission(tx.id);
            if (commission) {
              recordAudit(request, 'referral.commission_earned', tx.account_id, {
                amount: commission.amount,
                commissionId: commission.commissionId,
                type: commission.bonusType,
                beneficiary: commission.beneficiaryId === tx.account_id ? 'member_self' : 'referrer',
              });
            }

            // Check and credit tier rewards for the referrer
            const referralSignup = db.prepare(`
              SELECT referrer_id FROM referral_signups WHERE referred_account_id = ? LIMIT 1
            `).get(tx.account_id);

            if (referralSignup?.referrer_id) {
              const directCount = getDirectReferralCount(db, referralSignup.referrer_id);
              const teamTotal = getTeamTotal(db, referralSignup.referrer_id);
              const tier = getTierByProgress(directCount, teamTotal);
              
              if (tier >= 0) {
                const tierReward = checkAndCreditTierReward(db, referralSignup.referrer_id);
                if (tierReward) {
                  recordAudit(request, 'referral.tier_reward_credited', referralSignup.referrer_id, {
                    tierIndex: tierReward.tierId,
                    tierName: tierReward.tierName,
                    amountUSD: tierReward.amountCents / 100,
                    directCount,
                    teamTotal,
                    triggeredBy: tx.account_id,
                  });
                }
              }

              // Also check tier rewards for the grandparent (referrer's referrer)
              const grandParentSignup = db.prepare(`
                SELECT referrer_id FROM referral_signups WHERE referred_account_id = ?
              `).get(referralSignup.referrer_id);
              
              if (grandParentSignup?.referrer_id) {
                const grandDirect = getDirectReferralCount(db, grandParentSignup.referrer_id);
                const grandTeam = getTeamTotal(db, grandParentSignup.referrer_id);
                const grandTier = getTierByProgress(grandDirect, grandTeam);
                
                if (grandTier >= 0) {
                  const grandParentTierReward = checkAndCreditTierReward(db, grandParentSignup.referrer_id);
                  if (grandParentTierReward) {
                    recordAudit(request, 'referral.tier_reward_credited', grandParentSignup.referrer_id, {
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
        });

        return response.json({ transaction: transactionView(getTransaction(tx.id), { admin: true }) });
      } catch (error) {
        return next(error);
      }
    };
  }

  app.post('/api/admin/transactions/:id/approve', adminLimiter, requireAdminSession, reviewTransaction('approved'));
  app.post('/api/admin/transactions/:id/reject', adminLimiter, requireAdminSession, reviewTransaction('rejected'));

  app.post('/api/admin/accounts/:id/hold', adminLimiter, requireAdminSession, (request, response, next) => {
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

  app.post('/api/admin/accounts/:id/release', adminLimiter, requireAdminSession, (request, response, next) => {
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

  app.post('/api/admin/accounts/:id/password', adminLimiter, requireAdminSession, async (request, response, next) => {
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

  app.get('/api/admin/referrals/:accountId/tier-rewards', adminLimiter, requireAdminSession, (request, response) => {
    const account = db.prepare('SELECT id, name, email FROM accounts WHERE id = ?').get(request.params.accountId);
    if (!account) return response.status(404).json({ error: 'Account not found.' });

    const progression = getTierProgression(db, account.id);
    const rewards = db.prepare(`
      SELECT tier_index, tier_name, reward_cents, physical_reward,
        physical_reward_value_cents, direct_referrals_at_award, 
        team_total_at_award, credited_at, transaction_id
      FROM referral_tier_rewards
      WHERE referrer_id = ?
      ORDER BY tier_index ASC
    `).all(account.id);

    return response.json({
      account: { id: account.id, name: account.name, email: account.email },
      directReferrals: progression.directReferrals,
      teamTotal: progression.teamTotal,
      currentTier: progression.currentTierName,
      earnedRewards: rewards.map(r => ({
        tierIndex: r.tier_index,
        tierName: r.tier_name,
        amountUSD: r.reward_cents / 100,
        physicalReward: r.physical_reward,
        directWhen: r.direct_referrals_at_award,
        teamTotalWhen: r.team_total_at_award,
        creditedAt: r.credited_at,
        transactionId: r.transaction_id,
      })),
    });
  });

  app.get('/api/admin/referrals/:accountId', adminLimiter, requireAdminSession, (request, response) => {
    const account = db.prepare('SELECT id, name, email FROM accounts WHERE id = ?').get(request.params.accountId);
    if (!account) return response.status(404).json({ error: 'Account not found.' });

    const directStats = db.prepare(`
      SELECT COUNT(*) AS direct_count
      FROM referral_signups WHERE referrer_id = ?
    `).get(account.id);

    const commissions = db.prepare(`
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
      WHERE rc.referrer_id = ?
      ORDER BY rc.created_at DESC
      LIMIT 100
    `).all(account.id);

    const directCount = directStats.direct_count;
    const teamTotal = getTeamTotal(db, account.id);
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

  app.get('/api/admin/audit', adminLimiter, requireAdminSession, (request, response) => {
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

  app.get('/api/admin/trading/ledger', adminLimiter, requireAdminSession, (request, response) => {
    const { accountId } = request.query;
    let sql = `
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
    const params = [];

    if (accountId) {
      sql += ' WHERE tl.account_id = ?';
      params.push(accountId);
    }

    sql += ' ORDER BY tl.profit_date DESC LIMIT 500';

    const rows = db.prepare(sql).all(...params);
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

  app.post('/api/admin/trading/apply-profits', adminLimiter, requireAdminSession, (request, response, next) => {
    try {
      applyDailyTradingProfits();
      recordAudit(request, 'admin.trading_profits_applied', null, {});
      return response.json({ ok: true, message: 'Daily trading profits applied.' });
    } catch (error) {
      return next(error);
    }
  });

  // =========================================================================
  // ERROR HANDLERS
  // =========================================================================

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