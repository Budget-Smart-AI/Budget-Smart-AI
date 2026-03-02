-- Create support_tickets table to persistently store submitted support requests
CREATE TABLE IF NOT EXISTS "support_tickets" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" text NOT NULL,
  "email" text NOT NULL,
  "type" text NOT NULL,
  "subject" text NOT NULL,
  "priority" text,
  "message" text NOT NULL,
  "status" text NOT NULL DEFAULT 'open',
  "email_sent" text NOT NULL DEFAULT 'false',
  "created_at" text
);
