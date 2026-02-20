-- Add email verification and mandatory MFA fields to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified text DEFAULT 'false';
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verification_token text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verification_expiry text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_required text DEFAULT 'false';

-- Grandfather existing users: mark them as verified
UPDATE users SET email_verified = 'true' WHERE email_verified IS NULL OR email_verified = 'false';

-- Google OAuth users don't require MFA
UPDATE users SET mfa_required = 'false' WHERE google_id IS NOT NULL;
