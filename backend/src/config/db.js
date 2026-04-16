const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const poolConfig = process.env.DATABASE_URL 
  ? {
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis:  5000,   // Give up after 5s if DB unreachable
      idleTimeoutMillis:       30000,
      max:                        10,
    }
  : {
      user:     process.env.DB_USER,
      host:     process.env.DB_HOST,
      database: process.env.DB_NAME,
      password: process.env.DB_PASSWORD,
      port:     process.env.DB_PORT,
      connectionTimeoutMillis: 5000,
    };

const pool = new Pool(poolConfig);

// Prevent unhandled rejection when DB host is unreachable
pool.on('error', (err) => {
  console.warn('[DB] Pool error (DB may be unreachable):', err.message);
});

const connectDB = async () => {
  try {
    const client = await pool.connect();
    console.log('[DB] ✅ PostgreSQL connected successfully');
    
    // Auto-initialize schema
    const schemaPath = path.join(__dirname, '..', 'models', 'schema.sql');
    if (fs.existsSync(schemaPath)) {
      const sql = fs.readFileSync(schemaPath, 'utf8');
      await client.query(sql);
      console.log('[DB] Schema initialized (tables created if missing)');
    }
    
    client.release();
  } catch (error) {
    console.error('[DB] ❌ PostgreSQL initialization error:', error.message);
    console.warn('[DB] ⚠ Continuing without DB persistence — translation pipeline still works.');
  }
};

const query = async (text, params) => {
  try {
    return await pool.query(text, params);
  } catch (err) {
    // Silently fail DB writes — don't crash the pipeline
    console.warn('[DB] Query failed (skipping):', err.message);
    return { rows: [] };
  }
};

module.exports = { connectDB, query, pool };


