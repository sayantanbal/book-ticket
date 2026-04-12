import cors from "cors";
import express from "express";
import { authRateLimiter } from "./middleware/authRateLimiter.js";
import authRoutes from "./routes/authRoutes.js";
import legacyRoutes from "./routes/legacyRoutes.js";
import movieRoutes from "./routes/movieRoutes.js";
import pageRoutes from "./routes/pageRoutes.js";

export function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json());

  app.use(pageRoutes);
  app.use("/auth", authRateLimiter);
  app.use("/auth", authRoutes);
  app.use(movieRoutes);
  app.use(legacyRoutes);

  return app;
}
