import { env } from "../config/env.js";
import { authenticate } from "./authenticate.js";

export function protectLegacyBooking(req, res, next) {
  if (!env.protectLegacyRoutes) {
    next();
    return;
  }

  authenticate(req, res, next);
}
