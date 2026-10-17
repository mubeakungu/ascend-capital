import { randomBytes } from 'crypto';

// Tier names
const TIER_NAMES = [
  'Star 1',
  'Star 2',
  'Star 3',
  'Star 4',
  'Star 5',
  'Star 6',
  'Star 7',
  'Star 8',
  'Crown Leader',
];

// Direct referrals required to reach each tier
const TIER_REQUIREMENTS = [1, 3, 6, 10, 15, 25, 40, 60, 100];

// Tier reward amounts (in cents)
const TIER_REWARDS = {
  0: 8000,      // Star 1: $80
  1: 15000,     // Star 2: $150
  2: 25000,     // Star 3: $250
  3: 40000,     // Star 4: $400
  4: 70000,     // Star 5: $700
  5: 100000,    // Star 6: $1,000
  6: 250000,    // Star 7: $2,500 (+ house value noted separately)
  7: 450000,    // Star 8: $4,500 (+ car value noted separately)
  8: 700000,    // Crown Leader: $7,000 (+ car value noted separately)
};

const TIER_PHYSICAL_REWARDS = {
  6: { item: 'House', estimatedValue: 80000 },
  7: { item: 'Mazda CX-5', estimatedValue: 27000 },
  8: { item: 'Mercedes-Benz E300', estimatedValue: 46000 },
};

// Initialize tier rewards table
function initializeTierRewardsTable(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS referral_tier_rewards (
      id TEXT PRIMARY KEY,
      referrer_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      tier_index INTEGER NOT NULL CHECK(tier_index >= 0 AND tier_index <= 8),
      tier_name TEXT NOT NULL,
      reward_cents INTEGER NOT NULL CHECK(reward_cents > 0),
      physical_reward TEXT,
      physical_reward_value_cents INTEGER,
      credited_at TEXT NOT NULL,
      transaction_id TEXT REFERENCES transactions(id)
    );
    CREATE INDEX IF NOT EXISTS tier_rewards_referrer_idx ON referral_tier_rewards(referrer_id);
    CREATE INDEX IF NOT EXISTS tier_rewards_tier_idx ON referral_tier_rewards(referrer_id, tier_index);
  `);
}

// Get direct referral count for a user
function getDirectReferralCount(db, referrerId) {
  const result = db.prepare(`
    SELECT COUNT(*) AS cnt FROM referral_signups WHERE referrer_id = ?
  `).get(referrerId);
  return result?.cnt || 0;
}

// Get tier by direct referral count
function getTierByDirectReferrals(directCount) {
  for (let i = TIER_REQUIREMENTS.length - 1; i >= 0; i--) {
    if (directCount >= TIER_REQUIREMENTS[i]) {
      return i;
    }
  }
  return -1; // No tier yet
}

// Get direct referral count for a user
function getDirectReferralCount(db, referrerId) {
  const result = db.prepare(`
    SELECT COUNT(*) AS cnt FROM referral_signups WHERE referrer_id = ?
  `).get(referrerId);
  return result?.cnt || 0;
}

// Check and credit tier rewards when new referral is created
function checkAndCreditTierReward(db, referrerId) {
  // Get current direct referral count
  const directCount = db.prepare(`
    SELECT COUNT(*) AS cnt FROM referral_signups WHERE referrer_id = ?
  `).get(referrerId).cnt;

  // Calculate current tier
  const currentTier = getTierByDirectReferrals(directCount);
  
  if (currentTier < 0) return null; // No tier yet

  // Check if this tier reward has already been credited
  const existing = db.prepare(`
    SELECT id FROM referral_tier_rewards 
    WHERE referrer_id = ? AND tier_index = ?
  `).get(referrerId, currentTier);

  if (existing) return null; // Already credited

  // Get referrer account to verify they exist
  const referrer = db.prepare('SELECT id, email FROM accounts WHERE id = ?').get(referrerId);
  if (!referrer) return null;

  // Credit the tier reward
  const tierName = TIER_NAMES[currentTier];
  const rewardCents = TIER_REWARDS[currentTier];
  const physicalReward = TIER_PHYSICAL_REWARDS[currentTier];

  const transactionId = randomBytes(16).toString('hex');
  const rewardId = randomBytes(16).toString('hex');
  const now = new Date().toISOString();

  try {
    // Create reward transaction (special type)
    db.prepare(`
      INSERT INTO transactions (id, account_id, type, amount_cents, reference, status, created_at)
      VALUES (?, ?, 'tier_reward', ?, ?, 'approved', ?)
    `).run(
      transactionId,
      referrerId,
      rewardCents,
      `${tierName} Tier Reward`,
      now
    );

    // Record tier reward
    db.prepare(`
      INSERT INTO referral_tier_rewards (
        id, referrer_id, tier_index, tier_name, reward_cents,
        physical_reward, physical_reward_value_cents, credited_at, transaction_id
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      rewardId,
      referrerId,
      currentTier,
      tierName,
      rewardCents,
      physicalReward ? physicalReward.item : null,
      physicalReward ? physicalReward.estimatedValue * 100 : null,
      now,
      transactionId
    );

    return {
      rewardId,
      tierId: currentTier,
      tierName,
      amountCents: rewardCents,
      physicalReward: physicalReward || null,
    };
  } catch (error) {
    console.error('Failed to credit tier reward:', error);
    return null;
  }
}

// Get tier progression for a referrer
function getTierProgression(db, referrerId) {
  const directCount = db.prepare(`
    SELECT COUNT(*) AS cnt FROM referral_signups WHERE referrer_id = ?
  `).get(referrerId).cnt;

  const currentTier = getTierByDirectReferrals(directCount);

  // Get earned tier rewards
  const earnedRewards = db.prepare(`
    SELECT tier_index, tier_name, reward_cents, physical_reward,
      physical_reward_value_cents, credited_at
    FROM referral_tier_rewards
    WHERE referrer_id = ?
    ORDER BY tier_index ASC
  `).all(referrerId);

  // Calculate progress to next tier
  let nextTierThreshold = null;
  let currentTierThreshold = null;
  let progressToNext = 0;

  if (currentTier >= 0) {
    currentTierThreshold = TIER_REQUIREMENTS[currentTier];
    if (currentTier < 8) {
      nextTierThreshold = TIER_REQUIREMENTS[currentTier + 1];
      progressToNext = Math.round((directCount / nextTierThreshold) * 100);
    }
  } else {
    nextTierThreshold = TIER_REQUIREMENTS[0];
    progressToNext = 0;
  }

  return {
    directReferrals: directCount,
    currentTierIndex: currentTier,
    currentTierName: currentTier >= 0 ? TIER_NAMES[currentTier] : null,
    earnedRewards: earnedRewards.map(r => ({
      tierIndex: r.tier_index,
      tierName: r.tier_name,
      amountUSD: r.reward_cents / 100,
      physicalReward: r.physical_reward,
      physicalRewardValue: r.physical_reward_value_cents ? r.physical_reward_value_cents / 100 : null,
      creditedAt: r.credited_at,
    })),
    progression: {
      currentThreshold: currentTierThreshold,
      nextThreshold: nextTierThreshold,
      progressPercent: progressToNext,
      needsForNext: nextTierThreshold ? Math.max(0, nextTierThreshold - directCount) : 0,
    },
  };
}

export {
  initializeTierRewardsTable,
  checkAndCreditTierReward,
  getTierProgression,
  getTierByDirectReferrals,
  getDirectReferralCount,
  TIER_NAMES,
  TIER_REQUIREMENTS,
  TIER_REWARDS,
  TIER_PHYSICAL_REWARDS,
};
