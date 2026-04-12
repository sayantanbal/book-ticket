import { createApp } from "./app.js";
import { env, validateEnv } from "./config/env.js";
import { initializeDatabase } from "./services/initializeDatabase.js";

async function startServer() {
  validateEnv();

  await initializeDatabase();

  const app = createApp();
  app.listen(env.port, () => {
    console.log("Server starting on port: " + env.port);
  });
}

startServer().catch((error) => {
  console.error("Failed to initialize database", error);
  process.exit(1);
});
