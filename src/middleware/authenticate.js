import { HttpError } from "../errors/HttpError.js";
import { verifyToken } from "../lib/auth.js";

export function authenticate(req, res, next) {
  const authHeader = req.headers.authorization || "";
  const [scheme, token] = authHeader.split(" ");

  if (scheme !== "Bearer" || !token) {
    next(
      new HttpError(401, "Missing or invalid authorization token", {
        code: "MISSING_TOKEN",
      }),
    );
    return;
  }

  try {
    const payload = verifyToken(token);
    req.user = payload;
    next();
  } catch (error) {
    next(error);
  }
}
