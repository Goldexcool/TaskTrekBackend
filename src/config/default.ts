import dotenv from 'dotenv';
dotenv.config();

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

export const PORT: number = parseInt(process.env.PORT ?? '3000', 10);
export const NODE_ENV: string = process.env.NODE_ENV ?? 'development';
export const IS_PROD: boolean = isProd;
export const MONGODB_URI: string | undefined = process.env.MONGODB_URI;
export const JWT_SECRET: string | undefined = process.env.JWT_SECRET;
export const ACCESS_TOKEN_SECRET: string | undefined = process.env.ACCESS_TOKEN_SECRET;
export const REFRESH_TOKEN_SECRET: string | undefined = process.env.REFRESH_TOKEN_SECRET;
export const JWT_EXPIRES_IN: string = process.env.JWT_EXPIRES_IN ?? '24h';
export const BREVO_API_KEY: string | undefined = process.env.BREVO_API_KEY;
export const BREVO_SENDER_EMAIL: string | undefined = process.env.BREVO_SENDER_EMAIL;
export const BREVO_SENDER_NAME: string = process.env.BREVO_SENDER_NAME ?? 'TaskTrek';
export const FRONTEND_URL: string = process.env.FRONTEND_URL ?? 'http://localhost:3000';
export const ALLOWED_ORIGINS: string[] = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
  : ['http://localhost:3000'];
export const API_BASE_URL: string = process.env.API_BASE_URL ?? 'http://localhost:3000';
