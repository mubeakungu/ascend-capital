import { randomBytes } from 'node:crypto';

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

// Tier requirements: [direct referrals needed, team total needed]
const TIER_REQUIREMENTS = [
  { direct: 5, team: 0 },        // Star 1: 5 direct
  { direct: 7, team: 13 },       // Star 2: 7 direct + 13 team
  { direct: 8, team: 25 },       // Star 3: 8 direct + 25 team
  { direct: 9, team: 40 },       // Star 4: 9 direct + 40 team
  { direct: 10, team: 70 },      // Star 5: 10 direct + 70 team
  { direct: 11, team: 150 },     // Star 6: 11 direct + 150 team
  { direct: 12, team: 400 },     // Star 7: 12 direct + 400 team
  { direct: 13, team: 700 },     // Star 8: 13 direct + 700 team
  { direct: 14, team: 1000 },    // Crown Leader: 14 direct + 1000 team
];

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
async function initializeTierRewardsTable(sql) {
  await sql`
    CREATE TABLE IF NOT EXISTS referral_tier_rewards (
      id TEXT PRIMARY KEY,
      referrer_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      tier_index INTEGER NOT NULL CHECK(tier_index >= 0 AND tier_index <= 8),
      tier_name TEXT NOT NULL,
      reward_cents INTEGER NOT NULL CHECK(reward_cents > 0),
      physical_reward TEXT,
      physical_reward_value_cents INTEGER,
      direct_referrals_at_award INTEGER,
      team_total_at_award INTEGER,
      credited_at TEXT NOT NULL,
      transaction_id TEXT REFERENCES transactions(id)
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS tier_rewards_referrer_idx ON referral_tier_rewards(referrer_id)`;
  await sql`CREATE INDEX IF NOT EXISTS tier_rewards_tier_idx ON referral_tier_rewards(referrer_id, tier_index)`;
}

// Get direct referral count for a user
async function getDirectReferralCount(sql, referrerId) {
  const result = await sql`
    SELECT COUNT(*) AS cnt FROM referral_signups WHERE referrer_id = ${referrerId}
  `;
  return Number(result[0]?.cnt || 0);
}

// Generations that count towards the team total:
// 1st = your direct referrals, 2nd = people they refer, 3rd = people the 2nd refer
const TEAM_GENERATIONS = 3;

// Get team total (1st + 2nd + 3rd generation)
async function getTeamTotal(sql, referrerId) {
  const result = await sql`
    WITH RECURSIVE team_tree AS (
      SELECT referred_account_id, 1 AS generation
      FROM referral_signups WHERE referrer_id = ${referrerId}
      UNION ALL
      SELECT rs.referred_account_id, tt.generation + 1
      FROM referral_signups rs
      JOIN team_tree tt ON rs.referrer_id = tt.referred_account_id
      WHERE tt.generation < ${TEAM_GENERATIONS}
    )
    SELECT COUNT(DISTINCT referred_account_id) AS cnt FROM team_tree
  `;
  return Number(result[0]?.cnt || 0);
}

// Get tier by direct referral count AND team total (both must be met)
function getTierByDirectReferrals(directCount, teamTotal = 0) {
  for (let i = TIER_REQUIREMENTS.length - 1; i >= 0; i--) {
    const requirement = TIER_REQUIREMENTS[i];
    // Both direct referrals AND team total requirements must be met
    if (directCount >= requirement.direct && teamTotal >= requirement.team) {
      return i;
    }
  }
  return -1; // No tier yet
}

// Credit one tier reward straight into the wallet (approved transaction)
async function creditTierReward(sql, referrerId, tierIndex, directCount, teamTotal) {
  const tierName = TIER_NAMES[tierIndex];
  const rewardCents = TIER_REWARDS[tierIndex];
  const physicalReward = TIER_PHYSICAL_REWARDS[tierIndex];

  const transactionId = randomBytes(16).toString('hex');
  const rewardId = randomBytes(16).toString('hex');
  const now = new Date().toISOString();

  try {
    await sql.begin(async (tx) => {
      // Create reward transaction (special type)
      await tx`
        INSERT INTO transactions (id, account_id, type, amount_cents, reference, status, created_at)
        VALUES (${transactionId}, ${referrerId}, 'tier_reward', ${rewardCents}, ${`${tierName} Tier Reward`}, 'approved', ${now})
      `;

      // Record tier reward
      await tx`
        INSERT INTO referral_tier_rewards (
          id, referrer_id, tier_index, tier_name, reward_cents,
          physical_reward, physical_reward_value_cents,
          direct_referrals_at_award, team_total_at_award,
          credited_at, transaction_id
        )
        VALUES (
          ${rewardId}, ${referrerId}, ${tierIndex}, ${tierName}, ${rewardCents},
          ${physicalReward ? physicalReward.item : null},
          ${physicalReward ? Math.round(physicalReward.estimatedValue * 100) : null},
          ${directCount}, ${teamTotal}, ${now}, ${transactionId}
        )
      `;
    });

    return {
      rewardId,
      tierId: tierIndex,
      tierName,
      amountCents: rewardCents,
      physicalReward: physicalReward || null,
    };
  } catch (error) {
    console.error('Failed to credit tier reward:', error);
    return null;
  }
}

// Check and credit tier rewards when new referral is created.
// Pays every tier reached that hasn't been paid yet, so no tier is skipped
// (e.g. team total jumping straight from Star 1 to Star 3 pays Star 2 and 3).
async function checkAndCreditTierReward(sql, referrerId) {
  // Get current direct referral count and team total
  const directCount = await getDirectReferralCount(sql, referrerId);
  const teamTotal = await getTeamTotal(sql, referrerId);

  // Calculate current tier (must meet BOTH direct referrals AND team total requirements)
  const currentTier = getTierByDirectReferrals(directCount, teamTotal);

  if (currentTier < 0) return null; // No tier yet

  // Get referrer account to verify they exist
  const referrer = await sql`SELECT id, email FROM accounts WHERE id = ${referrerId}`;
  if (referrer.length === 0) return null;

  // Tiers already credited
  const existing = await sql`
    SELECT tier_index FROM referral_tier_rewards WHERE referrer_id = ${referrerId}
  `;
  const paid = new Set(existing.map((r) => Number(r.tier_index)));

  let lastCredited = null;
  for (let tierIndex = 0; tierIndex <= currentTier; tierIndex++) {
    if (paid.has(tierIndex)) continue;
    const credited = await creditTierReward(sql, referrerId, tierIndex, directCount, teamTotal);
    if (credited) lastCredited = credited;
  }
  return lastCredited;
}

// Get tier progression for a referrer
async function getTierProgression(sql, referrerId) {
  const directCount = await getDirectReferralCount(sql, referrerId);
  const teamTotal = await getTeamTotal(sql, referrerId);

  // Calculate current tier (must meet BOTH direct referrals AND team total requirements)
  const currentTier = getTierByDirectReferrals(directCount, teamTotal);

  // Get earned tier rewards
  const earnedRewards = await sql`
    SELECT tier_index, tier_name, reward_cents, physical_reward,
      physical_reward_value_cents, credited_at
    FROM referral_tier_rewards
    WHERE referrer_id = ${referrerId}
    ORDER BY tier_index ASC
  `;

  // Calculate progress to next tier (must meet BOTH requirements)
  let nextTierDirect = null;
  let nextTierTeam = null;
  let currentTierDirect = null;
  let currentTierTeam = null;
  let directProgress = 0;
  let teamProgress = 0;

  if (currentTier >= 0) {
    currentTierDirect = TIER_REQUIREMENTS[currentTier].direct;
    currentTierTeam = TIER_REQUIREMENTS[currentTier].team;
    if (currentTier < 8) {
      nextTierDirect = TIER_REQUIREMENTS[currentTier + 1].direct;
      nextTierTeam = TIER_REQUIREMENTS[currentTier + 1].team;
      directProgress = Math.round((directCount / nextTierDirect) * 100);
      teamProgress = Math.round((teamTotal / nextTierTeam) * 100);
    }
  } else {
    nextTierDirect = TIER_REQUIREMENTS[0].direct;
    nextTierTeam = TIER_REQUIREMENTS[0].team;
    directProgress = Math.round((directCount / nextTierDirect) * 100);
    // Star 1 has no team requirement
    teamProgress = nextTierTeam > 0 ? Math.round((teamTotal / nextTierTeam) * 100) : 100;
  }

  return {
    directReferrals: directCount,
    teamTotal: teamTotal,
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
      current: {
        directThreshold: currentTierDirect,
        teamThreshold: currentTierTeam,
      },
      next: {
        directThreshold: nextTierDirect,
        teamThreshold: nextTierTeam,
      },
      progress: {
        directPercent: directProgress,
        teamPercent: teamProgress,
      },
      needsForNext: {
        direct: nextTierDirect ? Math.max(0, nextTierDirect - directCount) : 0,
        team: nextTierTeam ? Math.max(0, nextTierTeam - teamTotal) : 0,
      },
    },
  };
}

export {
  initializeTierRewardsTable,
  checkAndCreditTierReward,
  getTierProgression,
  getTierByDirectReferrals,
  getDirectReferralCount,
  getTeamTotal,
  TIER_NAMES,
  TIER_REQUIREMENTS,
  TIER_REWARDS,
  TIER_PHYSICAL_REWARDS,
  TEAM_GENERATIONS,
};
