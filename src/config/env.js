require('dotenv').config();

// Fail fast when the application is missing anything required to start securely.
const required = ['DATABASE_URL', 'JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET'];
for (const key of required) {
  if (!process.env[key]) throw new Error(`${key} is required`);
}

module.exports = {
  port: Number(process.env.PORT || 4000),
  databaseUrl: process.env.DATABASE_URL,
  accessSecret: process.env.JWT_ACCESS_SECRET,
  refreshSecret: process.env.JWT_REFRESH_SECRET,
  accessTtl: process.env.ACCESS_TOKEN_TTL || '15m',
  refreshDays: Number(process.env.REFRESH_TOKEN_TTL_DAYS || 7),
  nodeEnv: process.env.NODE_ENV || 'development'
};
