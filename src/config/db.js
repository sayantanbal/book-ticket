import pg from "pg";
import { env } from "./env.js";

function shouldDefaultSsl(connectionString) {
  try {
    const parsedUrl = new URL(connectionString);
    const sslMode = parsedUrl.searchParams.get("sslmode");

    if (sslMode) {
      return sslMode !== "disable";
    }

    return !["localhost", "127.0.0.1"].includes(parsedUrl.hostname);
  } catch {
    return true;
  }
}

function getSslConfig(connectionString) {
  const useSsl = env.databaseSsl ?? shouldDefaultSsl(connectionString);
  if (!useSsl) {
    return false;
  }

  return {
    rejectUnauthorized: env.databaseRejectUnauthorized ?? false,
  };
}

function getPoolConfig() {
  if (env.databaseUrl) {
    return {
      connectionString: env.databaseUrl,
      ssl: getSslConfig(env.databaseUrl),
    };
  }

  return {
    host: env.dbHost,
    port: env.dbPort,
    user: env.dbUser,
    password: env.dbPassword,
    database: env.dbName,
  };
}

export const pool = new pg.Pool({
  ...getPoolConfig(),
  max: env.poolMax,
  connectionTimeoutMillis: env.poolConnectionTimeoutMs,
  idleTimeoutMillis: env.poolIdleTimeoutMs,
});
