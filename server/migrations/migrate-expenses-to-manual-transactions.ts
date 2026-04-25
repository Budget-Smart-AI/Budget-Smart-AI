/**
 * Migration script: Expenses to Manual Transactions
 *
 * This script migrates existing expenses from the legacy `expenses` table
 * to the new `manual_transactions` table (transaction-centric architecture).
 *
 * Migration rules:
 * 1. For each user with existing expenses, create a "Cash" manual account
 * 2. Convert each expense to a manual transaction on that account
 * 3. Skip expenses with "Imported from bank" in notes (already linked to Plaid)
 * 4. Original expenses table is preserved for rollback capability
 *
 * Run with: npx tsx server/migrations/migrate-expenses-to-manual-transactions.ts
 */

import { db } from "../db";
import { expenses, manualAccounts, manualTransactions } from "@shared/schema";
import { eq, sql } from "drizzle-orm";

interface MigrationResult {
  usersProcessed: number;
  accountsCreated: number;
  transactionsMigrated: number;
  transactionsSkipped: number;
  errors: string[];
}

async function migrateExpensesToManualTransactions(): Promise<MigrationResult> {
  const result: MigrationResult = {
    usersProcessed: 0,
    accountsCreated: 0,
    transactionsMigrated: 0,
    transactionsSkipped: 0,
    errors: [],
  };

  console.log("Starting expenses to manual transactions migration...\n");

  try {
    // Get all expenses grouped by user
    const allExpenses = await db.select().from(expenses);

    // Group expenses by userId
    const expensesByUser = new Map<string, typeof allExpenses>();
    for (const expense of allExpenses) {
      const userExpenses = expensesByUser.get(expense.userId) || [];
      userExpenses.push(expense);
      expensesByUser.set(expense.userId, userExpenses);
    }

    console.log(`Found ${expensesByUser.size} users with expenses to migrate\n`);

    // Process each user
    for (const [userId, userExpenses] of Array.from(expensesByUser.entries())) {
      try {
        console.log(`Processing user ${userId} with ${userExpenses.length} expenses...`);
        result.usersProcessed++;

        // Check if user already has a Cash manual account
        const existingAccounts = await db
          .select()
          .from(manualAccounts)
          .where(eq(manualAccounts.userId, userId));

        let cashAccount = existingAccounts.find(a => a.type === "cash");

        // Create Cash account if it doesn't exist
        if (!cashAccount) {
          const [newAccount] = await db.insert(manualAccounts).values({
            userId,
            name: "Cash",
            type: "cash",
            balance: "0",
            currency: "USD",
            isActive: "true",
            createdAt: new Date().toISOString(),
          }).returning();

          cashAccount = newAccount;
          result.accountsCreated++;
          console.log(`  Created Cash account for user ${userId}`);
        }

        // Migrate each expense
        for (const expense of userExpenses) {
          // Skip if already imported from bank (has special note)
          if (expense.notes?.includes("Imported from bank")) {
            result.transactionsSkipped++;
            continue;
          }

          // Check if this expense was already migrated (simple duplicate check)
          const existingTx = await db
            .select()
            .from(manualTransactions)
            .where(
              sql`${manualTransactions.userId} = ${userId}
                  AND ${manualTransactions.amount} = ${expense.amount}
                  AND ${manualTransactions.date} = ${expense.date}
                  AND ${manualTransactions.merchant} = ${expense.merchant}`
            );

          if (existingTx.length > 0) {
            result.transactionsSkipped++;
            continue;
          }

          // Create manual transaction
          await db.insert(manualTransactions).values({
            accountId: cashAccount.id,
            userId,
            amount: expense.amount,
            date: expense.date,
            merchant: expense.merchant,
            canonicalCategoryId: expense.canonicalCategoryId,
            notes: expense.notes ? `${expense.notes} [Migrated from expenses]` : "[Migrated from expenses]",
            isTransfer: "false",
            createdAt: new Date().toISOString(),
          });

          result.transactionsMigrated++;
        }

        console.log(`  Migrated ${userExpenses.length - result.transactionsSkipped} transactions`);

      } catch (userError) {
        const errorMsg = `Error processing user ${userId}: ${(userError as Error).message}`;
        result.errors.push(errorMsg);
        console.error(`  ${errorMsg}`);
      }
    }

  } catch (error) {
    const errorMsg = `Migration failed: ${(error as Error).message}`;
    result.errors.push(errorMsg);
    console.error(errorMsg);
  }

  return result;
}

// Run migration
async function main() {
  console.log("=".repeat(60));
  console.log("EXPENSE TO MANUAL TRANSACTION MIGRATION");
  console.log("=".repeat(60));
  console.log("");

  const result = await migrateExpensesToManualTransactions();

  console.log("\n" + "=".repeat(60));
  console.log("MIGRATION COMPLETE");
  console.log("=".repeat(60));
  console.log(`Users processed:       ${result.usersProcessed}`);
  console.log(`Accounts created:      ${result.accountsCreated}`);
  console.log(`Transactions migrated: ${result.transactionsMigrated}`);
  console.log(`Transactions skipped:  ${result.transactionsSkipped}`);

  if (result.errors.length > 0) {
    console.log(`\nErrors (${result.errors.length}):`);
    result.errors.forEach(e => console.log(`  - ${e}`));
  }

  console.log("\nNote: Original expenses table is preserved for rollback.");
  console.log("You can safely delete old expense pages if migration is successful.");

  process.exit(result.errors.length > 0 ? 1 : 0);
}

main().catch(console.error);
