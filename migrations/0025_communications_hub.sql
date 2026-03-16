-- Migration: 0025_communications_hub
-- Email Communications Hub + System Alerts / Push Notifications

-- ── email_log: every email ever sent ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS email_log (
  id            VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       VARCHAR,
  recipient_email TEXT NOT NULL,
  subject       TEXT NOT NULL,
  type          TEXT NOT NULL,  -- welcome | bill_reminder | email_verification | weekly_digest | monthly_report | broadcast | household_invitation | upgrade_confirmation | spending_alert | usage_milestone | password_reset | support_reply | test
  status        TEXT NOT NULL DEFAULT 'sent',  -- sent | failed | bounced | opened
  postmark_message_id TEXT,
  sent_at       TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  opened_at     TIMESTAMP WITH TIME ZONE,
  bounced_at    TIMESTAMP WITH TIME ZONE,
  metadata      TEXT  -- JSON blob for extra context
);

CREATE INDEX IF NOT EXISTS idx_email_log_user_id    ON email_log(user_id);
CREATE INDEX IF NOT EXISTS idx_email_log_type       ON email_log(type);
CREATE INDEX IF NOT EXISTS idx_email_log_status     ON email_log(status);
CREATE INDEX IF NOT EXISTS idx_email_log_sent_at    ON email_log(sent_at DESC);

-- ── email_broadcasts: one-off bulk campaigns ─────────────────────────────────
CREATE TABLE IF NOT EXISTS email_broadcasts (
  id                 VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  subject            TEXT NOT NULL,
  message            TEXT NOT NULL,
  recipient_segment  TEXT NOT NULL DEFAULT 'all',  -- all | free | pro | family | custom
  sent_by            VARCHAR,  -- adminId
  scheduled_for      TIMESTAMP WITH TIME ZONE,
  sent_at            TIMESTAMP WITH TIME ZONE,
  total_recipients   INTEGER DEFAULT 0,
  success_count      INTEGER DEFAULT 0,
  fail_count         INTEGER DEFAULT 0,
  status             TEXT NOT NULL DEFAULT 'draft',  -- draft | scheduled | sending | sent | failed
  created_at         TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_broadcasts_status   ON email_broadcasts(status);
CREATE INDEX IF NOT EXISTS idx_email_broadcasts_sent_at  ON email_broadcasts(sent_at DESC);

-- ── system_alerts: in-app push notifications ─────────────────────────────────
CREATE TABLE IF NOT EXISTS system_alerts (
  id           VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  type         TEXT NOT NULL DEFAULT 'info',  -- info | warning | critical | success
  message      TEXT NOT NULL,
  link_url     TEXT,
  link_text    TEXT,
  created_by   VARCHAR,  -- adminId
  created_at   TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at   TIMESTAMP WITH TIME ZONE,
  dismissed_at TIMESTAMP WITH TIME ZONE,
  is_active    BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS idx_system_alerts_is_active  ON system_alerts(is_active);
CREATE INDEX IF NOT EXISTS idx_system_alerts_created_at ON system_alerts(created_at DESC);

-- ── system_alert_dismissals: per-user dismissal tracking ─────────────────────
CREATE TABLE IF NOT EXISTS system_alert_dismissals (
  id           VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_id     VARCHAR NOT NULL REFERENCES system_alerts(id) ON DELETE CASCADE,
  user_id      VARCHAR NOT NULL,
  dismissed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_alert_dismissal ON system_alert_dismissals(alert_id, user_id);
CREATE INDEX IF NOT EXISTS idx_alert_dismissals_user_id ON system_alert_dismissals(user_id);
