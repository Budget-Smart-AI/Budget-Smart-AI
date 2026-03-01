-- Create receipts table for storing scanned/uploaded receipt data
CREATE TABLE IF NOT EXISTS "receipts" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" varchar NOT NULL,
  "merchant" text NOT NULL DEFAULT 'Unknown',
  "amount" numeric(12, 2) NOT NULL DEFAULT '0',
  "date" text NOT NULL,
  "category" text NOT NULL DEFAULT 'Uncategorized',
  "items" text,
  "confidence" real NOT NULL DEFAULT 0,
  "image_url" text,
  "raw_text" text,
  "matched_transaction_id" text,
  "match_status" text NOT NULL DEFAULT 'unmatched',
  "notes" text,
  "created_at" text
);
