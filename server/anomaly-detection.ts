/**
 * Anomaly Detection Module
 * Detects suspicious or unusual transactions:
 * - Large purchases (> 2 std dev from merchant/category mean)
 * - Duplicate charges (same amount + merchant within 7 days)
 * - Price increases (recurring merchant amount increased)
 * - New merchant large purchases (first transaction > $100)
 */

import { storage } from "./storage";
import type { PlaidTransaction, InsertTransactionAnomaly, TransactionAnomaly } from "@shared/schema";

interface AnomalyResult {
  transactionId: string;
  anomalyType: "large_purchase" | "duplicate_charge" | "price_increase" | "new_merchant" | "unusual_location" | "unusual_time";
  severity: "low" | "medium" | "high";
  description: string;
  amount: number;
  expectedAmount?: number;
  merchantName?: string;
}

/**
 * Calculate standard deviation
 */
function calculateStdDev(values: number[]): { mean: number; stdDev: number } {
  if (values.length === 0) return { mean: 0, stdDev: 0 };

  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const squaredDiffs = values.map(v => Math.pow(v - mean, 2));
  const avgSquaredDiff = squaredDiffs.reduce((a, b) => a + b, 0) / values.length;
  const stdDev = Math.sqrt(avgSquaredDiff);

  return { mean, stdDev };
}

/**
 * Detect large purchases (> 2 standard deviations from category/merchant average)
 */
function detectLargePurchases(
  newTransactions: PlaidTransaction[],
  historicalTransactions: PlaidTransaction[]
): AnomalyResult[] {
  const anomalies: AnomalyResult[] = [];

  // Group historical transactions by merchant
  const merchantAmounts: Record<string, number[]> = {};
  for (const tx of historicalTransactions) {
    const merchant = tx.merchantName || tx.name || "Unknown";
    if (!merchantAmounts[merchant]) merchantAmounts[merchant] = [];
    merchantAmounts[merchant].push(Math.abs(parseFloat(tx.amount)));
  }

  // Group by category too
  const categoryAmounts: Record<string, number[]> = {};
  for (const tx of historicalTransactions) {
    const category = tx.category || "Other";
    if (!categoryAmounts[category]) categoryAmounts[category] = [];
    categoryAmounts[category].push(Math.abs(parseFloat(tx.amount)));
  }

  for (const tx of newTransactions) {
    const amount = Math.abs(parseFloat(tx.amount));
    if (amount <= 0) continue; // Skip income

    const merchant = tx.merchantName || tx.name || "Unknown";
    const category = tx.category || "Other";

    // Check against merchant history first
    if (merchantAmounts[merchant] && merchantAmounts[merchant].length >= 3) {
      const { mean, stdDev } = calculateStdDev(merchantAmounts[merchant]);
      if (stdDev > 0 && amount > mean + (2 * stdDev)) {
        const severity = amount > mean + (3 * stdDev) ? "high" : "medium";
        anomalies.push({
          transactionId: tx.id,
          anomalyType: "large_purchase",
          severity,
          description: `$${amount.toFixed(2)} at ${merchant} is unusually high (avg: $${mean.toFixed(2)})`,
          amount,
          expectedAmount: mean,
          merchantName: merchant,
        });
        continue;
      }
    }

    // Check against category if no merchant history
    if (categoryAmounts[category] && categoryAmounts[category].length >= 5) {
      const { mean, stdDev } = calculateStdDev(categoryAmounts[category]);
      if (stdDev > 0 && amount > mean + (2 * stdDev) && amount > 100) {
        anomalies.push({
          transactionId: tx.id,
          anomalyType: "large_purchase",
          severity: "medium",
          description: `$${amount.toFixed(2)} in ${category} is higher than usual (avg: $${mean.toFixed(2)})`,
          amount,
          expectedAmount: mean,
          merchantName: merchant,
        });
      }
    }
  }

  return anomalies;
}

/**
 * Detect duplicate charges (same amount and merchant within 7 days)
 */
function detectDuplicateCharges(
  newTransactions: PlaidTransaction[],
  historicalTransactions: PlaidTransaction[]
): AnomalyResult[] {
  const anomalies: AnomalyResult[] = [];
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const sevenDaysAgoStr = sevenDaysAgo.toISOString().split('T')[0];

  // Get recent transactions for comparison
  const recentTransactions = historicalTransactions.filter(tx => tx.date >= sevenDaysAgoStr);

  for (const newTx of newTransactions) {
    const amount = parseFloat(newTx.amount);
    if (amount <= 0) continue;

    const merchant = newTx.merchantName || newTx.name || "Unknown";

    // Look for matching transactions
    const matches = recentTransactions.filter(tx => {
      const txAmount = parseFloat(tx.amount);
      const txMerchant = tx.merchantName || tx.name || "Unknown";
      return (
        tx.id !== newTx.id &&
        Math.abs(txAmount - amount) < 0.01 && // Same amount (within penny)
        txMerchant.toLowerCase() === merchant.toLowerCase()
      );
    });

    if (matches.length > 0) {
      anomalies.push({
        transactionId: newTx.id,
        anomalyType: "duplicate_charge",
        severity: "high",
        description: `Possible duplicate: $${amount.toFixed(2)} at ${merchant} (${matches.length + 1} similar charges in 7 days)`,
        amount,
        merchantName: merchant,
      });
    }
  }

  return anomalies;
}

/**
 * Detect price increases on recurring merchants
 */
function detectPriceIncreases(
  newTransactions: PlaidTransaction[],
  historicalTransactions: PlaidTransaction[]
): AnomalyResult[] {
  const anomalies: AnomalyResult[] = [];

  // Group historical by merchant to find recurring patterns
  const merchantHistory: Record<string, number[]> = {};
  for (const tx of historicalTransactions) {
    const merchant = tx.merchantName || tx.name || "Unknown";
    const amount = Math.abs(parseFloat(tx.amount));
    if (amount <= 0) continue;
    if (!merchantHistory[merchant]) merchantHistory[merchant] = [];
    merchantHistory[merchant].push(amount);
  }

  for (const tx of newTransactions) {
    const amount = Math.abs(parseFloat(tx.amount));
    if (amount <= 0) continue;

    const merchant = tx.merchantName || tx.name || "Unknown";
    const history = merchantHistory[merchant];

    // Only check if there's recurring history (at least 2 previous charges)
    if (!history || history.length < 2) continue;

    // Check if all previous amounts were consistent (subscription-like)
    const { mean, stdDev } = calculateStdDev(history);
    const isConsistent = stdDev / mean < 0.05; // Less than 5% variation

    if (isConsistent && amount > mean * 1.05) { // 5%+ increase
      const percentIncrease = ((amount - mean) / mean * 100).toFixed(0);
      anomalies.push({
        transactionId: tx.id,
        anomalyType: "price_increase",
        severity: "medium",
        description: `${merchant} increased from $${mean.toFixed(2)} to $${amount.toFixed(2)} (+${percentIncrease}%)`,
        amount,
        expectedAmount: mean,
        merchantName: merchant,
      });
    }
  }

  return anomalies;
}

/**
 * Detect new merchant large purchases (first transaction > $100)
 */
function detectNewMerchantLargePurchases(
  newTransactions: PlaidTransaction[],
  historicalTransactions: PlaidTransaction[]
): AnomalyResult[] {
  const anomalies: AnomalyResult[] = [];

  // Build set of known merchants
  const knownMerchants = new Set<string>();
  for (const tx of historicalTransactions) {
    const merchant = (tx.merchantName || tx.name || "").toLowerCase().trim();
    if (merchant) knownMerchants.add(merchant);
  }

  for (const tx of newTransactions) {
    const amount = Math.abs(parseFloat(tx.amount));
    const merchant = tx.merchantName || tx.name || "Unknown";
    const merchantKey = merchant.toLowerCase().trim();

    // Check if new merchant with large purchase
    if (!knownMerchants.has(merchantKey) && amount > 100) {
      anomalies.push({
        transactionId: tx.id,
        anomalyType: "new_merchant",
        severity: "low",
        description: `First purchase at ${merchant}: $${amount.toFixed(2)}`,
        amount,
        merchantName: merchant,
      });
    }
  }

  return anomalies;
}

/**
 * Run anomaly detection on new transactions
 */
export async function detectAnomalies(
  userId: string,
  newTransactions: PlaidTransaction[],
  accountIds: string[]
): Promise<TransactionAnomaly[]> {
  if (newTransactions.length === 0 || accountIds.length === 0) {
    return [];
  }

  // Get historical transactions (last 90 days)
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

  const historicalTransactions = await storage.getPlaidTransactions(accountIds, {
    startDate: ninetyDaysAgo.toISOString().split('T')[0],
  });

  // Run all detection algorithms
  const allAnomalies: AnomalyResult[] = [
    ...detectLargePurchases(newTransactions, historicalTransactions),
    ...detectDuplicateCharges(newTransactions, historicalTransactions),
    ...detectPriceIncreases(newTransactions, historicalTransactions),
    ...detectNewMerchantLargePurchases(newTransactions, historicalTransactions),
  ];

  // Deduplicate by transaction ID (keep highest severity)
  const byTransaction = new Map<string, AnomalyResult>();
  const severityOrder = { high: 3, medium: 2, low: 1 };

  for (const anomaly of allAnomalies) {
    const existing = byTransaction.get(anomaly.transactionId);
    if (!existing || severityOrder[anomaly.severity] > severityOrder[existing.severity]) {
      byTransaction.set(anomaly.transactionId, anomaly);
    }
  }

  // Save anomalies to database
  const savedAnomalies: TransactionAnomaly[] = [];

  for (const anomaly of Array.from(byTransaction.values())) {
    // Check if already exists
    const existing = await storage.getTransactionAnomalyByTransactionId(anomaly.transactionId);
    if (existing) continue;

    const insertData: InsertTransactionAnomaly = {
      userId,
      transactionId: anomaly.transactionId,
      anomalyType: anomaly.anomalyType,
      severity: anomaly.severity,
      description: anomaly.description,
      amount: String(anomaly.amount),
      expectedAmount: anomaly.expectedAmount ? String(anomaly.expectedAmount) : null,
      merchantName: anomaly.merchantName,
    };

    const saved = await storage.createTransactionAnomaly(insertData);
    savedAnomalies.push(saved);

    // Create a notification for high severity anomalies (deduplicated within 24 hours)
    if (anomaly.severity === "high") {
      try {
        const { pool } = await import("./db");
        const { rows: existing } = await pool.query(
          `SELECT id FROM notifications
           WHERE user_id = $1
             AND type = 'anomaly_detected'
             AND message = $2
             AND created_at >= NOW() - INTERVAL '24 hours'
           LIMIT 1`,
          [userId, anomaly.description]
        );
        if (existing.length === 0) {
          await storage.createNotification({
            userId,
            type: "anomaly_detected",
            title: "Unusual Transaction Detected",
            message: anomaly.description,
            isRead: "false",
          });
        }
      } catch (err) {
        console.error("Failed to create anomaly notification:", err);
      }
    }
  }

  return savedAnomalies;
}

/**
 * Run anomaly detection after a Plaid sync
 * Call this from the Plaid sync flow
 */
export async function runAnomalyDetectionAfterSync(
  userId: string,
  newTransactionIds: string[],
  accountIds: string[]
): Promise<void> {
  if (newTransactionIds.length === 0) return;

  try {
    // Get the new transactions
    const allTransactions = await storage.getPlaidTransactions(accountIds);
    const newTransactions = allTransactions.filter(tx =>
      newTransactionIds.includes(tx.transactionId || tx.id)
    );

    if (newTransactions.length > 0) {
      const anomalies = await detectAnomalies(userId, newTransactions, accountIds);
      if (anomalies.length > 0) {
        console.log(`Detected ${anomalies.length} anomalies for user ${userId}`);
      }
    }
  } catch (error) {
    console.error("Error running anomaly detection:", error);
  }
}
