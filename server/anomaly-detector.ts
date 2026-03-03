/**
 * AI-powered Anomaly Detector
 * Uses routeAI() (anomaly_detection slot) to analyse recent transactions
 * and writes results to the anomaly_alerts table.
 */

import { db } from './db';
import { routeAI } from './ai-router';
import { storage } from './storage';

export interface AnomalyAlert {
  id: string;
  userId: string;
  transactionId: string | null;
  anomalyType: string;
  severity: 'low' | 'medium' | 'high';
  title: string;
  description: string;
  suggestedAction: string | null;
  isDismissed: boolean;
  isResolved: boolean;
  aiConfidence: number | null;
  detectedAt: string;
  dismissedAt: string | null;
  metadata: Record<string, unknown> | null;
}

/** Return unresolved (and optionally undismissed) anomaly alerts for a user. */
export async function getAnomalyAlerts(
  userId: string,
  options: { includeDismissed?: boolean } = {},
): Promise<AnomalyAlert[]> {
  try {
    const { rows } = await (db as any).$client.query(
      `SELECT id, user_id, transaction_id, anomaly_type, severity,
              title, description, suggested_action,
              is_dismissed, is_resolved, ai_confidence,
              detected_at, dismissed_at, metadata
       FROM anomaly_alerts
       WHERE user_id = $1
         AND is_resolved = false
         ${options.includeDismissed ? '' : 'AND is_dismissed = false'}
       ORDER BY detected_at DESC
       LIMIT 200`,
      [userId],
    );
    return rows.map(mapRow);
  } catch {
    return [];
  }
}

/** Dismiss an alert (still visible to admin, hidden from user). */
export async function dismissAlert(id: string, userId: string): Promise<AnomalyAlert | null> {
  try {
    const { rows } = await (db as any).$client.query(
      `UPDATE anomaly_alerts
       SET is_dismissed = true, dismissed_at = NOW()
       WHERE id = $1 AND user_id = $2
       RETURNING *`,
      [id, userId],
    );
    return rows[0] ? mapRow(rows[0]) : null;
  } catch {
    return null;
  }
}

/** Mark an alert as resolved (fully closed). */
export async function resolveAlert(id: string, userId: string): Promise<AnomalyAlert | null> {
  try {
    const { rows } = await (db as any).$client.query(
      `UPDATE anomaly_alerts
       SET is_resolved = true
       WHERE id = $1 AND user_id = $2
       RETURNING *`,
      [id, userId],
    );
    return rows[0] ? mapRow(rows[0]) : null;
  } catch {
    return null;
  }
}

/**
 * Run AI-powered anomaly detection for a user.
 * Analyses the last 90 days of transactions and persists new alerts.
 */
export async function detectAnomalies(userId: string): Promise<AnomalyAlert[]> {
  // Gather recent transactions for the user
  const plaidItems = await storage.getPlaidItems(userId);
  if (plaidItems.length === 0) return [];

  const allAccounts = (
    await Promise.all(plaidItems.map(item => storage.getPlaidAccounts(item.id)))
  ).flat();
  const accountIds = allAccounts.map(a => a.id);
  if (accountIds.length === 0) return [];

  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

  const transactions = await storage.getPlaidTransactions(accountIds, {
    startDate: ninetyDaysAgo.toISOString().split('T')[0],
  });

  if (transactions.length === 0) return [];

  // Build a compact summary for the AI (limit tokens)
  const txSummary = transactions.slice(0, 400).map(t => ({
    id: t.id,
    date: t.date,
    merchant: t.merchantName || t.name,
    amount: parseFloat(t.amount),
    category: t.category,
  }));

  let aiAlerts: Array<{
    transactionId?: string;
    anomalyType: string;
    severity: 'low' | 'medium' | 'high';
    title: string;
    description: string;
    suggestedAction?: string;
    confidence: number;
  }> = [];

  try {
    const result = await routeAI({
      taskSlot: 'anomaly_detection',
      userId,
      featureContext: 'anomaly_detection',
      jsonMode: true,
      maxTokens: 2000,
      temperature: 0.2,
      messages: [
        {
          role: 'system',
          content:
            'You are a financial fraud and anomaly detection AI. ' +
            'Analyse bank transactions and identify suspicious patterns. ' +
            'Return ONLY valid JSON with no markdown.',
        },
        {
          role: 'user',
          content:
            `Analyse these ${txSummary.length} transactions and identify up to 10 anomalies.\n\n` +
            `Transactions:\n${JSON.stringify(txSummary)}\n\n` +
            `Look for: duplicate charges, unusual spikes, price increases on subscriptions, ` +
            `large first-time purchases, multiple charges same-day same-merchant.\n\n` +
            `Return JSON: { "anomalies": [ { "transactionId": "...", "anomalyType": "duplicate_charge|large_purchase|price_increase|new_merchant|unusual_spike", "severity": "low|medium|high", "title": "Short title", "description": "1-2 sentence description", "suggestedAction": "What to do", "confidence": 0.0-1.0 } ] }`,
        },
      ],
    });

    const parsed = JSON.parse(result.content || '{}');
    aiAlerts = Array.isArray(parsed.anomalies) ? parsed.anomalies : [];
  } catch (err) {
    console.error('[AnomalyDetector] AI call failed:', err);
    return [];
  }

  // Persist new alerts (skip duplicates by transaction_id + anomaly_type)
  const saved: AnomalyAlert[] = [];
  for (const alert of aiAlerts) {
    if (!alert.title || !alert.description) continue;
    try {
      const { rows } = await (db as any).$client.query(
        `INSERT INTO anomaly_alerts
           (user_id, transaction_id, anomaly_type, severity,
            title, description, suggested_action, ai_confidence)
         SELECT $1,$2,$3,$4,$5,$6,$7,$8
         WHERE NOT EXISTS (
           SELECT 1 FROM anomaly_alerts
           WHERE user_id = $1
             AND transaction_id IS NOT DISTINCT FROM $2
             AND anomaly_type = $3
             AND is_resolved = false
         )
         RETURNING *`,
        [
          userId,
          alert.transactionId ?? null,
          alert.anomalyType ?? 'unknown',
          alert.severity ?? 'medium',
          alert.title,
          alert.description,
          alert.suggestedAction ?? null,
          alert.confidence ?? null,
        ],
      );
      if (rows[0]) {
        saved.push(mapRow(rows[0]));
        // Notify on high-severity
        if (alert.severity === 'high') {
          try {
            await storage.createNotification({
              userId,
              type: 'anomaly_detected',
              title: alert.title,
              message: alert.description,
              isRead: 'false',
            });
          } catch { /* non-fatal */ }
        }
      }
    } catch (err) {
      console.error('[AnomalyDetector] Failed to save alert:', err);
    }
  }
  return saved;
}

function mapRow(row: Record<string, unknown>): AnomalyAlert {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    transactionId: (row.transaction_id as string) ?? null,
    anomalyType: row.anomaly_type as string,
    severity: row.severity as 'low' | 'medium' | 'high',
    title: row.title as string,
    description: row.description as string,
    suggestedAction: (row.suggested_action as string) ?? null,
    isDismissed: row.is_dismissed as boolean,
    isResolved: row.is_resolved as boolean,
    aiConfidence: row.ai_confidence != null ? Number(row.ai_confidence) : null,
    detectedAt: String(row.detected_at),
    dismissedAt: row.dismissed_at ? String(row.dismissed_at) : null,
    metadata: row.metadata ? (row.metadata as Record<string, unknown>) : null,
  };
}
