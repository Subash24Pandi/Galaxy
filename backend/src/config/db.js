const { Pool } = require('pg');

// Intelligently parse cloud URL if provided, otherwise fallback to local credentials
const poolConfig = process.env.DATABASE_URL 
  ? {
      connectionString: process.env.DATABASE_URL,
      // Many cloud providers (Render/Heroku/Railway) strictly require SSL
      ssl: {
        rejectUnauthorized: false
      }
    }
  : {
      user: process.env.DB_USER,
      host: process.env.DB_HOST,
      database: process.env.DB_NAME,
      password: process.env.DB_PASSWORD,
      port: process.env.DB_PORT,
    };

const pool = new Pool(poolConfig);

const connectDB = async () => {
  try {
    await pool.query('SELECT NOW()');
    console.log('PostgreSQL connected successfully');
  } catch (error) {
    console.error('PostgreSQL connection error:', error.message);
    // Keep it silent for now if DB isn't running to allow partial mock usage
    console.warn('Continuing without DB connection. (Some features may fail).');
  }
};

// Generic query wrapper
const query = (text, params) => pool.query(text, params);

module.exports = { connectDB, query, pool };
