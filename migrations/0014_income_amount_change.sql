-- Add fields for scheduled income amount changes (e.g., tax bracket changes, raises)
ALTER TABLE "income" ADD COLUMN IF NOT EXISTS "future_amount" numeric(10, 2);
ALTER TABLE "income" ADD COLUMN IF NOT EXISTS "amount_change_date" text;
