/**
 * Referral Tier Rewards Enhancement v2
 * FRONTEND-ONLY wrapper for backend tier system
 * 
 * This module mirrors the backend structure but calls API endpoints
 * instead of accessing the database directly. Safe to import in React/browser code.
 * 
 * WARNING: Do NOT import backend functions (with 'db' parameter) from this module.
 */

// Tier names (matches backend)
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

// Direct referrals required to reach each tier (matches backend exactly)
const TIER_REQUIREMENTS = [1, 3, 6, 10, 15, 25, 40, 60, 100];

// Tier reward amounts in cents (matches backend)
const TIER_REWARDS = {
  0: 8000,      // Star 1: $80
  1: 15000,     // Star 2: $150
  2: 25000,     // Star 3: $250
  3: 40000,     // Star 4: $400
  4: 70000,     // Star 5: $700
  5: 100000,    // Star 6: $1,000
  6: 250000,    // Star 7: $2,500 (+ house)
  7: 450000,    // Star 8: $4,500 (+ car)
  8: 700000,    // Crown Leader: $7,000 (+ car)
};

// Physical rewards by tier
const TIER_PHYSICAL_REWARDS = {
  6: { item: 'House', estimatedValue: 80000 },
  7: { item: 'Mazda CX-5', estimatedValue: 27000 },
  8: { item: 'Mercedes-Benz E300', estimatedValue: 46000 },
};

/**
 * Initialize tier rewards tracking in localStorage
 * (Frontend only - backend keeps the real records in DB)
 */
function initializeTierRewardsTable() {
  const key = 'ascend_tier_rewards_cache';
  if (!localStorage.getItem(key)) {
    localStorage.setItem(key, JSON.stringify({}));
  }
  return JSON.parse(localStorage.getItem(key) || '{}');
}

/**
 * Get direct referral count
 * Calls backend API
 * 
 * @param {string} db - Unused (kept for API compatibility with backend imports)
 * @param {string} referrerId - User ID (optional, uses logged-in user if not provided)
 * @returns {Promise<number>}
 */
async function getDirectReferralCount(db, referrerId) {
  try {
    const response = await fetch('/api/referrals/stats', {
      credentials: 'same-origin',
    });
    
    if (!response.ok) {
      console.error('[Tier] Failed to fetch direct count:', response.status);
      return 0;
    }

    const data = await response.json();
    return data.directReferrals || 0;
  } catch (err) {
    console.error('[Tier] Error fetching direct count:', err);
    return 0;
  }
}

/**
 * Get total team count (direct + all indirect referrals)
 * Calls backend API
 * 
 * @param {string} db - Unused (kept for API compatibility with backend imports)
 * @param {string} referrerId - User ID (optional, uses logged-in user if not provided)
 * @returns {Promise<number>}
 */
async function getTeamTotal(db, referrerId) {
  try {
    const response = await fetch('/api/referrals/stats', {
      credentials: 'same-origin',
    });
    
    if (!response.ok) {
      console.error('[Tier] Failed to fetch team total:', response.status);
      return 0;
    }

    const data = await response.json();
    return data.teamTotal || 0;
  } catch (err) {
    console.error('[Tier] Error fetching team total:', err);
    return 0;
  }
}

/**
 * Get tier by direct referral count
 * Pure function - no API call
 * 
 * @param {number} directCount - Number of direct referrals
 * @returns {number} - Tier index (0-8) or -1 if no tier
 */
function getTierByDirectReferrals(directCount) {
  for (let i = TIER_REQUIREMENTS.length - 1; i >= 0; i--) {
    if (directCount >= TIER_REQUIREMENTS[i]) {
      return i;
    }
  }
  return -1; // No tier yet
}

/**
 * Check and credit tier rewards
 * This is primarily handled by the backend.
 * Frontend tracks in localStorage to avoid showing duplicate rewards.
 * 
 * @param {string} db - Unused (kept for API compatibility with backend imports)
 * @param {string} referrerId - User ID (optional, uses logged-in user if not provided)
 * @returns {object|null} - Tier reward info or null
 */
async function checkAndCreditTierReward(db, referrerId) {
  // Fetch current stats from backend
  const directCount = await getDirectReferralCount(db, referrerId);
  const teamTotal = await getTeamTotal(db, referrerId);

  // Calculate tier based on direct referrals
  const currentTier = getTierByDirectReferrals(directCount);
  
  if (currentTier < 0) return null; // No tier yet

  // Check if already noted in local cache
  const cache = initializeTierRewardsTable();
  const cacheKey = `tier_${currentTier}`;
  
  if (cache[cacheKey]) {
    return null; // Already tracked locally
  }

  // New tier reached - cache it locally
  const tierName = TIER_NAMES[currentTier];
  const rewardCents = TIER_REWARDS[currentTier];
  const physicalReward = TIER_PHYSICAL_REWARDS[currentTier];

  cache[cacheKey] = {
    tierId: currentTier,
    tierName,
    rewardCents,
    directCount,
    teamTotal,
    creditedAt: new Date().toISOString(),
  };
  localStorage.setItem('ascend_tier_rewards_cache', JSON.stringify(cache));

  return {
    tierId: currentTier,
    tierName,
    amountCents: rewardCents,
    physicalReward: physicalReward || null,
  };
}

/**
 * Get tier progression for a user
 * Calls backend API for fresh data
 * 
 * @param {string} db - Unused (kept for API compatibility with backend imports)
 * @param {string} referrerId - User ID (optional, uses logged-in user if not provided)
 * @returns {Promise<object>}
 */
async function getTierProgression(db, referrerId) {
  try {
    const response = await fetch('/api/referrals/stats', {
      credentials: 'same-origin',
    });
    
    if (!response.ok) {
      return {
        directReferrals: 0,
        teamTotal: 0,
        currentTierIndex: -1,
        currentTierName: null,
        earnedRewards: [],
        progression: {
          currentThreshold: null,
          nextThreshold: TIER_REQUIREMENTS[0],
          progressPercent: 0,
          needsForNext: TIER_REQUIREMENTS[0],
        },
      };
    }

    const statsData = await response.json();
    const directCount = statsData.directReferrals || 0;
    const teamTotal = statsData.teamTotal || 0;

    // Calculate current tier
    const currentTierIndex = getTierByDirectReferrals(directCount);
    const currentTierName = currentTierIndex >= 0 ? TIER_NAMES[currentTierIndex] : null;

    // Get earned rewards from cache
    const cache = initializeTierRewardsTable();
    const earnedRewards = Object.entries(cache).map(([_, reward]) => ({
      tierIndex: reward.tierId,
      tierName: reward.tierName,
      amountUSD: reward.rewardCents / 100,
      physicalReward: TIER_PHYSICAL_REWARDS[reward.tierId]?.item || null,
      physicalRewardValue: TIER_PHYSICAL_REWARDS[reward.tierId]?.estimatedValue || null,
      creditedAt: reward.creditedAt,
    }));

    // Calculate progression
    let currentThreshold = null;
    let nextThreshold = null;
    let progressPercent = 0;
    let needsForNext = 0;

    if (currentTierIndex >= 0) {
      currentThreshold = TIER_REQUIREMENTS[currentTierIndex];
      
      if (currentTierIndex < 8) {
        nextThreshold = TIER_REQUIREMENTS[currentTierIndex + 1];
        progressPercent = Math.round((directCount / nextThreshold) * 100);
        needsForNext = Math.max(0, nextThreshold - directCount);
      }
    } else {
      nextThreshold = TIER_REQUIREMENTS[0];
      needsForNext = TIER_REQUIREMENTS[0];
    }

    return {
      directReferrals: directCount,
      teamTotal: teamTotal,
      currentTierIndex: currentTierIndex,
      currentTierName: currentTierName,
      earnedRewards: earnedRewards,
      progression: {
        currentThreshold,
        nextThreshold,
        progressPercent,
        needsForNext,
      },
    };
  } catch (err) {
    console.error('[Tier] Error fetching progression:', err);
    return {
      directReferrals: 0,
      teamTotal: 0,
      currentTierIndex: -1,
      currentTierName: null,
      earnedRewards: [],
      progression: {
        currentThreshold: null,
        nextThreshold: TIER_REQUIREMENTS[0],
        progressPercent: 0,
        needsForNext: TIER_REQUIREMENTS[0],
      },
    };
  }
}

// ============================================================================
// EXPORTS - Keep same interface as backend for code compatibility
// ============================================================================

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
};

export default {
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
};
