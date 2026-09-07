/**
 * Manglam Matrimony — Production Photo Migration: Local Filesystem -> Cloudflare R2
 *
 * Usage:
 *   npx tsx scripts/migrate-local-photos-to-r2.ts --dry-run
 *   npx tsx scripts/migrate-local-photos-to-r2.ts
 *
 * Safety Guarantees:
 *   1. Non-destructive: Never deletes local storage files.
 *   2. Idempotent: Skips photos already uploaded to R2.
 *   3. Missing File Safety: If local file is missing, does NOT mutate DB record or crash.
 *   4. Dry Run: Full inspection and reporting without modifying DB or R2.
 */

import fs from "fs";
import path from "path";
import { prisma } from "../src/config/database";
import { config } from "../src/config/env";
import { R2StorageProvider } from "../src/providers/storage/R2StorageProvider";

interface MigrationReport {
  totalRecords: number;
  alreadyInR2: number;
  migrated: number;
  missingLocalFile: number;
  failed: number;
  localFilesRetained: number;
  dryRun: boolean;
}

async function runMigration() {
  const isDryRun = process.argv.includes("--dry-run");

  console.log("===============================================================");
  console.log(" MANGLAM MATRIMONY — PHOTO STORAGE MIGRATION TO CLOUDFLARE R2");
  console.log("===============================================================");
  console.log(`Execution Mode: ${isDryRun ? "DRY RUN (No changes will be applied)" : "LIVE MIGRATION"}`);
  console.log(`Local Storage Base: ${path.resolve(process.cwd(), config.photo.storageBasePath)}`);
  console.log(`Target R2 Bucket: ${config.photo.r2.bucketName || "(Not configured)"}`);
  console.log(`CDN Base URL: ${config.photo.r2.publicBaseUrl || "(Not configured)"}`);
  console.log("---------------------------------------------------------------\n");

  let r2Provider: R2StorageProvider | null = null;
  if (!isDryRun) {
    const { accountId, accessKeyId, secretAccessKey, bucketName } = config.photo.r2;
    if (!accountId || !accessKeyId || !secretAccessKey || !bucketName) {
      console.error(
        "[MIGRATION ERROR] Missing required Cloudflare R2 environment variables.\n" +
        "Please ensure R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, and R2_BUCKET_NAME are set in .env.\n" +
        "You can run with --dry-run to simulate the migration plan without live R2 credentials."
      );
      process.exit(1);
    }
    r2Provider = new R2StorageProvider();
  }

  const photos = await prisma.profilePhoto.findMany({
    orderBy: { createdAt: "asc" },
  });

  const report: MigrationReport = {
    totalRecords: photos.length,
    alreadyInR2: 0,
    migrated: 0,
    missingLocalFile: 0,
    failed: 0,
    localFilesRetained: 0,
    dryRun: isDryRun,
  };

  console.log(`Found ${photos.length} total photo record(s) in database.\n`);

  for (let i = 0; i < photos.length; i++) {
    const photo = photos[i];
    const prefix = `[${i + 1}/${photos.length}] Photo ID: ${photo.id}`;

    // 1. Check if already migrated to R2
    if (photo.storageProvider === "r2") {
      console.log(`${prefix} -> Already marked as R2. Skipping.`);
      report.alreadyInR2++;
      continue;
    }

    // 2. Locate local file on disk
    const localFilePath = path.resolve(
      process.cwd(),
      config.photo.storageBasePath,
      photo.storageKey
    );

    const existsLocally = fs.existsSync(localFilePath);
    if (!existsLocally) {
      console.warn(
        `${prefix} -> [MISSING LOCAL FILE] Expected path: ${localFilePath}. Skipping without DB mutation.`
      );
      report.missingLocalFile++;
      continue;
    }

    report.localFilesRetained++;

    // 3. Compute canonical R2 key
    const canonicalKey = `profiles/${photo.profileId}/photos/${photo.id}/display.webp`;

    if (isDryRun) {
      console.log(
        `${prefix} -> [DRY RUN PLAN] Would upload ${localFilePath} -> ${canonicalKey} and update DB record to storageProvider='r2'.`
      );
      report.migrated++;
      continue;
    }

    // 4. Live migration
    try {
      if (!r2Provider) {
        throw new Error("R2 provider not initialized");
      }

      // Read local buffer
      const fileBuffer = await fs.promises.readFile(localFilePath);

      // Check if already in R2 bucket
      const alreadyInBucket = await r2Provider.exists(canonicalKey);
      if (!alreadyInBucket) {
        await r2Provider.upload(fileBuffer, {
          profileId: photo.profileId,
          photoId: photo.id,
          originalFileName: photo.originalFileName,
          mimeType: photo.mimeType,
        });
      }

      // Update DB record
      await prisma.profilePhoto.update({
        where: { id: photo.id },
        data: {
          storageKey: canonicalKey,
          storageProvider: "r2",
        },
      });

      console.log(
        `${prefix} -> Successfully uploaded to R2 (${canonicalKey}) and updated DB record.`
      );
      report.migrated++;
    } catch (err) {
      console.error(`${prefix} -> [UPLOAD FAILED]:`, err instanceof Error ? err.message : err);
      report.failed++;
    }
  }

  console.log("\n===============================================================");
  console.log(" MIGRATION SUMMARY REPORT");
  console.log("===============================================================");
  console.log(`Mode:                     ${report.dryRun ? "DRY RUN" : "LIVE"}`);
  console.log(`Total DB Records:         ${report.totalRecords}`);
  console.log(`Already in R2:            ${report.alreadyInR2}`);
  console.log(`Migrated / Planned:       ${report.migrated}`);
  console.log(`Missing Local Files:      ${report.missingLocalFile} (Preserved safely)`);
  console.log(`Failed Uploads:           ${report.failed}`);
  console.log(`Local Files Retained:     ${report.localFilesRetained} (Zero local files deleted)`);
  console.log("===============================================================\n");

  if (report.missingLocalFile > 0) {
    console.log(
      `ℹ Note: ${report.missingLocalFile} photo record(s) had missing physical files on local disk (likely from previous test seeds).\n` +
      `These records were left intact in the database without modification.`
    );
  }

  await prisma.$disconnect();
}

runMigration().catch((err) => {
  console.error("[FATAL MIGRATION ERROR]:", err);
  process.exit(1);
});
