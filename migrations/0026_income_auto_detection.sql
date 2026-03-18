-- Add auto-detection fields to income table
ALTER TABLE income ADD COLUMN IF NOT EXISTS auto_detected boolean DEFAULT false;
ALTER TABLE income ADD COLUMN IF NOT EXISTS detected_at timestamp;
