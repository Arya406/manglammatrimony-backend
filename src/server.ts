import { app } from "./app";
import { config, validateStorageConfig, validateAuthConfig } from "./config/env";

// Fail-fast startup validation of storage and production authentication configuration
validateStorageConfig();
validateAuthConfig();

// Idempotently bootstrap platform administrator if credentials are configured
if (process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD) {
  import("./seeds/admin.seed")
    .then(({ seedAdminAccount }) => seedAdminAccount())
    .catch((err) => {
      console.warn("[ADMIN BOOTSTRAP WARNING]:", err instanceof Error ? err.message : err);
    });
}

const server = app.listen(config.port, () => {
  console.log(
    `[SERVER RUNNING] Manglam Matrimony Backend active on port ${config.port} (${config.nodeEnv})`
  );
  console.log(`[HEALTH CHECK] http://localhost:${config.port}/api/health`);
});

process.on("SIGTERM", () => {
  console.log("[SERVER SHUTDOWN] SIGTERM received. Closing HTTP server...");
  server.close(() => {
    console.log("[SERVER SHUTDOWN] Process terminated gracefully.");
  });
});
