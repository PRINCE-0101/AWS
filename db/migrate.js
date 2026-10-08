require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is missing');

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  try {
    // The schema is kept as plain SQL so the database design is easy for a reviewer to inspect.
    const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
    await pool.query(sql);
    console.log('Database schema is ready.');
  } finally {
    await pool.end();
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
