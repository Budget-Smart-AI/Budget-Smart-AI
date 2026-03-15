CREATE TABLE IF NOT EXISTS spending_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR REFERENCES users(id),
  alert_type TEXT,
  category TEXT,
  merchant_name TEXT,
  threshold NUMERIC(10,2),
  period TEXT DEFAULT 'monthly',
  notify_email BOOLEAN DEFAULT true,
  notify_in_app BOOLEAN DEFAULT true,
  is_active BOOLEAN DEFAULT true,
  last_triggered_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);
