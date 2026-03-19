-- AI Teller Flags table (Phase 2: Proactive Flagging)
CREATE TABLE IF NOT EXISTS teller_flags (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR NOT NULL,
  transaction_id VARCHAR NOT NULL,
  flag_type VARCHAR NOT NULL CHECK (flag_type IN ('transfer_pair', 'miscategory', 'anomaly')),
  message TEXT NOT NULL,
  suggested_action JSONB,
  is_dismissed BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_teller_flags_user_id ON teller_flags(user_id);
CREATE INDEX IF NOT EXISTS idx_teller_flags_transaction_id ON teller_flags(transaction_id);
CREATE INDEX IF NOT EXISTS idx_teller_flags_user_dismissed ON teller_flags(user_id, is_dismissed);
