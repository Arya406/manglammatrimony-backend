import { app } from "./app";
import { config } from "./config/env";

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
