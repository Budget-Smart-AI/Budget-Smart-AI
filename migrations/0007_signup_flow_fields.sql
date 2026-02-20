-- Add signup flow fields to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS trial_email_reminder text DEFAULT 'true';
ALTER TABLE users ADD COLUMN IF NOT EXISTS selected_plan_id text;
