const { Pool } = require('pg');
const { databaseUrl } = require('./env');

// A shared connection pool avoids opening a brand-new database connection per request.
// max=10 is intentionally small for local development and the submission demo.
const pool = new Pool({
  connectionString: databaseUrl,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000
});

// pg can emit errors from idle clients that would otherwise be easy to miss.
pool.on('error', err => console.error('Unexpected PostgreSQL pool error', err));

module.exports = pool;
