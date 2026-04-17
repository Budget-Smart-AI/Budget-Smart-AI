-- Add user_watchlists table for the Investor Research tab
-- Each user can track a list of ticker symbols. (user_id, symbol) is unique.

CREATE TABLE IF NOT EXISTS user_watchlists (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR NOT NULL,
  symbol TEXT NOT NULL,
  added_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_watchlists_user_symbol
  ON user_watchlists(user_id, symbol);

CREATE INDEX IF NOT EXISTS idx_user_watchlists_user
  ON user_watchlists(user_id);
