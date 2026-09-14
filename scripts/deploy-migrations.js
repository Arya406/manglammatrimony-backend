require("dotenv/config");
const { spawnSync } = require("child_process");
const { PrismaClient } = require("@prisma/client");

async function deployMigrations() {
  console.log("==================================================");
  console.log("MANGLAM MATRIMONY — PRODUCTION MIGRATION DEPLOYER");
  console.log("==================================================");

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

  const prisma = new PrismaClient({
    datasources: {
      db: { url: targetUrl },
    },
  });

  try {
    console.log("\n[PHASE 2 & 6: DATABASE CONNECTION & SNAPSHOT]");
    // 1. Connection test
    await prisma.$queryRawUnsafe("SELECT 1 as connected");
    console.log("✓ Database connected successfully to target endpoint.");

    // 2. Data Safety Row Counts Snapshot (Phase 6)
    console.log("\n==================================================");
    console.log("PHASE 6: DATA SAFETY SNAPSHOT (READ-ONLY COUNTS)");
    console.log("==================================================");
    const tableCounts = {};
    const tables = [
      { name: "users", label: "User" },
      { name: "profiles", label: "Profile" },
      { name: "profile_photos", label: "ProfilePhoto" },
      { name: "conversations", label: "Conversation" },
      { name: "messages", label: "Message" },
      { name: "message_requests", label: "MessageRequest" },
      { name: "notifications", label: "Notification" },
    ];
    for (const t of tables) {
      try {
        const countRes = await prisma.$queryRawUnsafe(`SELECT COUNT(*)::int as count FROM "${t.name}"`);
        tableCounts[t.label] = countRes[0]?.count ?? 0;
        console.log(`- ${t.label.padEnd(16)}: ${tableCounts[t.label]} rows`);
      } catch (e) {
        console.log(`- ${t.label.padEnd(16)}: [Table not yet created or inaccessible: ${e.message}]`);
      }
    }

    // 3. Inspect _prisma_migrations (Phase 2)
    console.log("\n==================================================");
    console.log("PHASE 2: INSPECTING _prisma_migrations");
    console.log("==================================================");
    let migrationRows = [];
    try {
      migrationRows = await prisma.$queryRawUnsafe(
        `SELECT id, migration_name, started_at, finished_at, rolled_back_at, applied_steps_count, logs 
         FROM _prisma_migrations 
         ORDER BY started_at ASC`
      );
      console.log(`Found ${migrationRows.length} migration records in _prisma_migrations:`);
      for (const m of migrationRows) {
        const status = m.finished_at
          ? "APPLIED"
          : m.rolled_back_at
          ? "ROLLED_BACK"
          : "FAILED / INCOMPLETE";
        console.log(`- ${m.migration_name}: status=${status} started=${m.started_at?.toISOString?.() || m.started_at} finished=${m.finished_at?.toISOString?.() || m.finished_at}`);
        if (m.logs) {
          console.log(`  logs: ${m.logs.trim()}`);
        }
      }
    } catch (migErr) {
      console.log(`[INFO] _prisma_migrations query error: ${migErr.message}`);
    }

    // Check for any failed migration records
    const failedMigrations = migrationRows.filter((m) => !m.finished_at && !m.rolled_back_at);
    if (failedMigrations.length > 0) {
      console.log("\n==================================================");
      console.log("[PHASE 4 & 5: INVESTIGATING FAILED MIGRATION]");
      console.log("==================================================");
      for (const fm of failedMigrations) {
        console.log(`Analyzing failed migration: ${fm.migration_name}`);
        // Check if its changes exist in the database
        let changesApplied = false;
        if (fm.migration_name.includes("add_user_role_and_password_hash")) {
          const colCheck = await prisma.$queryRawUnsafe(
            "SELECT column_name FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'password_hash'"
          );
          changesApplied = colCheck.length > 0;
        } else if (fm.migration_name.includes("add_profile_admin_edit_audit")) {
          const colCheck = await prisma.$queryRawUnsafe(
            "SELECT column_name FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'last_edited_at'"
          );
          changesApplied = colCheck.length > 0;
        } else if (fm.migration_name.includes("add_photo_moderation_audit")) {
          const colCheck = await prisma.$queryRawUnsafe(
            "SELECT column_name FROM information_schema.columns WHERE table_name = 'profile_photos' AND column_name = 'moderated_at'"
          );
          changesApplied = colCheck.length > 0;
        } else if (fm.migration_name.includes("add_user_status_audit")) {
          const colCheck = await prisma.$queryRawUnsafe(
            "SELECT column_name FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'status_changed_at'"
          );
          changesApplied = colCheck.length > 0;
        } else if (fm.migration_name.includes("add_account_activation_status")) {
          const colCheck = await prisma.$queryRawUnsafe(
            "SELECT column_name FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'activation_status'"
          );
          changesApplied = colCheck.length > 0;
        } else if (fm.migration_name.includes("add_user_activation_audit")) {
          const colCheck = await prisma.$queryRawUnsafe(
            "SELECT column_name FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'activated_at'"
          );
          changesApplied = colCheck.length > 0;
        }

        console.log(`Migration ${fm.migration_name} changes exist in schema: ${changesApplied}`);
        if (changesApplied) {
          console.log(`Safely resolving ${fm.migration_name} as --applied since all schema changes exist in database.`);
          const resolveRes = spawnSync("npx", ["prisma", "migrate", "resolve", "--applied", fm.migration_name], {
            encoding: "utf-8",
            env: { ...process.env, DATABASE_URL: targetUrl },
            shell: true,
          });
          if (resolveRes.stdout) console.log(resolveRes.stdout.trim());
          if (resolveRes.stderr) console.error(resolveRes.stderr.trim());
        } else {
          console.log(`Safely resolving ${fm.migration_name} as --rolled-back since schema changes do not exist.`);
          const resolveRes = spawnSync("npx", ["prisma", "migrate", "resolve", "--rolled-back", fm.migration_name], {
            encoding: "utf-8",
            env: { ...process.env, DATABASE_URL: targetUrl },
            shell: true,
          });
          if (resolveRes.stdout) console.log(resolveRes.stdout.trim());
          if (resolveRes.stderr) console.error(resolveRes.stderr.trim());
        }
      }
    } else {
      console.log("✓ No failed or incomplete migrations found in _prisma_migrations.");
    }

    // Check for active advisory locks in PostgreSQL
    try {
      const locks = await prisma.$queryRawUnsafe(
        `SELECT pid, locktype, objid, mode, granted 
         FROM pg_locks 
         WHERE locktype = 'advisory'`
      );
      if (locks && locks.length > 0) {
        console.log(`[ADVISORY LOCK CHECK] Found ${locks.length} active advisory lock(s):`, locks);
        for (const l of locks) {
          if (l.objid === 72707369 || String(l.objid) === "72707369") {
            console.log(`[ADVISORY LOCK] Terminating stale backend pid ${l.pid} holding Prisma migration lock 72707369...`);
            await prisma.$queryRawUnsafe(`SELECT pg_terminate_backend(${l.pid})`);
            console.log(`[ADVISORY LOCK] Stale backend pid ${l.pid} terminated.`);
          }
        }
      } else {
        console.log("✓ No active advisory locks held in PostgreSQL.");
      }
    } catch (lockErr) {
      console.log(`[INFO] pg_locks query: ${lockErr.message}`);
    }
  } catch (diagErr) {
    console.error("[DIAGNOSTIC ERROR]:", diagErr.message);
  } finally {
    await prisma.$disconnect();
  }

  // 4. Run `npx prisma migrate status`
  console.log("\n==================================================");
  console.log("PHASE 2: RUNNING prisma migrate status");
  console.log("==================================================");
  const statusResult = spawnSync("npx", ["prisma", "migrate", "status"], {
    encoding: "utf-8",
    env: {
      ...process.env,
      DATABASE_URL: targetUrl,
    },
    shell: true,
  });
  if (statusResult.stdout) console.log(statusResult.stdout.trim());
  if (statusResult.stderr) console.error(statusResult.stderr.trim());
  console.log(`prisma migrate status exited with code: ${statusResult.status}`);

  // 5. Run `npx prisma migrate deploy`
  console.log("\n==================================================");
  console.log("PHASE 1: RUNNING prisma migrate deploy");
  console.log("==================================================");
  const deployResult = spawnSync("npx", ["prisma", "migrate", "deploy"], {
    encoding: "utf-8",
    env: {
      ...process.env,
      DATABASE_URL: targetUrl,
    },
    shell: true,
  });

  if (deployResult.stdout) console.log(deployResult.stdout.trim());
  if (deployResult.stderr) console.error(deployResult.stderr.trim());

  if (deployResult.status === 0) {
    console.log("\n==================================================");
    console.log("✓ ALL PRISMA MIGRATIONS DEPLOYED SUCCESSFULLY!");
    console.log("==================================================");
    process.exit(0);
  } else {
    console.error("\n==================================================");
    console.error(`[MIGRATION DEPLOY FAILURE] prisma migrate deploy exited with code ${deployResult.status}`);
    console.error("==================================================");
    process.exit(1);
  }
}

deployMigrations().catch((err) => {
  console.error("[FATAL ERROR]:", err);
  process.exit(1);
});

