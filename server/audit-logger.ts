/**
 * SOC 2 Audit Logger — fire-and-forget, never blocks a request.
 * All errors are swallowed and logged to stderr so that an audit
 * failure never surfaces to the end user.
 */

import { Pool } from "pg";
import type { Request } from "express";

// Re-use the same pool that the rest of the server uses.
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.on("error", (err) => {
  console.error("[AuditLogger] Pool error:", err);
});

// ─── Types ───────────────────────────────────────────────────────────────────

export type AuditEventType =
  | "auth.login"
  | "auth.login_failed"
  | "auth.logout"
  | "auth.password_change"
  | "auth.account_locked"
  | "user.created"
  | "user.deleted"
  | "user.role_changed"
  | "data.bank_connected"
  | "data.bank_disconnected"
  | "data.bank_synced"
  | "data.transactions_viewed"
  | "data.export_requested"
  | "data.account_deleted"
  | "admin.user_viewed"
  | "admin.settings_changed"
  | "admin.data_accessed"
  | "security.rate_limit_exceeded"
  | "security.suspicious_activity"
  | "billing.subscription_created"
  | "billing.subscription_cancelled";

export type AuditOutcome = "success" | "failure" | "blocked";

export interface AuditEntry {
  eventType: AuditEventType;
  eventCategory: string;
  actorId?: string | null;
  actorType?: string;
  actorIp?: string | null;
  actorUserAgent?: string | null;
  targetType?: string | null;
  targetId?: string | null;
  targetUserId?: string | null;
  action: string;
  outcome?: AuditOutcome;
  metadata?: Record<string, unknown> | null;
  errorMessage?: string | null;
  sessionId?: string | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Extract the real client IP address from the request, honouring the
 * X-Forwarded-For header written by Railway / Replit's reverse proxy.
 */
export function getClientIp(req: Request): string | null {
  const forwarded = req.headers["x-forwarded-for"];
  if (forwarded) {
    const first = Array.isArray(forwarded) ? forwarded[0] : forwarded.split(",")[0];
    return first.trim() || null;
  }
  return req.socket?.remoteAddress ?? null;
}

/** Derive a short category string from the event type prefix. */
function categoryFromEventType(eventType: AuditEventType): string {
  return eventType.split(".")[0];
}

// ─── Core function ────────────────────────────────────────────────────────────

/**
 * Write an audit log entry.  Fire-and-forget — the returned Promise is never
 * awaited by callers; errors are silently caught so they never affect the
 * request that triggered the audit.
 */
export function auditLog(entry: AuditEntry): void {
  const {
    eventType,
    eventCategory = categoryFromEventType(eventType),
    actorId = null,
    actorType = "user",
    actorIp = null,
    actorUserAgent = null,
    targetType = null,
    targetId = null,
    targetUserId = null,
    action,
    outcome = "success",
    metadata = null,
    errorMessage = null,
    sessionId = null,
  } = entry;

  // Best-effort write — never await, never propagate errors.
  pool
    .query(
      `INSERT INTO audit_log (
         event_type, event_category, actor_id, actor_type,
         actor_ip, actor_user_agent,
         target_type, target_id, target_user_id,
         action, outcome, metadata, error_message, session_id
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [
        eventType,
        eventCategory,
        actorId,
        actorType,
        actorIp,
        actorUserAgent,
        targetType,
        targetId,
        targetUserId,
        action,
        outcome,
        metadata ? JSON.stringify(metadata) : null,
        errorMessage,
        sessionId,
      ],
    )
    .catch((err) => {
      console.error("[AuditLogger] Failed to write audit entry:", err);
    });
}

/**
 * Convenience wrapper that builds common fields from an Express request and
 * merges them with the caller-supplied entry fields.
 */
export function auditLogFromRequest(req: Request, entry: AuditEntry): void {
  auditLog({
    actorIp: getClientIp(req),
    actorUserAgent: req.headers["user-agent"] ?? null,
    sessionId: req.sessionID ?? null,
    ...entry,
    actorId: entry.actorId ?? (req.session as any)?.userId ?? null,
  });
}
