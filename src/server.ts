import { app } from "./app";
import { config } from "./config/env";
import { seedMasterData } from "./services/seed.service";

const server = app.listen(config.port, async () => {
  console.log(
    `[SERVER RUNNING] Manglam Matrimony Backend active on port ${config.port} (${config.nodeEnv})`
  );
  console.log(`[HEALTH CHECK] http://localhost:${config.port}/api/health`);

  try {
    await seedMasterData();
  } catch (seedErr) {
    console.error("[AUTO-SEED ERROR] Failed to seed master data on startup:", seedErr);
  }
});

process.on("SIGTERM", () => {
  console.log("[SERVER SHUTDOWN] SIGTERM received. Closing HTTP server...");
  server.close(() => {
    console.log("[SERVER SHUTDOWN] Process terminated gracefully.");
  });
});
