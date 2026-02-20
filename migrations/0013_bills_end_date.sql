-- Add end_date field to bills table for recurring bills with a defined end
ALTER TABLE "bills" ADD COLUMN IF NOT EXISTS "end_date" text;
