/**
 * Bank-Link Security — provider-agnostic intent issuance and validation.
 *
 * PROBLEM
 * -------
 * The Plaid / MX (and any future bank aggregator) connection flows have a
 * common cross-user-token-leak hazard: a credential generated in one user's
 * session (Plaid public_token, MX member_guid) can end up exchanged on the
 * server while a DIFFERENT user is now logged in. Without a server-side
 * binding between the link initiation and the link completion, the server
 * cannot detect this — it just sees an authenticated request with a valid-
 * looking token, and writes the bank data into the wrong user's account.
 *
 * FIX
 * ---
 * Every "connect bank" flow goes through this module. At link initiation we
 * issue a single-use, short-lived BankLinkIntent that is tied to the current
 * session user and provider. The intent_id is returned to the client and must
 * be presented back to the server on the completion endpoint. The completion
 * endpoint atomically transitions the intent from 'open' → 'consumed' and
 * verifies the current session user matches the intent's user_id BEFORE
 * exchanging the token / saving the member.
 *
 * This is provider-agnostic: Plaid, MX, and any new aggregator we add use the
 * exact same issue + consume API. Provider-specific data goes in `metadata`.
 *
 * DEFENSE IN DEPTH
 * ----------------
 * This is one layer. The complete defense also requires:
 *   • client never persists provider tokens (no localStorage / sessionStorage)
 *   • logout aggressively clears React Query cache + in-memory state
 *   • Plaid link_token already carries client_user_id (server-side binding
 *     at Plaid's end)
 *
 * No single layer is sufficient. Together they make the cross-user leak
 * effectively impossible.
 */

import { pool } from "../db";
import crypto from "crypto";

export type BankLinkProvider = "plaid" | "mx";

export interface BankLinkIntent {
  id: string;
  userId: string;
  provider: BankLinkProvider;
  status: "open" | "consumed" | "expired";
  createdAt: string;
  expiresAt: string;
  consumedAt: string | null;
  metadata: Record<string, unknown> | null;
}

const DEFAULT_TTL_MINUTES = 15;

/**
 * Issue a new BankLinkIntent for the given user + provider. Call this at the
 * start of every connect-bank flow, BEFORE creating a Plaid link_token / MX
 * connect-widget URL. The returned `id` is what the client must present back
 * to the server on the completion endpoint.
 *
 * @param userId   The session-authenticated user initiating the link
 * @param provider 'plaid' | 'mx' | future aggregator
 * @param metadata Optional provider-specific bookkeeping (e.g., institution id)
 * @param ttlMinutes Optional override (defaults to 15 minutes)
 */
export async function issueBankLinkIntent(
  userId: string,
  provider: BankLinkProvider,
  metadata?: Record<string, unknown>,
  ttlMinutes: number = DEFAULT_TTL_MINUTES
): Promise<{ intentId: string; expiresAt: Date }> {
  const id = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000);

  await pool.query(
    `INSERT INTO bank_link_intents
       (id, user_id, provider, status, expires_at, metadata)
     VALUES ($1, $2, $3, 'open', $4, $5)`,
    [id, userId, provider, expiresAt, metadata ?? null]
  );

  return { intentId: id, expiresAt };
}

export type IntentConsumeResult =
  | { ok: true; intent: BankLinkIntent }
  | { ok: false; reason: IntentRejectionReason };

export type IntentRejectionReason =
  | "missing_intent_id"     // client didn't send one
  | "intent_not_found"      // id doesn't exist
  | "wrong_user"            // intent belongs to a different user
  | "wrong_provider"        // intent was for a different provider
  | "expired"               // intent expired before completion
  | "already_consumed"      // single-use enforcement
  | "race_lost";            // another concurrent request consumed it first

/**
 * Atomically validate AND consume an intent. Pass the current session user
 * and the provider being completed. The function returns success only if:
 *
 *   • intent exists
 *   • intent.user_id === currentUserId
 *   • intent.provider === expectedProvider
 *   • intent.status === 'open'
 *   • intent.expires_at > now
 *
 * On success the intent is atomically transitioned to 'consumed' (so a second
 * call with the same id will fail with `already_consumed`). Audit fields
 * (consumed_ip, consumed_ua) are recorded.
 *
 * Callers MUST treat any non-ok result as a hard auth failure and refuse to
 * exchange the provider's token.
 */
export async function consumeBankLinkIntent(opts: {
  intentId: string | undefined | null;
  currentUserId: string;
  expectedProvider: BankLinkProvider;
  clientIp?: string | null;
  userAgent?: string | null;
}): Promise<IntentConsumeResult> {
  const { intentId, currentUserId, expectedProvider } = opts;

  if (!intentId) return { ok: false, reason: "missing_intent_id" };

  // Look up the intent once for diagnosis (avoid leaking why it failed to the
  // client — we always return the same error shape — but log it server-side).
  const found = await pool.query<{
    id: string;
    user_id: string;
    provider: string;
    status: string;
    created_at: string;
    expires_at: string;
    consumed_at: string | null;
    metadata: Record<string, unknown> | null;
  }>(
    `SELECT id, user_id, provider, status, created_at, expires_at,
            consumed_at, metadata
       FROM bank_link_intents
      WHERE id = $1`,
    [intentId]
  );

  if (found.rowCount === 0) return { ok: false, reason: "intent_not_found" };
  const row = found.rows[0];

  if (row.user_id !== currentUserId) return { ok: false, reason: "wrong_user" };
  if (row.provider !== expectedProvider) return { ok: false, reason: "wrong_provider" };
  if (row.status === "consumed") return { ok: false, reason: "already_consumed" };
  if (row.status === "expired") return { ok: false, reason: "expired" };
  if (new Date(row.expires_at).getTime() <= Date.now()) {
    // Mark expired so we don't keep returning 'open' on re-checks.
    await pool.query(
      `UPDATE bank_link_intents SET status = 'expired'
        WHERE id = $1 AND status = 'open'`,
      [intentId]
    );
    return { ok: false, reason: "expired" };
  }

  // Atomic single-use transition: only the FIRST request that gets here wins.
  const consumed = await pool.query(
    `UPDATE bank_link_intents
        SET status = 'consumed',
            consumed_at = NOW(),
            consumed_ip = $2,
            consumed_ua = $3
      WHERE id = $1 AND status = 'open'
      RETURNING id`,
    [intentId, opts.clientIp ?? null, opts.userAgent ?? null]
  );

  if (consumed.rowCount === 0) {
    // Another concurrent request beat us to it — this is a single-use intent.
    return { ok: false, reason: "race_lost" };
  }

  return {
    ok: true,
    intent: {
      id: row.id,
      userId: row.user_id,
      provider: row.provider as BankLinkProvider,
      status: "consumed",
      createdAt: row.created_at,
      expiresAt: row.expires_at,
      consumedAt: new Date().toISOString(),
      metadata: row.metadata,
    },
  };
}

/**
 * Best-effort cleanup of intents past their TTL. Safe to run on a schedule.
 * Returns the number of rows transitioned to 'expired'.
 */
export async function expireStaleBankLinkIntents(): Promise<number> {
  const result = await pool.query(
    `UPDATE bank_link_intents
        SET status = 'expired'
      WHERE status = 'open' AND expires_at <= NOW()`
  );
  return result.rowCount ?? 0;
}
