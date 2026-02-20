-- Video annotations for landing page
-- Timed popup annotations that highlight features as the video plays

CREATE TABLE IF NOT EXISTS landing_video_annotations (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  text TEXT NOT NULL,
  start_time REAL NOT NULL DEFAULT 0,
  duration REAL NOT NULL DEFAULT 3,
  position TEXT NOT NULL DEFAULT 'bottom-right',
  style TEXT NOT NULL DEFAULT 'default',
  icon TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active TEXT NOT NULL DEFAULT 'true',
  created_at TEXT DEFAULT NOW()::text,
  updated_at TEXT DEFAULT NOW()::text
);

-- Insert example annotations
INSERT INTO landing_video_annotations (text, start_time, duration, position, style, icon, sort_order) VALUES
  ('AI-Powered Budget Tracking', 2, 4, 'bottom-right', 'highlight', 'Brain', 1),
  ('Bank-Level Security & Encryption', 7, 4, 'bottom-left', 'security', 'Shield', 2),
  ('Smart Savings Goals That Adapt', 12, 4, 'top-right', 'success', 'Target', 3),
  ('Real-Time Spending Insights', 17, 4, 'bottom-right', 'info', 'TrendingUp', 4),
  ('Family Sharing for Up to 6 Members', 22, 4, 'top-left', 'family', 'Users', 5);
