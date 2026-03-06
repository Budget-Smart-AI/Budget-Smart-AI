-- Migration: 0017_field_enc_columns.sql
-- Description: Add AES-256-GCM encrypted columns for sensitive fields
-- Dual-column approach: new _enc column added alongside legacy column.
-- Application reads from new column first, falls back to legacy column.

-- Plaid access tokens
ALTER TABLE plaid_items ADD COLUMN IF NOT EXISTS access_token_enc TEXT;
ALTER TABLE plaid_items ADD COLUMN IF NOT EXISTS item_id_enc TEXT;

-- MX member identifiers
ALTER TABLE mx_members ADD COLUMN IF NOT EXISTS member_guid_enc TEXT;

-- User phone numbers
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_enc TEXT;
