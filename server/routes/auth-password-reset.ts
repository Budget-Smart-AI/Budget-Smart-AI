/**
 * Password Reset & Backup Code Routes
 * Handles: forgot-password, reset-password, verify-backup-code
 */
import type { Express, Request, Response } from "express";
import crypto from "crypto";
import bcrypt from "bcrypt";
import { pool } from "../db";
import { storage } from "../storage";
import { hashPassword, verifyMfaToken } from "../auth";
import { sendEmailViaPostmark } from "../email";
import { auditLog } from "../audit-logger";

// ── Rate limiting helpers ────────────────────────────────────────────────────
// Track forgot-password requests per email (in-memory, resets on restart)
const forgotPasswordAttempts = new Map<string, { count: number; resetAt: number }>();
const FORGOT_PASSWORD_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const FORGOT_PASSWORD_MAX_ATTEMPTS = 3;

function checkForgotPasswordRateLimit(email: string): boolean {
  const now = Date.now();
  const entry = forgotPasswordAttempts.get(email.toLowerCase());
  if (!entry || now > entry.resetAt) {
    forgotPasswordAttempts.set(email.toLowerCase(), { count: 1, resetAt: now + FORGOT_PASSWORD_WINDOW_MS });
    return true; // allowed
  }
  if (entry.count >= FORGOT_PASSWORD_MAX_ATTEMPTS) {
    return false; // blocked
  }
  entry.count++;
  return true;
}

// ── Token helpers ────────────────────────────────────────────────────────────
function generateSecureToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

const RESET_TOKEN_EXPIRY_HOURS = 1;

// ── Ensure tables exist (idempotent) ────────────────────────────────────────
async function ensurePasswordResetTables(): Promise<void> {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS password_reset_tokens (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id VARCHAR NOT NULL,
        token TEXT NOT NULL UNIQUE,
        expires_at TIMESTAMPTZ NOT NULL,
        used_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_token ON password_reset_tokens(token)
    `);
  } catch (err) {
    console.error("[PasswordReset] Failed to ensure tables:", err);
  }
}

// Run on module load
ensurePasswordResetTables().catch(console.error);

// ── Route registration ───────────────────────────────────────────────────────
export function registerPasswordResetRoutes(app: Express): void {

  // ── POST /api/auth/forgot-password ──────────────────────────────────────
  // Accepts an email, looks up the user, creates a reset token, sends email.
  // Always returns 200 to prevent user enumeration.
  app.post("/api/auth/forgot-password", async (req: Request, res: Response) => {
    try {
      const { email } = req.body as { email?: string };

      if (!email || typeof email !== "string" || !email.includes("@")) {
        return res.status(400).json({ error: "Valid email address is required" });
      }

      const normalizedEmail = email.trim().toLowerCase();

      // Rate limit per email
      if (!checkForgotPasswordRateLimit(normalizedEmail)) {
        // Still return 200 to prevent enumeration, but don't send email
        return res.json({ message: "If an account exists, a reset link has been sent." });
      }

      // Look up user by email
      const userResult = await pool.query(
        `SELECT id, email, first_name, username, google_id, password FROM users
         WHERE LOWER(email) = $1 AND (is_deleted IS NULL OR is_deleted = false)
         LIMIT 1`,
        [normalizedEmail]
      );

      // Always respond the same way regardless of whether user exists
      if (userResult.rowCount === 0) {
        return res.json({ message: "If an account exists, a reset link has been sent." });
      }

      const user = userResult.rows[0];

      // Google OAuth users without a password cannot reset via email
      if (user.google_id && !user.password) {
        // Still return 200 but send a helpful email
        const fromEmail = process.env.ALERT_EMAIL_FROM;
        const appUrl = process.env.APP_URL || "https://app.budgetsmart.io";
        if (fromEmail) {
          await sendEmailViaPostmark({
            from: fromEmail,
            to: user.email,
            subject: "Budget Smart AI — Password Reset Request",
            text: `Hi ${user.first_name || user.username},\n\nYou requested a password reset, but your account uses Google Sign-In. Please sign in using the "Continue with Google" button at ${appUrl}/login.\n\nIf you didn't request this, you can safely ignore this email.\n\nThe Budget Smart AI Team`,
            html: `<p>Hi ${user.first_name || user.username},</p>
<p>You requested a password reset, but your account uses <strong>Google Sign-In</strong>.</p>
<p>Please sign in using the <strong>"Continue with Google"</strong> button at <a href="${appUrl}/login">${appUrl}/login</a>.</p>
<p>If you didn't request this, you can safely ignore this email.</p>
<p>The Budget Smart AI Team</p>`,
          }).catch(console.error);
        }
        return res.json({ message: "If an account exists, a reset link has been sent." });
      }

      // Invalidate any existing unused tokens for this user
      await pool.query(
        `UPDATE password_reset_tokens SET used_at = NOW()
         WHERE user_id = $1 AND used_at IS NULL`,
        [user.id]
      );

      // Create new token
      const token = generateSecureToken();
      const expiresAt = new Date(Date.now() + RESET_TOKEN_EXPIRY_HOURS * 60 * 60 * 1000);

      await pool.query(
        `INSERT INTO password_reset_tokens (user_id, token, expires_at)
         VALUES ($1, $2, $3)`,
        [user.id, token, expiresAt.toISOString()]
      );

      // Send reset email
      const fromEmail = process.env.ALERT_EMAIL_FROM;
      const appUrl = process.env.APP_URL || "https://app.budgetsmart.io";
      const resetUrl = `${appUrl}/reset-password/${token}`;
      const firstName = user.first_name || user.username || "there";

      if (fromEmail) {
        await sendEmailViaPostmark({
          from: fromEmail,
          to: user.email,
          subject: "Reset Your Budget Smart AI Password",
          text: `Hi ${firstName},\n\nWe received a request to reset your password.\n\nClick the link below to reset it (expires in ${RESET_TOKEN_EXPIRY_HOURS} hour):\n${resetUrl}\n\nIf you didn't request this, you can safely ignore this email — your password won't change.\n\nThe Budget Smart AI Team`,
          html: `<!DOCTYPE html>
<html>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #f9fafb;">
  <div style="background: #ffffff; border-radius: 12px; padding: 32px; border: 1px solid #e5e7eb;">
    <h1 style="color: #059669; font-size: 24px; margin: 0 0 8px;">Reset Your Password</h1>
    <p style="color: #374151;">Hi ${firstName},</p>
    <p style="color: #374151;">We received a request to reset your Budget Smart AI password. Click the button below to choose a new password:</p>
    <div style="text-align: center; margin: 28px 0;">
      <a href="${resetUrl}" style="background: #059669; color: white; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 16px; display: inline-block;">
        Reset My Password
      </a>
    </div>
    <p style="color: #6b7280; font-size: 14px;">This link expires in <strong>${RESET_TOKEN_EXPIRY_HOURS} hour</strong>. If you didn't request a password reset, you can safely ignore this email.</p>
    <p style="color: #6b7280; font-size: 12px; margin-top: 24px;">If the button doesn't work, copy and paste this link into your browser:<br><a href="${resetUrl}" style="color: #059669; word-break: break-all;">${resetUrl}</a></p>
    <hr style="margin: 24px 0; border: none; border-top: 1px solid #e5e7eb;">
    <p style="color: #9ca3af; font-size: 12px; text-align: center;">© ${new Date().getFullYear()} Budget Smart AI</p>
  </div>
</body>
</html>`,
        }).catch((err) => {
          console.error("[PasswordReset] Failed to send reset email:", err);
        });
      } else {
        console.warn("[PasswordReset] ALERT_EMAIL_FROM not set — reset email not sent");
      }

      auditLog({
        eventType: "auth.password_reset_requested",
        eventCategory: "auth",
        actorId: user.id,
        actorType: "user",
        targetUserId: user.id,
        action: "password_reset_request",
        outcome: "success",
        metadata: { email: normalizedEmail },
      });

      return res.json({ message: "If an account exists, a reset link has been sent." });
    } catch (error) {
      console.error("[PasswordReset] forgot-password error:", error);
      return res.status(500).json({ error: "An error occurred. Please try again." });
    }
  });

  // ── GET /api/auth/reset-password/validate/:token ─────────────────────────
  // Validates a reset token without consuming it (used by the frontend on page load)
  app.get("/api/auth/reset-password/validate/:token", async (req: Request, res: Response) => {
    try {
      const { token } = req.params;
      if (!token || token.length !== 64) {
        return res.json({ valid: false, error: "Invalid reset link." });
      }

      const result = await pool.query(
        `SELECT id, expires_at, used_at FROM password_reset_tokens
         WHERE token = $1 LIMIT 1`,
        [token]
      );

      if (result.rowCount === 0) {
        return res.json({ valid: false, error: "This reset link is invalid or has already been used." });
      }

      const row = result.rows[0];
      if (row.used_at) {
        return res.json({ valid: false, error: "This reset link has already been used. Please request a new one." });
      }
      if (new Date(row.expires_at) < new Date()) {
        return res.json({ valid: false, error: "This reset link has expired. Please request a new one." });
      }

      return res.json({ valid: true });
    } catch (error) {
      console.error("[PasswordReset] validate error:", error);
      return res.json({ valid: false, error: "Unable to validate reset link." });
    }
  });

  // ── POST /api/auth/reset-password ────────────────────────────────────────
  // Consumes the token and updates the user's password
  app.post("/api/auth/reset-password", async (req: Request, res: Response) => {
    try {
      const { token, password } = req.body as { token?: string; password?: string };

      if (!token || typeof token !== "string" || token.length !== 64) {
        return res.status(400).json({ error: "Invalid reset token." });
      }
      if (!password || typeof password !== "string" || password.length < 8) {
        return res.status(400).json({ error: "Password must be at least 8 characters." });
      }

      // Password complexity check
      if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password) || !/[^A-Za-z0-9]/.test(password)) {
        return res.status(400).json({ error: "Password must contain uppercase, lowercase, number, and special character." });
      }

      // Look up token
      const tokenResult = await pool.query(
        `SELECT prt.id, prt.user_id, prt.expires_at, prt.used_at,
                u.email, u.first_name, u.username
         FROM password_reset_tokens prt
         JOIN users u ON u.id = prt.user_id
         WHERE prt.token = $1 LIMIT 1`,
        [token]
      );

      if (tokenResult.rowCount === 0) {
        return res.status(400).json({ error: "Invalid or expired reset link. Please request a new one." });
      }

      const row = tokenResult.rows[0];

      if (row.used_at) {
        return res.status(400).json({ error: "This reset link has already been used. Please request a new one." });
      }
      if (new Date(row.expires_at) < new Date()) {
        return res.status(400).json({ error: "This reset link has expired. Please request a new one." });
      }

      // Hash new password
      const hashedPassword = await hashPassword(password);

      // Update password and mark token as used in a transaction
      await pool.query("BEGIN");
      try {
        await pool.query(
          `UPDATE users SET password = $1, failed_login_attempts = 0, locked_until = NULL WHERE id = $2`,
          [hashedPassword, row.user_id]
        );
        await pool.query(
          `UPDATE password_reset_tokens SET used_at = NOW() WHERE id = $1`,
          [row.id]
        );
        // Invalidate all sessions for this user for security
        await pool.query(
          `DELETE FROM session WHERE sess::text LIKE $1`,
          [`%"userId":"${row.user_id}"%`]
        ).catch(() => {}); // Non-fatal if session table structure differs
        await pool.query("COMMIT");
      } catch (txErr) {
        await pool.query("ROLLBACK");
        throw txErr;
      }

      // Send confirmation email
      const fromEmail = process.env.ALERT_EMAIL_FROM;
      const appUrl = process.env.APP_URL || "https://app.budgetsmart.io";
      const firstName = row.first_name || row.username || "there";

      if (fromEmail && row.email) {
        await sendEmailViaPostmark({
          from: fromEmail,
          to: row.email,
          subject: "Your Budget Smart AI Password Has Been Reset",
          text: `Hi ${firstName},\n\nYour Budget Smart AI password was successfully reset.\n\nIf you didn't make this change, please contact support immediately at ${appUrl}/support.\n\nThe Budget Smart AI Team`,
          html: `<!DOCTYPE html>
<html>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #f9fafb;">
  <div style="background: #ffffff; border-radius: 12px; padding: 32px; border: 1px solid #e5e7eb;">
    <h1 style="color: #059669; font-size: 24px; margin: 0 0 8px;">Password Reset Successful</h1>
    <p style="color: #374151;">Hi ${firstName},</p>
    <p style="color: #374151;">Your Budget Smart AI password has been successfully reset.</p>
    <p style="color: #374151;">You can now <a href="${appUrl}/login" style="color: #059669;">sign in</a> with your new password.</p>
    <div style="background: #fef3c7; border: 1px solid #f59e0b; border-radius: 8px; padding: 12px; margin: 20px 0;">
      <p style="color: #92400e; margin: 0; font-size: 14px;"><strong>Didn't make this change?</strong> Contact support immediately at <a href="${appUrl}/support" style="color: #92400e;">${appUrl}/support</a></p>
    </div>
    <hr style="margin: 24px 0; border: none; border-top: 1px solid #e5e7eb;">
    <p style="color: #9ca3af; font-size: 12px; text-align: center;">© ${new Date().getFullYear()} Budget Smart AI</p>
  </div>
</body>
</html>`,
        }).catch(console.error);
      }

      auditLog({
        eventType: "auth.password_reset_completed",
        eventCategory: "auth",
        actorId: row.user_id,
        actorType: "user",
        targetUserId: row.user_id,
        action: "password_reset",
        outcome: "success",
        metadata: {},
      });

      return res.json({ success: true, message: "Password reset successfully." });
    } catch (error) {
      console.error("[PasswordReset] reset-password error:", error);
      return res.status(500).json({ error: "An error occurred. Please try again." });
    }
  });

  // ── POST /api/auth/verify-backup-code ────────────────────────────────────
  // Verifies a backup code during MFA login (when user lost their authenticator)
  app.post("/api/auth/verify-backup-code", async (req: Request, res: Response) => {
    try {
      const { code } = req.body as { code?: string };

      // Must have a pending MFA session
      if (!req.session.userId || !req.session.pendingMfa) {
        return res.status(401).json({ error: "No pending authentication session." });
      }

      if (!code || typeof code !== "string") {
        return res.status(400).json({ error: "Backup code is required." });
      }

      const normalizedCode = code.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
      if (normalizedCode.length !== 8) {
        return res.status(400).json({ error: "Invalid backup code format." });
      }

      const user = await storage.getUser(req.session.userId);
      if (!user) {
        return res.status(401).json({ error: "User not found." });
      }

      // Check backup codes stored in users.mfa_backup_codes (plaintext array)
      const backupCodes: string[] = Array.isArray(user.mfaBackupCodes) ? user.mfaBackupCodes : [];

      if (backupCodes.length === 0) {
        return res.status(400).json({ error: "No backup codes available for this account. Please contact support." });
      }

      // Find matching code (case-insensitive)
      const matchIndex = backupCodes.findIndex(
        (c) => c.toUpperCase() === normalizedCode
      );

      if (matchIndex === -1) {
        auditLog({
          eventType: "auth.backup_code_failed",
          eventCategory: "auth",
          actorId: user.id,
          actorType: "user",
          targetUserId: user.id,
          action: "verify_backup_code",
          outcome: "failure",
          metadata: {},
        });
        return res.status(401).json({ error: "Invalid backup code. Please check your saved codes and try again." });
      }

      // Remove used code
      const remainingCodes = backupCodes.filter((_, i) => i !== matchIndex);

      // Update user's backup codes
      await pool.query(
        `UPDATE users SET mfa_backup_codes = $1 WHERE id = $2`,
        [remainingCodes, user.id]
      );

      // Grant full session access
      req.session.mfaVerified = true;
      req.session.pendingMfa = false;

      // Load household info
      try {
        const { loadHouseholdIntoSession } = await import("../auth");
        await loadHouseholdIntoSession(req);
      } catch {}

      auditLog({
        eventType: "auth.backup_code_used",
        eventCategory: "auth",
        actorId: user.id,
        actorType: "user",
        targetUserId: user.id,
        action: "verify_backup_code",
        outcome: "success",
        metadata: { remainingCodes: remainingCodes.length },
      });

      // Warn user if running low on backup codes
      if (remainingCodes.length <= 2 && user.email) {
        const fromEmail = process.env.ALERT_EMAIL_FROM;
        const appUrl = process.env.APP_URL || "https://app.budgetsmart.io";
        if (fromEmail) {
          sendEmailViaPostmark({
            from: fromEmail,
            to: user.email,
            subject: "⚠️ Budget Smart AI — Low Backup Codes Warning",
            text: `Hi ${user.firstName || user.username},\n\nYou used a backup code to sign in and now have only ${remainingCodes.length} backup code(s) remaining.\n\nPlease set up a new authenticator app as soon as possible at ${appUrl}/settings/security.\n\nThe Budget Smart AI Team`,
            html: `<p>Hi ${user.firstName || user.username},</p>
<p>You used a backup code to sign in and now have only <strong>${remainingCodes.length} backup code(s)</strong> remaining.</p>
<p>Please <a href="${appUrl}/settings/security">set up a new authenticator app</a> as soon as possible to avoid being locked out.</p>
<p>The Budget Smart AI Team</p>`,
          }).catch(console.error);
        }
      }

      req.session.save((err) => {
        if (err) {
          console.error("[BackupCode] Session save error:", err);
          return res.status(500).json({ error: "Session error. Please try again." });
        }
        return res.json({
          success: true,
          backupCodeUsed: true,
          remainingCodes: remainingCodes.length,
        });
      });
    } catch (error) {
      console.error("[BackupCode] verify-backup-code error:", error);
      return res.status(500).json({ error: "An error occurred. Please try again." });
    }
  });

  // ── POST /api/auth/mfa/regenerate-backup-codes ───────────────────────────
  // Allows authenticated users to regenerate backup codes (e.g. from settings)
  app.post("/api/auth/mfa/regenerate-backup-codes", async (req: Request, res: Response) => {
    try {
      if (!req.session.userId || req.session.pendingMfa) {
        return res.status(401).json({ error: "Not authenticated." });
      }

      const user = await storage.getUser(req.session.userId);
      if (!user || user.mfaEnabled !== "true") {
        return res.status(400).json({ error: "2FA is not enabled on this account." });
      }

      // Require current TOTP code or password to regenerate
      const { code, password } = req.body as { code?: string; password?: string };
      let verified = false;

      if (code && user.mfaSecret) {
        verified = verifyMfaToken(user.mfaSecret, code);
      } else if (password && user.password) {
        const bcryptModule = await import("bcrypt");
        verified = await bcryptModule.compare(password, user.password);
      }

      if (!verified) {
        return res.status(401).json({ error: "Invalid verification code or password." });
      }

      // Generate new backup codes
      const { generateBackupCodes } = await import("../auth");
      const newCodes = generateBackupCodes();

      await pool.query(
        `UPDATE users SET mfa_backup_codes = $1 WHERE id = $2`,
        [newCodes, user.id]
      );

      auditLog({
        eventType: "auth.backup_codes_regenerated",
        eventCategory: "auth",
        actorId: user.id,
        actorType: "user",
        targetUserId: user.id,
        action: "regenerate_backup_codes",
        outcome: "success",
        metadata: {},
      });

      return res.json({ success: true, backupCodes: newCodes });
    } catch (error) {
      console.error("[BackupCode] regenerate error:", error);
      return res.status(500).json({ error: "An error occurred. Please try again." });
    }
  });
}
