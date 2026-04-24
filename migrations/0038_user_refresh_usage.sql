CREATE TABLE IF NOT EXISTS user_refresh_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR NOT NULL,
  plaid_item_id VARCHAR,
  used_at TIMESTAMP NOT NULL DEFAULT NOW(),
  success BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS user_refresh_usage_user_used_idx
  ON user_refresh_usage (user_id, used_at DESC);
