const bcrypt = require('bcryptjs');
const pool = require('../config/db');
const { refreshDays } = require('../config/env');
const {
  createAccessToken,
  createRefreshToken,
  verifyRefreshToken,
  hashToken
} = require('../utils/tokens');

// Registration stores only a bcrypt hash. The plain password never reaches PostgreSQL.
async function register({ name, email, password, role = 'STUDENT' }) {
  const passwordHash = await bcrypt.hash(password, 12);
  const { rows } = await pool.query(
    `INSERT INTO users (name,email,password_hash,role) VALUES ($1,$2,$3,$4)
     RETURNING id,name,email,role,created_at`,
    [name, email.toLowerCase(), passwordHash, role]
  );
  return rows[0];
}

// Login issues two different credentials:
//   1) short-lived access token for API calls
//   2) refresh token used to obtain a fresh access token later
async function login({ email, password }) {
  const { rows } = await pool.query('SELECT * FROM users WHERE email=$1', [email.toLowerCase()]);
  const user = rows[0];

  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    const err = new Error('Invalid email or password');
    err.status = 401;
    err.code = 'INVALID_CREDENTIALS';
    throw err;
  }

  const accessToken = createAccessToken(user);
  const refreshToken = createRefreshToken(user);
  await storeRefreshToken(user.id, refreshToken);

  return { user: publicUser(user), accessToken, refreshToken };
}

// Only a SHA-256 hash of the refresh token is stored. A database leak therefore
// does not directly reveal reusable refresh tokens.
async function storeRefreshToken(userId, rawToken) {
  const expires = new Date(Date.now() + refreshDays * 86400000);
  await pool.query(
    'INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1,$2,$3)',
    [userId, hashToken(rawToken), expires]
  );
}

// Refresh-token rotation is transactional: the old token is revoked and a new token
// is inserted as one atomic operation. A second use of the old token is rejected.
async function refresh(rawToken) {
  let payload;
  try {
    payload = verifyRefreshToken(rawToken);
  } catch {
    const e = new Error('Refresh token is invalid or expired');
    e.status = 401;
    throw e;
  }

  if (payload.type !== 'refresh') {
    const e = new Error('Invalid refresh token');
    e.status = 401;
    throw e;
  }

  const tokenHash = hashToken(rawToken);
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const found = await client.query(`
      SELECT
        rt.id AS token_id,
        rt.user_id,
        rt.expires_at,
        rt.revoked_at,
        u.id AS user_id,
        u.name,
        u.email,
        u.role
      FROM refresh_tokens rt
      JOIN users u ON u.id=rt.user_id
      WHERE rt.token_hash=$1
      FOR UPDATE`, [tokenHash]);

    const row = found.rows[0];
    if (!row || row.revoked_at || new Date(row.expires_at) <= new Date()) {
      await client.query('ROLLBACK');
      const e = new Error('Refresh token has been revoked or expired');
      e.status = 401;
      throw e;
    }

    // Revoke the consumed refresh token before issuing its replacement.
    await client.query('UPDATE refresh_tokens SET revoked_at=NOW() WHERE id=$1', [row.token_id]);

    const user = {
      id: row.user_id,
      name: row.name,
      email: row.email,
      role: row.role
    };
    const accessToken = createAccessToken(user);
    const refreshToken = createRefreshToken(user);
    const expires = new Date(Date.now() + refreshDays * 86400000);

    await client.query(
      'INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1,$2,$3)',
      [row.user_id, hashToken(refreshToken), expires]
    );

    await client.query('COMMIT');
    return { user, accessToken, refreshToken };
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch {}
    throw err;
  } finally {
    client.release();
  }
}

async function logout(rawToken) {
  // Logout is intentionally idempotent: trying to revoke an already-revoked token is harmless.
  await pool.query(
    'UPDATE refresh_tokens SET revoked_at=NOW() WHERE token_hash=$1 AND revoked_at IS NULL',
    [hashToken(rawToken)]
  );
}

// Never return password hashes to the client.
function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    created_at: user.created_at
  };
}

module.exports = { register, login, refresh, logout, publicUser };
