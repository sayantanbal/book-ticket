import crypto from "crypto";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

export function createToken(user) {
  return jwt.sign(
    {
      userId: user.id,
      name: user.name,
      email: user.email,
    },
    env.jwtSecret,
    { expiresIn: env.jwtExpiresIn },
  );
}

export function verifyToken(token) {
  return jwt.verify(token, env.jwtSecret);
}

export function createRefreshTokenValue() {
  return crypto.randomBytes(48).toString("hex");
}

export function hashRefreshToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}
