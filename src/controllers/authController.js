import bcrypt from "bcryptjs";
import { env } from "../config/env.js";
import { pool } from "../config/db.js";
import { HttpError } from "../errors/HttpError.js";
import {
  createRefreshTokenValue,
  createToken,
  hashRefreshToken,
} from "../lib/auth.js";

const PASSWORD_POLICY = {
  minLength: 8,
  hasLower: /[a-z]/,
  hasUpper: /[A-Z]/,
  hasDigit: /\d/,
  hasSymbol: /[^A-Za-z0-9]/,
};

function getRefreshCookieOptions() {
  return {
    httpOnly: true,
    secure: env.refreshCookieSecure,
    sameSite: "lax",
    path: "/auth",
    maxAge: env.refreshTokenTtlDays * 24 * 60 * 60 * 1000,
  };
}

function parseCookie(rawCookieHeader, key) {
  if (!rawCookieHeader) {
    return "";
  }

  const chunks = String(rawCookieHeader).split(";");
  for (const chunk of chunks) {
    const [rawName, ...rawValueParts] = chunk.trim().split("=");
    if (rawName !== key) {
      continue;
    }

    const value = rawValueParts.join("=");
    try {
      return decodeURIComponent(value);
    } catch {
      return "";
    }
  }

  return "";
}

function assertStrongPassword(password) {
  if (
    typeof password !== "string" ||
    password.length < PASSWORD_POLICY.minLength
  ) {
    throw new HttpError(
      400,
      `Password must be at least ${PASSWORD_POLICY.minLength} characters long`,
      { code: "WEAK_PASSWORD" },
    );
  }

  if (
    !PASSWORD_POLICY.hasLower.test(password) ||
    !PASSWORD_POLICY.hasUpper.test(password) ||
    !PASSWORD_POLICY.hasDigit.test(password) ||
    !PASSWORD_POLICY.hasSymbol.test(password)
  ) {
    throw new HttpError(
      400,
      "Password must include uppercase, lowercase, number, and special character",
      { code: "WEAK_PASSWORD" },
    );
  }
}

async function issueSession(res, user, conn = pool) {
  const token = createToken(user);
  const refreshToken = createRefreshTokenValue();
  const refreshTokenHash = hashRefreshToken(refreshToken);
  const expiresAt = new Date(
    Date.now() + env.refreshTokenTtlDays * 24 * 60 * 60 * 1000,
  );

  await conn.query(
    "INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)",
    [user.id, refreshTokenHash, expiresAt],
  );

  res.cookie(env.refreshCookieName, refreshToken, getRefreshCookieOptions());
  return token;
}

export async function register(req, res) {
  const { name, email, password } = req.body;
  const normalizedEmail = (email || "").trim().toLowerCase();
  const normalizedName = (name || "").trim();

  if (!normalizedName || !normalizedEmail || !password) {
    throw new HttpError(400, "name, email and password are required", {
      code: "MISSING_FIELDS",
    });
  }

  assertStrongPassword(password);

  const passwordHash = await bcrypt.hash(password, 10);
  const insertSql = `
    INSERT INTO users (name, email, password_hash)
    VALUES ($1, $2, $3)
    RETURNING id, name, email
  `;

  let insertResult;
  try {
    insertResult = await pool.query(insertSql, [
      normalizedName,
      normalizedEmail,
      passwordHash,
    ]);
  } catch (error) {
    if (error.code === "23505") {
      throw new HttpError(409, "Email already exists", { code: "EMAIL_TAKEN" });
    }
    throw error;
  }

  const user = insertResult.rows[0];
  const token = await issueSession(res, user);

  res.status(201).send({
    message: "User registered successfully",
    token,
    user,
  });
}

export async function login(req, res) {
  const { email, password } = req.body;
  const normalizedEmail = (email || "").trim().toLowerCase();

  if (!normalizedEmail || !password) {
    throw new HttpError(400, "email and password are required", {
      code: "MISSING_FIELDS",
    });
  }

  const userResult = await pool.query(
    "SELECT id, name, email, password_hash FROM users WHERE email = $1",
    [normalizedEmail],
  );

  if (userResult.rowCount === 0) {
    throw new HttpError(401, "Invalid credentials", {
      code: "INVALID_CREDENTIALS",
    });
  }

  const user = userResult.rows[0];
  const isPasswordCorrect = await bcrypt.compare(password, user.password_hash);

  if (!isPasswordCorrect) {
    throw new HttpError(401, "Invalid credentials", {
      code: "INVALID_CREDENTIALS",
    });
  }

  const token = await issueSession(res, user);
  res.send({
    message: "Login successful",
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
    },
  });
}

export async function refreshSession(req, res) {
  const rawToken = parseCookie(req.headers.cookie, env.refreshCookieName);
  if (!rawToken) {
    throw new HttpError(401, "Refresh token is missing", {
      code: "MISSING_REFRESH_TOKEN",
    });
  }

  const tokenHash = hashRefreshToken(rawToken);
  const conn = await pool.connect();
  let committed = false;

  try {
    await conn.query("BEGIN");

    const tokenResult = await conn.query(
      `
        SELECT rt.id, rt.user_id, u.name, u.email
        FROM refresh_tokens rt
        JOIN users u ON u.id = rt.user_id
        WHERE rt.token_hash = $1
          AND rt.revoked_at IS NULL
          AND rt.expires_at > NOW()
        FOR UPDATE
      `,
      [tokenHash],
    );

    if (tokenResult.rowCount === 0) {
      throw new HttpError(401, "Refresh token is invalid or expired", {
        code: "INVALID_REFRESH_TOKEN",
      });
    }

    const existingToken = tokenResult.rows[0];
    await conn.query(
      "UPDATE refresh_tokens SET revoked_at = NOW() WHERE id = $1",
      [existingToken.id],
    );

    const user = {
      id: existingToken.user_id,
      name: existingToken.name,
      email: existingToken.email,
    };

    const token = await issueSession(res, user, conn);
    await conn.query("COMMIT");
    committed = true;

    res.send({
      message: "Session refreshed",
      token,
      user,
    });
  } catch (error) {
    if (!committed) {
      await conn.query("ROLLBACK");
    }
    throw error;
  } finally {
    conn.release();
  }
}

export async function logout(req, res) {
  const rawToken = parseCookie(req.headers.cookie, env.refreshCookieName);

  if (rawToken) {
    const tokenHash = hashRefreshToken(rawToken);
    await pool.query(
      "UPDATE refresh_tokens SET revoked_at = NOW() WHERE token_hash = $1 AND revoked_at IS NULL",
      [tokenHash],
    );
  }

  const cookieOptions = getRefreshCookieOptions();
  res.clearCookie(env.refreshCookieName, {
    httpOnly: cookieOptions.httpOnly,
    secure: cookieOptions.secure,
    sameSite: cookieOptions.sameSite,
    path: cookieOptions.path,
  });

  res.send({
    message: "Logged out successfully",
  });
}
