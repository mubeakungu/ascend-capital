import postgres from 'postgres';
import { randomBytes } from 'node:crypto';

// Config
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

function getDailyProfitForDeposit(depositCents) {
  const depositAmount = depositCents / 100;
  for (let i = DEPOSIT_PLANS.length - 1; i >= 0; i--) {
    if (depositAmount >= DEPOSIT_PLANS[i].deposit) {
      return DEPOSIT_PLANS[i].dailyProfit;
    }
  }
  return 0;
}

async function backfillTrades() {
  const sql = postgres(process.env.DATABASE_URL);

  console.log('🔄 Starting trade backfill...\n');

  try {
    // Get all accounts with approved deposits
    const accounts = await sql`
      SELECT DISTINCT a.id, a.name, a.created_at
      FROM accounts a
      WHERE a.role = 'member' AND a.status = 'active'
        AND EXISTS (
          SELECT 1 FROM transactions
          WHERE account_id = a.id AND type = 'deposit' AND status = 'approved'
        )
      ORDER BY a.created_at
    `;

    console.log(`✅ Found ${accounts.length} accounts with deposits\n`);

    let totalAdded = 0;
    let accountsProcessed = 0;

    for (const account of accounts) {
      accountsProcessed++;
      const accountCreatedDate = new Date(account.created_at).toISOString().split('T')[0];
      const today = new Date().toISOString().split('T')[0];

      // Get approved deposits for this account
      const deposits = await sql`
        SELECT id, amount_cents
        FROM transactions
        WHERE account_id = ${account.id} AND type = 'deposit' AND status = 'approved'
        ORDER BY created_at
        LIMIT 1
      `;

      if (deposits.length === 0) {
        console.log(`⚠️  [${accountsProcessed}/${accounts.length}] ${account.name}: No approved deposits found`);
        continue;
      }

      const deposit = deposits[0];
      const dailyProfit = getDailyProfitForDeposit(deposit.amount_cents);

      if (dailyProfit <= 0) {
        console.log(`⚠️  [${accountsProcessed}/${accounts.length}] ${account.name}: No profit for deposit amount`);
        continue;
      }

      // Generate date range from day after creation to today
      const startDate = new Date(accountCreatedDate);
      startDate.setDate(startDate.getDate() + 1); // Start from next day

      const endDate = new Date(today);
      let addedForAccount = 0;

      // Get existing trades for this account
      const existingTrades = await sql`
        SELECT profit_date FROM trading_ledger
        WHERE account_id = ${account.id}
      `;
      const existingDates = new Set(existingTrades.map(t => t.profit_date));

      // Add missing trades
      for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
        const tradeDate = d.toISOString().split('T')[0];

        if (existingDates.has(tradeDate)) {
          continue; // Already has this trade
        }

        const profitCents = Math.round(dailyProfit * 100);
        const ledgerId = randomBytes(16).toString('hex');
        const txId = randomBytes(16).toString('hex');
        const now = new Date().toISOString();

        try {
          // Insert into trading_ledger
          await sql`
            INSERT INTO trading_ledger (id, account_id, deposit_transaction_id, profit_cents, profit_date, created_at)
            VALUES (${ledgerId}, ${account.id}, ${deposit.id}, ${profitCents}, ${tradeDate}, ${now})
          `;

          // Insert into transactions
          await sql`
            INSERT INTO transactions (id, account_id, type, amount_cents, reference, status, created_at)
            VALUES (${txId}, ${account.id}, 'trading_profit', ${profitCents}, ${'Backfill: ' + tradeDate}, 'approved', ${now})
          `;

          addedForAccount++;
          totalAdded++;
        } catch (error) {
          console.error(`  ❌ Error adding trade for ${account.name} on ${tradeDate}:`, error.message);
        }
      }

      console.log(`✅ [${accountsProcessed}/${accounts.length}] ${account.name}: Added ${addedForAccount} trades`);
    }

    console.log(`\n🎉 Complete! Added ${totalAdded} total trades across ${accountsProcessed} accounts`);

  } catch (error) {
    console.error('❌ Backfill failed:', error);
  } finally {
    await sql.end();
  }
}

backfillTrades();
