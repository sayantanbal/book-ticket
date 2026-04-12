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
    { expiresIn: "2h" },
  );
}

export function verifyToken(token) {
  return jwt.verify(token, env.jwtSecret);
}
