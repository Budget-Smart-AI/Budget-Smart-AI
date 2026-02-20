/**
 * Migration script: Recurring Expenses to Bills
 *
 * This script migrates existing recurring_expenses data to the bills table
 * as bills with category "Subscriptions".
 *
 * Migration rules:
 * 1. Each recurring expense becomes a bill with category "Subscriptions"
 * 2. The isActive field maps to isPaused (inverted)
 * 3. nextDueDate is used to calculate dueDay
 * 4. Original recurring_expenses table is preserved for rollback
 *
 * Run with: npx tsx server/migrations/migrate-recurring-expenses-to-bills.ts
 */

import { db } from "../db";
import { bills, recurringExpenses } from "@shared/schema";
import { sql, eq } from "drizzle-orm";
import { parseISO } from "date-fns";

interface MigrationResult {
  subscriptionsMigrated: number;
  skipped: number;
  errors: string[];
}

async function migrateRecurringExpensesToBills(): Promise<MigrationResult> {
  const result: MigrationResult = {
    subscriptionsMigrated: 0,
    skipped: 0,
    errors: [],
  };

  console.log("Starting recurring expenses to bills migration...\n");

  try {
    // Get all recurring expenses
    const allRecurringExpenses = await db.select().from(recurringExpenses);

    console.log(`Found ${allRecurringExpenses.length} recurring expenses to migrate\n`);

    for (const expense of allRecurringExpenses) {
      try {
        // Calculate dueDay from nextDueDate or startDate
        let dueDay = 1;
        if (expense.nextDueDate) {
          dueDay = parseISO(expense.nextDueDate).getDate();
        } else if (expense.startDate) {
          dueDay = parseISO(expense.startDate).getDate();
        }

        // Check if a bill with the same name already exists for this user
        const existingBill = await db
          .select()
          .from(bills)
          .where(
            sql`${bills.userId} = ${expense.userId} AND ${bills.name} = ${expense.name}`
          );

        if (existingBill.length > 0) {
          console.log(`  Skipping "${expense.name}" - bill already exists`);
          result.skipped++;
          continue;
        }

        // Create bill from recurring expense
        await db.insert(bills).values({
          userId: expense.userId,
          name: expense.name,
          amount: expense.amount,
          category: "Subscriptions", // All recurring expenses become subscriptions
          dueDay: dueDay,
          recurrence: expense.recurrence || "monthly",
          notes: expense.notes ? `${expense.notes} [Migrated from recurring expenses]` : "[Migrated from recurring expenses]",
          isPaused: expense.isActive === "true" ? "false" : "true", // Invert isActive to isPaused
          merchant: expense.merchant || null,
          startDate: expense.startDate || null,
        });

        result.subscriptionsMigrated++;
        console.log(`  Migrated: ${expense.name}`);

      } catch (expenseError) {
        const errorMsg = `Error migrating "${expense.name}": ${(expenseError as Error).message}`;
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
  console.log("RECURRING EXPENSES TO BILLS MIGRATION");
  console.log("=".repeat(60));
  console.log("");

  const result = await migrateRecurringExpensesToBills();

  console.log("\n" + "=".repeat(60));
  console.log("MIGRATION COMPLETE");
  console.log("=".repeat(60));
  console.log(`Subscriptions migrated: ${result.subscriptionsMigrated}`);
  console.log(`Skipped (already exist): ${result.skipped}`);

  if (result.errors.length > 0) {
    console.log(`\nErrors (${result.errors.length}):`);
    result.errors.forEach(e => console.log(`  - ${e}`));
  }

  console.log("\nNote: Original recurring_expenses table is preserved for rollback.");
  console.log("Subscriptions now appear in both Bills and Subscriptions pages.");

  process.exit(result.errors.length > 0 ? 1 : 0);
}

main().catch(console.error);
