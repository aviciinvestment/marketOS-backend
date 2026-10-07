const { Pool } = require('pg');

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('ERROR: DATABASE_URL is not set in environment variables (.env).');
}

const pool = new Pool({
  connectionString: DATABASE_URL,
});

const TYPES = ['products', 'sales', 'expenses'];

// Initialize DB schema. Tables persist across restarts so multi-device sync survives.
const initDB = async () => {
  const client = await pool.connect();
  try {
    for (const type of TYPES) {
      const col = await client.query(
        `SELECT 1 FROM information_schema.columns WHERE table_name = $1 AND column_name = 'user_id'`,
        [type]
      );
      if (col.rows.length === 0) {
        await client.query(`DROP TABLE IF EXISTS ${type} CASCADE`);
      }
      await client.query(`
        CREATE TABLE IF NOT EXISTS ${type} (
          id VARCHAR(255) NOT NULL,
          user_id VARCHAR(255) NOT NULL,
          data JSONB NOT NULL,
          PRIMARY KEY (user_id, id)
        )
      `);
    }
    await client.query(`
      CREATE TABLE IF NOT EXISTS sync_meta (
        user_id VARCHAR(255) PRIMARY KEY,
        pending_devices JSONB NOT NULL DEFAULT '[]',
        updated_at TIMESTAMPTZ DEFAULT now()
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS tombstones (
        user_id VARCHAR(255) NOT NULL,
        type VARCHAR(50) NOT NULL,
        id VARCHAR(255) NOT NULL,
        deleted_at BIGINT NOT NULL,
        deleted_by_device VARCHAR(255),
        PRIMARY KEY (user_id, type, id)
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS support_complaints (
        id VARCHAR(255) PRIMARY KEY,
        user_id VARCHAR(255),
        user_email VARCHAR(255),
        phone_number VARCHAR(255) NOT NULL,
        category VARCHAR(255),
        message TEXT NOT NULL,
        status VARCHAR(50) DEFAULT 'pending',
        created_at TIMESTAMPTZ DEFAULT now()
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_profiles (
        user_id VARCHAR(255) PRIMARY KEY,
        name VARCHAR(255),
        email VARCHAR(255),
        last_active TIMESTAMPTZ DEFAULT now(),
        created_at TIMESTAMPTZ DEFAULT now()
      )
    `);
    console.log('Database initialized successfully with support_complaints & user_profiles tables');
  } catch (err) {
    console.error('Error initializing DB', err);
  } finally {
    client.release();
  }
};

module.exports = {
  pool,
  initDB,
  TYPES
};
