ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "onboarding_progress" text DEFAULT '{}';
