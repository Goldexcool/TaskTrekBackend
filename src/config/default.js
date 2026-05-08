require('dotenv').config();

const isProd = process.env.NODE_ENV === 'production';

// In production all JWT secrets must be explicitly set — no fallbacks.
const REQUIRED_IN_PROD = ['MONGODB_URI', 'JWT_SECRET', 'ACCESS_TOKEN_SECRET', 'REFRESH_TOKEN_SECRET'];

if (isProd) {
  const missing = REQUIRED_IN_PROD.filter(k => !process.env[k]);
  if (missing.length) {
    console.error(`[startup] Missing required environment variables: ${missing.join(', ')}`);
    process.exit(1);
  }
}

// Dev-only fallbacks (harmless in dev, never reached in prod due to check above)
if (!process.env.ACCESS_TOKEN_SECRET) {
  console.warn('[startup] ACCESS_TOKEN_SECRET not set — using development fallback (NOT SAFE FOR PRODUCTION)');
  process.env.ACCESS_TOKEN_SECRET = 'dev-access-token-secret-tasktrek-2025-development-only';
}
if (!process.env.REFRESH_TOKEN_SECRET) {
  console.warn('[startup] REFRESH_TOKEN_SECRET not set — using development fallback (NOT SAFE FOR PRODUCTION)');
  process.env.REFRESH_TOKEN_SECRET = 'dev-refresh-token-secret-tasktrek-2025-development-only';
}
if (!process.env.JWT_SECRET) {
  console.warn('[startup] JWT_SECRET not set — using development fallback (NOT SAFE FOR PRODUCTION)');
  process.env.JWT_SECRET = 'dev-jwt-secret-tasktrek-2025-development-only';
}

module.exports = {
  PORT: parseInt(process.env.PORT, 10) || 3000,
  NODE_ENV: process.env.NODE_ENV || 'development',
  IS_PROD: isProd,
  MONGODB_URI: process.env.MONGODB_URI,
  JWT_SECRET: process.env.JWT_SECRET,
  ACCESS_TOKEN_SECRET: process.env.ACCESS_TOKEN_SECRET,
  REFRESH_TOKEN_SECRET: process.env.REFRESH_TOKEN_SECRET,
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '24h',
  EMAIL_USER: process.env.EMAIL_USER,
  EMAIL_PASS: process.env.EMAIL_PASS,
  FRONTEND_URL: process.env.FRONTEND_URL || 'http://localhost:3000',
  ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
    : ['http://localhost:3000'],
  API_BASE_URL: process.env.API_BASE_URL || 'http://localhost:3000',
};
