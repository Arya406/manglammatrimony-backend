require("dotenv/config");
const { execSync } = require("child_process");

function deployMigrations() {
  let targetUrl = process.env.DIRECT_URL || process.env.DATABASE_URL;

  if (!targetUrl) {
    console.error("[MIGRATION DEPLOY ERROR]: Neither DIRECT_URL nor DATABASE_URL is defined.");
    process.exit(1);
  }

  // Neon connection pooler operates in transaction mode which does not support session advisory locks.
  // Prisma Migrate requires a direct unpooled connection to acquire pg_advisory_lock.
  if (targetUrl.includes("-pooler.")) {
    console.log("[MIGRATION DEPLOY] Detected Neon connection pooler in URL.");
    console.log("[MIGRATION DEPLOY] Automatically routing migration advisory lock to direct unpooled endpoint...");
    targetUrl = targetUrl
      .replace("-pooler.", ".")
      .replace(/([?&])pgbouncer=true&?/g, "$1")
      .replace(/[?&]$/, "");
  }

  console.log("[MIGRATION DEPLOY] Executing prisma migrate deploy...");
  try {
    execSync("npx prisma migrate deploy", {
      stdio: "inherit",
      env: {
        ...process.env,
        DATABASE_URL: targetUrl,
      },
    });
    console.log("[MIGRATION DEPLOY] ✓ Prisma migrations deployed successfully.");
  } catch (err) {
    console.error("[MIGRATION DEPLOY ERROR] Migration deployment failed:", err.message);
    process.exit(1);
  }
}

deployMigrations();
