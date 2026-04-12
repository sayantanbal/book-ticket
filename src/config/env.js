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

export const env = {
  nodeEnv: process.env.NODE_ENV || "development",
  port: toNumber(process.env.PORT, 8080),
  jwtSecret: process.env.JWT_SECRET,
  databaseUrl: process.env.DATABASE_URL || process.env.POSTGRES_URL,
  databaseSsl: toOptionalBoolean(process.env.DB_SSL),
  databaseRejectUnauthorized: toOptionalBoolean(
    process.env.DB_SSL_REJECT_UNAUTHORIZED,
  ),
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
}
