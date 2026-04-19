import cors from "cors";
import express from "express";
import { env } from "./config/env.js";
import { HttpError } from "./errors/HttpError.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { authRateLimiter } from "./middleware/authRateLimiter.js";
import { requestLogger } from "./middleware/requestLogger.js";
import { securityHeaders } from "./middleware/securityHeaders.js";
import authRoutes from "./routes/authRoutes.js";
import legacyRoutes from "./routes/legacyRoutes.js";
import movieRoutes from "./routes/movieRoutes.js";
import pageRoutes from "./routes/pageRoutes.js";

const DEFAULT_DEV_ORIGINS = [
  "http://localhost:3000",
  "http://localhost:5173",
  "http://localhost:8080",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:8080",
];

function createCorsOptions() {
  const configuredOrigins =
    env.corsAllowedOrigins.length > 0
      ? env.corsAllowedOrigins
      : env.nodeEnv === "production"
        ? []
        : DEFAULT_DEV_ORIGINS;
  const allowedOrigins = new Set(configuredOrigins);

  return {
    credentials: true,
    origin(origin, callback) {
      if (!origin) {
        callback(null, true);
        return;
      }

      callback(null, allowedOrigins.has(origin));
    },
  };
}

export function createApp() {
  const app = express();

  app.disable("x-powered-by");
  app.use(requestLogger);
  app.use(securityHeaders);
  app.use(cors(createCorsOptions()));
  app.use(express.json());

  app.use(pageRoutes);
  app.use("/auth", authRateLimiter);
  app.use("/auth", authRoutes);
  app.use(movieRoutes);
  app.use(legacyRoutes);

  app.use((req, res, next) => {
    next(
      new HttpError(404, `Route not found: ${req.method} ${req.originalUrl}`),
    );
  });

  app.use(errorHandler);

  return app;
}
