import dotenv from "dotenv";
import { resolve } from "path";

dotenv.config({ path: resolve(process.cwd(), ".env.local") });
dotenv.config({ path: resolve(process.cwd(), ".env") });

function toNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toOptionalBoolean(value) {
  if (value === undefined) {
    return undefined;
  }

  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }

  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }

  return undefined;
}

function toList(value) {
  if (!value) {
    return [];
  }

  return String(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export const env = {
  nodeEnv: process.env.NODE_ENV || "development",
  port: toNumber(process.env.PORT, 8080),
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "2h",
  refreshTokenTtlDays: toNumber(process.env.REFRESH_TOKEN_TTL_DAYS, 14),
  refreshCookieName: process.env.REFRESH_COOKIE_NAME || "refresh_token",
  refreshCookieSecure:
    toOptionalBoolean(process.env.REFRESH_COOKIE_SECURE) ??
    process.env.NODE_ENV === "production",
  corsAllowedOrigins: toList(process.env.CORS_ALLOWED_ORIGINS),
  databaseUrl: process.env.DATABASE_URL || process.env.POSTGRES_URL,
  databaseSsl: toOptionalBoolean(process.env.DB_SSL),
  databaseRejectUnauthorized: toOptionalBoolean(
    process.env.DB_SSL_REJECT_UNAUTHORIZED,
  ),
  poolMax: toNumber(process.env.DB_POOL_MAX, 20),
  poolConnectionTimeoutMs: toNumber(
    process.env.DB_POOL_CONNECTION_TIMEOUT_MS,
    5000,
  ),
  poolIdleTimeoutMs: toNumber(process.env.DB_POOL_IDLE_TIMEOUT_MS, 30000),
  protectLegacyRoutes:
    toOptionalBoolean(process.env.PROTECT_LEGACY_ROUTES) ?? true,
  dbHost: process.env.DB_HOST || "localhost",
  dbPort: toNumber(process.env.DB_PORT, 5432),
  dbUser: process.env.DB_USER || "postgres",
  dbPassword: process.env.DB_PASSWORD || "postgres",
  dbName: process.env.DB_NAME || "sql_class_2_db",
};

export function validateEnv() {
  if (!env.jwtSecret) {
    throw new Error("JWT_SECRET environment variable is required.");
  }

  if (env.nodeEnv === "production" && env.corsAllowedOrigins.length === 0) {
    throw new Error(
      "CORS_ALLOWED_ORIGINS is required in production to avoid an open CORS policy.",
    );
  }
}
