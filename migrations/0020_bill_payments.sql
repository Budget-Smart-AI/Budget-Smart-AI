CREATE TABLE IF NOT EXISTS bill_payments (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id varchar,
  bill_id varchar,
  transaction_id varchar,
  amount numeric(10,2),
  paid_date text,
  month text,
  status text DEFAULT 'paid',
  created_at timestamp DEFAULT now()
);
