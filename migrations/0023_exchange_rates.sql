CREATE TABLE IF NOT EXISTS "exchange_rates" (
  "id" serial PRIMARY KEY NOT NULL,
  "from_currency" text NOT NULL,
  "to_currency" text DEFAULT 'CAD' NOT NULL,
  "rate" numeric(10, 6) NOT NULL,
  "fetched_at" timestamp DEFAULT now() NOT NULL
);
