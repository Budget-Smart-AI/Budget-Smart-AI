/**
 * Admin Communications Hub Routes
 * Handles: Email Log, Email Templates, Broadcast Emails, Email Health, System Alerts
 */

import { Router, type Request, type Response } from "express";
import { pool } from "../db";
import { storage } from "../storage";

const router = Router();

// ── Auth guard ────────────────────────────────────────────────────────────────
function requireAdmin(req: Request, res: Response, next: Function) {
  const session = (req as any).session;
  if (!session?.userId) return res.status(401).json({ error: "Unauthorized" });
  if (session.isAdmin !== true && session.isAdmin !== "true") {
    return res.status(403).json({ error: "Admin access required" });
  }
  next();
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB 1 — Email Log
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/admin/communications/email-log
router.get("/email-log", requireAdmin, async (req: Request, res: Response) => {
  try {
    const {
      type,
      status,
      userId,
      dateFrom,
      dateTo,
      page = "1",
      limit = "50",
    } = req.query as Record<string, string>;

    const offset = (parseInt(page) - 1) * parseInt(limit);
    const conditions: string[] = [];
    const params: any[] = [];
    let idx = 1;

    if (type) { conditions.push(`el.type = $${idx++}`); params.push(type); }
    if (status) { conditions.push(`el.status = $${idx++}`); params.push(status); }
    if (userId) { conditions.push(`el.user_id = $${idx++}`); params.push(userId); }
    if (dateFrom) { conditions.push(`el.sent_at >= $${idx++}`); params.push(dateFrom); }
    if (dateTo) { conditions.push(`el.sent_at <= $${idx++}`); params.push(dateTo + "T23:59:59Z"); }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    const countResult = await pool.query(
      `SELECT COUNT(*) FROM email_log el ${where}`,
      params
    );
    const total = parseInt(countResult.rows[0].count);

    const result = await pool.query(
      `SELECT el.*, u.username, u.email as user_email
       FROM email_log el
       LEFT JOIN users u ON u.id = el.user_id
       ${where}
       ORDER BY el.sent_at DESC
       LIMIT $${idx++} OFFSET $${idx++}`,
      [...params, parseInt(limit), offset]
    );

    res.json({ logs: result.rows, total, page: parseInt(page), limit: parseInt(limit) });
  } catch (err) {
    console.error("[AdminComms] email-log error:", err);
    res.status(500).json({ error: "Failed to fetch email log" });
  }
});

// GET /api/admin/communications/email-log/export  — CSV download
router.get("/email-log/export", requireAdmin, async (req: Request, res: Response) => {
  try {
    const { type, status, userId, dateFrom, dateTo } = req.query as Record<string, string>;
    const conditions: string[] = [];
    const params: any[] = [];
    let idx = 1;

    if (type) { conditions.push(`type = $${idx++}`); params.push(type); }
    if (status) { conditions.push(`status = $${idx++}`); params.push(status); }
    if (userId) { conditions.push(`user_id = $${idx++}`); params.push(userId); }
    if (dateFrom) { conditions.push(`sent_at >= $${idx++}`); params.push(dateFrom); }
    if (dateTo) { conditions.push(`sent_at <= $${idx++}`); params.push(dateTo + "T23:59:59Z"); }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const result = await pool.query(
      `SELECT id, user_id, recipient_email, subject, type, status, postmark_message_id, sent_at, opened_at, bounced_at
       FROM email_log ${where} ORDER BY sent_at DESC LIMIT 10000`,
      params
    );

    const header = "id,user_id,recipient_email,subject,type,status,postmark_message_id,sent_at,opened_at,bounced_at\n";
    const rows = result.rows.map((r: any) =>
      [r.id, r.user_id ?? "", r.recipient_email, `"${r.subject.replace(/"/g, '""')}"`, r.type, r.status, r.postmark_message_id ?? "", r.sent_at ?? "", r.opened_at ?? "", r.bounced_at ?? ""].join(",")
    ).join("\n");

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="email-log-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send(header + rows);
  } catch (err) {
    console.error("[AdminComms] email-log export error:", err);
    res.status(500).json({ error: "Failed to export email log" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// TAB 2 — Email Templates (read-only preview + basic subject/content edit)
// ─────────────────────────────────────────────────────────────────────────────

const EMAIL_TEMPLATES = [
  {
    id: "welcome",
    name: "Welcome Email",
    subject: "Welcome to Budget Smart AI 🎉",
    description: "Sent when a new user completes registration",
    lastModified: "2026-01-01",
    editable: false,
  },
  {
    id: "email_verification",
    name: "Email Verification",
    subject: "Verify your email address - Budget Smart AI",
    description: "Sent to verify a new user's email address",
    lastModified: "2026-01-01",
    editable: false,
  },
  {
    id: "bill_reminder",
    name: "Bill Reminder",
    subject: "Upcoming Bill Reminder - {bill_name}",
    description: "Sent 1 day before a bill is due",
    lastModified: "2026-01-01",
    editable: false,
  },
  {
    id: "weekly_digest",
    name: "Weekly Digest",
    subject: "Your Weekly Financial Summary - {week_range}",
    description: "Sent weekly to users who opt in",
    lastModified: "2026-01-01",
    editable: false,
  },
  {
    id: "monthly_report",
    name: "Monthly Report",
    subject: "Your Monthly Financial Report - {month}",
    description: "Sent on the 1st of each month",
    lastModified: "2026-01-01",
    editable: false,
  },
  {
    id: "household_invitation",
    name: "Household Invitation",
    subject: "{inviter_name} invited you to join {household_name} on Budget Smart AI",
    description: "Sent when a user invites someone to their household",
    lastModified: "2026-01-01",
    editable: false,
  },
  {
    id: "upgrade_confirmation",
    name: "Upgrade Confirmation",
    subject: "Your Budget Smart AI {plan_name} plan is now active!",
    description: "Sent when a user upgrades their plan",
    lastModified: "2026-01-01",
    editable: false,
  },
  {
    id: "spending_alert",
    name: "Spending Alert",
    subject: "⚠️ Spending Alert: {label} threshold reached",
    description: "Sent when a spending alert threshold is exceeded",
    lastModified: "2026-01-01",
    editable: false,
  },
  {
    id: "usage_milestone",
    name: "Usage Milestone",
    subject: "You're running low on {feature_name} this month",
    description: "Sent at 80% and 100% of free tier usage limits",
    lastModified: "2026-01-01",
    editable: false,
  },
  {
    id: "password_reset",
    name: "Password Reset",
    subject: "Reset your Budget Smart AI password",
    description: "Sent when a user requests a password reset",
    lastModified: "2026-01-01",
    editable: false,
  },
  {
    id: "support_reply",
    name: "Support Reply",
    subject: "Re: {ticket_subject} [Ticket #{ticket_number}]",
    description: "Sent when admin replies to a support ticket",
    lastModified: "2026-01-01",
    editable: false,
  },
];

// GET /api/admin/communications/templates
router.get("/templates", requireAdmin, async (_req: Request, res: Response) => {
  // Enrich with recent send counts from email_log
  try {
    const counts = await pool.query(
      `SELECT type, COUNT(*) as total, MAX(sent_at) as last_sent
       FROM email_log
       GROUP BY type`
    );
    const countMap: Record<string, { total: number; lastSent: string | null }> = {};
    for (const row of counts.rows) {
      countMap[row.type] = { total: parseInt(row.total), lastSent: row.last_sent };
    }

    const templates = EMAIL_TEMPLATES.map((t) => ({
      ...t,
      totalSent: countMap[t.id]?.total ?? 0,
      lastSent: countMap[t.id]?.lastSent ?? null,
    }));

    res.json({ templates });
  } catch (err) {
    console.error("[AdminComms] templates error:", err);
    res.json({ templates: EMAIL_TEMPLATES });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// TAB 3 — Broadcast Email
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/admin/communications/broadcasts  — list past broadcasts
router.get("/broadcasts", requireAdmin, async (_req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT eb.*, u.username as sent_by_username
       FROM email_broadcasts eb
       LEFT JOIN users u ON u.id = eb.sent_by
       ORDER BY eb.created_at DESC
       LIMIT 50`
    );
    res.json({ broadcasts: result.rows });
  } catch (err) {
    console.error("[AdminComms] broadcasts list error:", err);
    res.status(500).json({ error: "Failed to fetch broadcasts" });
  }
});

// GET /api/admin/communications/broadcasts/preview  — count recipients for segment
router.get("/broadcasts/preview", requireAdmin, async (req: Request, res: Response) => {
  try {
    const { segment = "all" } = req.query as { segment: string };
    let where = "WHERE (is_deleted IS NULL OR is_deleted = false) AND email IS NOT NULL AND email != ''";
    if (segment === "free") where += " AND (plan IS NULL OR plan = 'free')";
    else if (segment === "pro") where += " AND plan = 'pro'";
    else if (segment === "family") where += " AND plan = 'family'";

    const result = await pool.query(`SELECT COUNT(*) FROM users ${where}`);
    res.json({ count: parseInt(result.rows[0].count), segment });
  } catch (err) {
    console.error("[AdminComms] broadcast preview error:", err);
    res.status(500).json({ error: "Failed to preview recipients" });
  }
});

// POST /api/admin/communications/broadcasts/send  — send broadcast
router.post("/broadcasts/send", requireAdmin, async (req: Request, res: Response) => {
  try {
    const session = (req as any).session;
    const { subject, message, recipientSegment = "all", scheduledFor } = req.body;

    if (!subject?.trim() || !message?.trim()) {
      return res.status(400).json({ error: "Subject and message are required" });
    }

    // Create broadcast record
    const broadcastResult = await pool.query(
      `INSERT INTO email_broadcasts (subject, message, recipient_segment, sent_by, scheduled_for, status)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [subject, message, recipientSegment, session.userId, scheduledFor || null, scheduledFor ? "scheduled" : "sending"]
    );
    const broadcast = broadcastResult.rows[0];

    if (scheduledFor) {
      return res.json({ success: true, broadcast, message: "Broadcast scheduled" });
    }

    // Send immediately — fetch recipients
    let where = "WHERE (is_deleted IS NULL OR is_deleted = false) AND email IS NOT NULL AND email != ''";
    if (recipientSegment === "free") where += " AND (plan IS NULL OR plan = 'free')";
    else if (recipientSegment === "pro") where += " AND plan = 'pro'";
    else if (recipientSegment === "family") where += " AND plan = 'family'";

    const usersResult = await pool.query(
      `SELECT id, email, first_name, username FROM users ${where}`
    );
    const recipients = usersResult.rows;

    const fromEmail = process.env.ALERT_EMAIL_FROM;
    if (!fromEmail || !process.env.POSTMARK_USERNAME) {
      // Update broadcast as failed
      await pool.query(
        `UPDATE email_broadcasts SET status = 'failed', sent_at = NOW(), total_recipients = $1 WHERE id = $2`,
        [recipients.length, broadcast.id]
      );
      return res.status(500).json({ error: "Email not configured (POSTMARK_USERNAME or ALERT_EMAIL_FROM missing)" });
    }

    const { ServerClient } = await import("postmark");
    const client = new ServerClient(process.env.POSTMARK_USERNAME);

    let successCount = 0;
    let failCount = 0;

    // Send in batches of 50
    const BATCH_SIZE = 50;
    for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
      const batch = recipients.slice(i, i + BATCH_SIZE);
      await Promise.allSettled(
        batch.map(async (user: any) => {
          try {
            const firstName = user.first_name || user.username || "there";
            const htmlBody = `
<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
<div style="background:#fff;border-radius:12px;padding:32px;border:1px solid #e5e7eb;">
<h2 style="color:#059669;">Hi ${firstName},</h2>
<div style="color:#374151;font-size:15px;line-height:1.7;">${message.replace(/\n/g, "<br>")}</div>
<hr style="margin:24px 0;border:none;border-top:1px solid #e5e7eb;">
<p style="color:#9ca3af;font-size:12px;">© ${new Date().getFullYear()} Budget Smart AI · <a href="${process.env.APP_URL || "https://app.budgetsmart.io"}/settings" style="color:#059669;">Manage preferences</a></p>
</div></body></html>`;

            const result = await client.sendEmail({
              From: fromEmail,
              To: user.email,
              Subject: subject,
              TextBody: `Hi ${firstName},\n\n${message}\n\n---\nBudget Smart AI`,
              HtmlBody: htmlBody,
            });

            // Log to email_log
            await pool.query(
              `INSERT INTO email_log (user_id, recipient_email, subject, type, status, postmark_message_id)
               VALUES ($1, $2, $3, 'broadcast', 'sent', $4)`,
              [user.id, user.email, subject, result.MessageID || null]
            );
            successCount++;
          } catch {
            failCount++;
            await pool.query(
              `INSERT INTO email_log (user_id, recipient_email, subject, type, status)
               VALUES ($1, $2, $3, 'broadcast', 'failed')`,
              [user.id, user.email, subject]
            );
          }
        })
      );
    }

    // Update broadcast record
    await pool.query(
      `UPDATE email_broadcasts
       SET status = 'sent', sent_at = NOW(), total_recipients = $1, success_count = $2, fail_count = $3
       WHERE id = $4`,
      [recipients.length, successCount, failCount, broadcast.id]
    );

    res.json({
      success: true,
      broadcast: { ...broadcast, totalRecipients: recipients.length, successCount, failCount, status: "sent" },
      message: `Sent to ${successCount} of ${recipients.length} recipients`,
    });
  } catch (err) {
    console.error("[AdminComms] broadcast send error:", err);
    res.status(500).json({ error: "Failed to send broadcast" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// TAB 4 — Email Health (Postmark stats)
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/admin/communications/email-health
router.get("/email-health", requireAdmin, async (_req: Request, res: Response) => {
  try {
    // Local stats from email_log (last 7 days)
    const localStats = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE sent_at >= NOW() - INTERVAL '7 days') as volume_7d,
        COUNT(*) FILTER (WHERE status = 'sent' AND sent_at >= NOW() - INTERVAL '7 days') as sent_7d,
        COUNT(*) FILTER (WHERE status = 'failed' AND sent_at >= NOW() - INTERVAL '7 days') as failed_7d,
        COUNT(*) FILTER (WHERE status = 'bounced' AND sent_at >= NOW() - INTERVAL '7 days') as bounced_7d,
        COUNT(*) FILTER (WHERE status = 'opened' AND sent_at >= NOW() - INTERVAL '7 days') as opened_7d,
        COUNT(*) FILTER (WHERE status = 'bounced') as total_bounces,
        COUNT(*) as total_all_time
      FROM email_log
    `);

    const s = localStats.rows[0];
    const volume7d = parseInt(s.volume_7d) || 0;
    const sent7d = parseInt(s.sent_7d) || 0;
    const failed7d = parseInt(s.failed_7d) || 0;
    const bounced7d = parseInt(s.bounced_7d) || 0;
    const opened7d = parseInt(s.opened_7d) || 0;

    const deliveryRate = volume7d > 0 ? ((sent7d / volume7d) * 100).toFixed(1) : "0.0";
    const bounceRate = volume7d > 0 ? ((bounced7d / volume7d) * 100).toFixed(1) : "0.0";
    const openRate = sent7d > 0 ? ((opened7d / sent7d) * 100).toFixed(1) : "0.0";

    // Recent bounces
    const bounces = await pool.query(`
      SELECT el.recipient_email, el.subject, el.type, el.bounced_at, u.username
      FROM email_log el
      LEFT JOIN users u ON u.id = el.user_id
      WHERE el.status = 'bounced'
      ORDER BY el.bounced_at DESC NULLS LAST
      LIMIT 10
    `);

    // Volume by type (last 30 days)
    const byType = await pool.query(`
      SELECT type, COUNT(*) as count
      FROM email_log
      WHERE sent_at >= NOW() - INTERVAL '30 days'
      GROUP BY type
      ORDER BY count DESC
    `);

    // Try Postmark API stats if configured
    let postmarkStats = null;
    const postmarkToken = process.env.POSTMARK_USERNAME;
    if (postmarkToken) {
      try {
        const { ServerClient } = await import("postmark");
        const client = new ServerClient(postmarkToken);
        const stats = await client.getDeliveryStatistics();
        postmarkStats = {
          inactiveMails: stats.InactiveMails,
          bounces: stats.Bounces?.map((b: any) => ({ type: b.Type, name: b.Name, count: b.Count })) ?? [],
        };
      } catch {
        // Postmark stats unavailable — use local only
      }
    }

    res.json({
      local: {
        volume7d,
        sent7d,
        failed7d,
        bounced7d,
        opened7d,
        deliveryRate: parseFloat(deliveryRate),
        bounceRate: parseFloat(bounceRate),
        openRate: parseFloat(openRate),
        totalAllTime: parseInt(s.total_all_time) || 0,
        totalBounces: parseInt(s.total_bounces) || 0,
      },
      recentBounces: bounces.rows,
      volumeByType: byType.rows,
      postmark: postmarkStats,
    });
  } catch (err) {
    console.error("[AdminComms] email-health error:", err);
    res.status(500).json({ error: "Failed to fetch email health" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// TAB 5 — System Alerts
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/admin/communications/system-alerts  — all alerts (admin view)
router.get("/system-alerts", requireAdmin, async (_req: Request, res: Response) => {
  try {
    const active = await pool.query(`
      SELECT sa.*, u.username as created_by_username,
        (SELECT COUNT(*) FROM system_alert_dismissals sad WHERE sad.alert_id = sa.id) as dismissal_count
      FROM system_alerts sa
      LEFT JOIN users u ON u.id = sa.created_by
      WHERE sa.is_active = true
        AND (sa.expires_at IS NULL OR sa.expires_at > NOW())
      ORDER BY sa.created_at DESC
    `);

    const history = await pool.query(`
      SELECT sa.*, u.username as created_by_username,
        (SELECT COUNT(*) FROM system_alert_dismissals sad WHERE sad.alert_id = sa.id) as dismissal_count
      FROM system_alerts sa
      LEFT JOIN users u ON u.id = sa.created_by
      WHERE sa.is_active = false OR (sa.expires_at IS NOT NULL AND sa.expires_at <= NOW())
      ORDER BY sa.created_at DESC
      LIMIT 50
    `);

    res.json({ active: active.rows, history: history.rows });
  } catch (err) {
    console.error("[AdminComms] system-alerts list error:", err);
    res.status(500).json({ error: "Failed to fetch system alerts" });
  }
});

// POST /api/admin/communications/system-alerts  — create alert
router.post("/system-alerts", requireAdmin, async (req: Request, res: Response) => {
  try {
    const session = (req as any).session;
    const { type = "info", message, linkUrl, linkText, expiresAt } = req.body;

    if (!message?.trim()) {
      return res.status(400).json({ error: "Message is required" });
    }
    if (message.length > 200) {
      return res.status(400).json({ error: "Message must be 200 characters or less" });
    }
    if (!["info", "warning", "critical", "success"].includes(type)) {
      return res.status(400).json({ error: "Invalid alert type" });
    }

    const result = await pool.query(
      `INSERT INTO system_alerts (type, message, link_url, link_text, created_by, expires_at, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, true)
       RETURNING *`,
      [type, message.trim(), linkUrl || null, linkText || null, session.userId, expiresAt || null]
    );

    res.json({ success: true, alert: result.rows[0] });
  } catch (err) {
    console.error("[AdminComms] create system-alert error:", err);
    res.status(500).json({ error: "Failed to create system alert" });
  }
});

// DELETE /api/admin/communications/system-alerts/:id  — dismiss/deactivate alert
router.delete("/system-alerts/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await pool.query(
      `UPDATE system_alerts SET is_active = false, dismissed_at = NOW() WHERE id = $1`,
      [id]
    );
    res.json({ success: true });
  } catch (err) {
    console.error("[AdminComms] dismiss system-alert error:", err);
    res.status(500).json({ error: "Failed to dismiss alert" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// User-facing: get active system alerts (polled every 30s by the app)
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/system-alerts  — active alerts for current user (public, auth required)
router.get("/active-alerts", async (req: Request, res: Response) => {
  try {
    const session = (req as any).session;
    if (!session?.userId) return res.json({ alerts: [] });

    const result = await pool.query(
      `SELECT sa.*
       FROM system_alerts sa
       WHERE sa.is_active = true
         AND (sa.expires_at IS NULL OR sa.expires_at > NOW())
         AND sa.id NOT IN (
           SELECT alert_id FROM system_alert_dismissals WHERE user_id = $1
         )
       ORDER BY sa.created_at DESC`,
      [session.userId]
    );

    res.json({ alerts: result.rows });
  } catch (err) {
    console.error("[SystemAlerts] active-alerts error:", err);
    res.json({ alerts: [] });
  }
});

// POST /api/system-alerts/:id/dismiss  — user dismisses an alert
router.post("/active-alerts/:id/dismiss", async (req: Request, res: Response) => {
  try {
    const session = (req as any).session;
    if (!session?.userId) return res.status(401).json({ error: "Unauthorized" });

    const { id } = req.params;

    // Check if alert is critical — critical alerts cannot be dismissed
    const alertResult = await pool.query(
      `SELECT type FROM system_alerts WHERE id = $1 AND is_active = true`,
      [id]
    );
    if (!alertResult.rows.length) return res.json({ success: true });
    if (alertResult.rows[0].type === "critical") {
      return res.status(400).json({ error: "Critical alerts cannot be dismissed" });
    }

    await pool.query(
      `INSERT INTO system_alert_dismissals (alert_id, user_id)
       VALUES ($1, $2)
       ON CONFLICT (alert_id, user_id) DO NOTHING`,
      [id, session.userId]
    );

    res.json({ success: true });
  } catch (err) {
    console.error("[SystemAlerts] dismiss error:", err);
    res.status(500).json({ error: "Failed to dismiss alert" });
  }
});

export default router;
