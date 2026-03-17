import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

try {
  // Check existing columns
  const cols = await pool.query(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'ai_model_config'
    ORDER BY ordinal_position;
  `);
  console.log('Existing columns:', cols.rows);

  // Drop and recreate with correct schema
  await pool.query(`DROP TABLE IF EXISTS ai_model_config;`);
  console.log('Dropped old table.');

  await pool.query(`
    CREATE TABLE ai_model_config (
      id SERIAL PRIMARY KEY,
      feature TEXT UNIQUE NOT NULL,
      provider TEXT DEFAULT 'deepseek',
      model TEXT DEFAULT 'deepseek-chat',
      max_tokens INTEGER DEFAULT 500,
      temperature NUMERIC(3,2) DEFAULT 0.7,
      is_enabled BOOLEAN DEFAULT true,
      updated_at TIMESTAMP DEFAULT NOW(),
      updated_by TEXT
    );
  `);
  console.log('Created ai_model_config table with correct schema.');

  await pool.query(`
    INSERT INTO ai_model_config (feature, provider, model, max_tokens, temperature)
    VALUES ('taxsmart', 'deepseek', 'deepseek-chat', 500, 0.7)
    ON CONFLICT (feature) DO NOTHING;
  `);
  console.log('Seeded taxsmart config row.');

  const result = await pool.query('SELECT * FROM ai_model_config;');
  console.log('Current rows:', result.rows);
} catch (err) {
  console.error('Migration error:', err.message);
} finally {
  await pool.end();
}
