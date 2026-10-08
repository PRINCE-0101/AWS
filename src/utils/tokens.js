const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { accessSecret, refreshSecret, accessTtl } = require('../config/env');

// Access tokens are intentionally short-lived. APIs should use these for normal requests.
function createAccessToken(user) {
  return jwt.sign(
    { sub: user.id, role: user.role, email: user.email },
    accessSecret,
    { expiresIn: accessTtl, issuer: 'campusforge-api' }
  );
}

// Refresh tokens are separate credentials used only by /auth/refresh.
function createRefreshToken(user) {
  return jwt.sign(
    { sub: user.id, type: 'refresh' },
    refreshSecret,
    { expiresIn: '7d', issuer: 'campusforge-api' }
  );
}

function verifyAccessToken(token) {
  return jwt.verify(token, accessSecret, { issuer: 'campusforge-api' });
}

function verifyRefreshToken(token) {
  return jwt.verify(token, refreshSecret, { issuer: 'campusforge-api' });
}

// Refresh tokens are stored as hashes, not as raw bearer credentials.
function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

module.exports = {
  createAccessToken,
  createRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  hashToken
};
