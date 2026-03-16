/**
 * email-logger.ts
 * Shared helper to log every outbound email to the email_log table.
 * Import logEmail() from any server module that sends email.
 */

import { pool } from "./db";
import { ServerClient } from "postmark";

let _postmarkClient: ServerClient | null = null;

export function getPostmarkClient(): ServerClient | null {
  const token = process.env.POSTMARK_USERNAME;
  if (!token) return null;
  if (!_postmarkClient) _postmarkClient = new ServerClient(token);
  return _postmarkClient;
}

export type EmailType =
  | "welcome"
  | "bill_reminder"
  | "email_verification"
  | "weekly_digest"
  | "monthly_report"
  | "broadcast"
  | "household_invitation"
  | "upgrade_confirmation"
  | "spending_alert"
  | "usage_milestone"
  | "password_reset"
  | "support_reply"
  | "test";

export interface LogEmailOptions {
  userId?: string | null;
  recipientEmail: string;
  subject: string;
  type: EmailType;
  status?: "sent" | "failed" | "bounced" | "opened";
  postmarkMessageId?: string | null;
  metadata?: Record<string, unknown> | null;
}

/**
 * Insert a row into email_log. Non-fatal — errors are swallowed so a logging
 * failure never blocks the actual email send.
 */
export async function logEmail(opts: LogEmailOptions): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO email_log
         (user_id, recipient_email, subject, type, status, postmark_message_id, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        opts.userId ?? null,
        opts.recipientEmail,
        opts.subject,
        opts.type,
        opts.status ?? "sent",
        opts.postmarkMessageId ?? null,
        opts.metadata ? JSON.stringify(opts.metadata) : null,
      ]
    );
  } catch (err) {
    // Non-fatal: log to console but don't throw
    console.error("[EmailLogger] Failed to log email:", err);
  }
}
