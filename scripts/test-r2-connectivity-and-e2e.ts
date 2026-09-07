/**
 * Manglam Matrimony — Safe Cloudflare R2 Connectivity & Pipeline Verification Script
 *
 * Requirements:
 * 1. Verify required environment variables (without leaking secrets).
 * 2. Upload tiny temporary test object: test/r2-connectivity/{unique-id}.txt
 * 3. Verify exists using HeadObject.
 * 4. Read back using GetObject and verify contents.
 * 5. Delete temporary object and verify removal.
 * 6. Never touch existing user photos or production DB records.
 * 7. E2E photo pipeline test against R2 with automatic cleanup.
 */

import crypto from "crypto";
import http from "http";
import https from "https";
import sharp from "sharp";
import {
  S3Client,
  PutObjectCommand,
  HeadObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { config } from "../src/config/env";
import { prisma } from "../src/config/database";
import { R2StorageProvider } from "../src/providers/storage/R2StorageProvider";
import { photoService } from "../src/services/photo.service";
import { resolvePhotoPublicUrl } from "../src/providers/storage";

interface TestReport {
  connectivity: {
    status: "SKIPPED" | "PASSED" | "FAILED";
    details?: string;
    missingVars?: string[];
  };
  pipeline: {
    status: "SKIPPED" | "PASSED" | "FAILED";
    uploadResult?: boolean;
    storageProviderVerified?: boolean;
    storageKeyVerified?: boolean;
    r2ObjectExists?: boolean;
    cdnUrlResolved?: string;
    cdnFetchStatus?: number | string;
    deletionResult?: boolean;
    dbCleanupResult?: boolean;
    error?: string;
  };
}

// Helper to fetch URL without external dependencies
function fetchUrlStatus(urlStr: string): Promise<{ statusCode: number; contentType?: string; error?: string }> {
  return new Promise((resolve) => {
    try {
      const parsed = new URL(urlStr);
      const client = parsed.protocol === "https:" ? https : http;
      const req = client.get(
        urlStr,
        {
          headers: { "User-Agent": "ManglamMatrimony-R2Verification/1.0" },
          timeout: 5000,
        },
        (res) => {
          resolve({
            statusCode: res.statusCode || 0,
            contentType: res.headers["content-type"],
          });
          res.resume(); // consume response to free memory
        }
      );

      req.on("error", (err) => {
        resolve({ statusCode: 0, error: err.message });
      });

      req.on("timeout", () => {
        req.destroy();
        resolve({ statusCode: 0, error: "Connection timed out" });
      });
    } catch (err) {
      resolve({ statusCode: 0, error: err instanceof Error ? err.message : String(err) });
    }
  });
}

export async function runR2Verification(): Promise<TestReport> {
  console.log("===============================================================");
  console.log(" MANGLAM MATRIMONY — CLOUDFLARE R2 LOCAL VERIFICATION");
  console.log("===============================================================\n");

  const report: TestReport = {
    connectivity: { status: "SKIPPED" },
    pipeline: { status: "SKIPPED" },
  };

  // 1. Check required environment variables
  console.log("Checking R2 environment configuration...");
  const missingVars: string[] = [];
  if (!config.photo.r2.accountId) missingVars.push("R2_ACCOUNT_ID");
  if (!config.photo.r2.accessKeyId) missingVars.push("R2_ACCESS_KEY_ID");
  if (!config.photo.r2.secretAccessKey) missingVars.push("R2_SECRET_ACCESS_KEY");
  if (!config.photo.r2.bucketName) missingVars.push("R2_BUCKET_NAME");

  if (missingVars.length > 0) {
    console.warn(`[CONFIG WARNING] Missing required R2 environment variable(s): ${missingVars.join(", ")}`);
    console.log("Live R2 connectivity and live pipeline tests require valid Cloudflare R2 credentials.");
    console.log("Note: To run live R2 tests, provide the missing variable names in .env.\n");
    report.connectivity = {
      status: "SKIPPED",
      missingVars,
      details: `Missing environment variable(s): ${missingVars.join(", ")}`,
    };
    return report;
  }

  console.log("✓ All required R2 environment variable names are present.");
  const maskedAccount = config.photo.r2.accountId.length > 6
    ? `${config.photo.r2.accountId.slice(0, 4)}...${config.photo.r2.accountId.slice(-2)}`
    : "***";
  console.log(`  Target Bucket:  ${config.photo.r2.bucketName}`);
  console.log(`  Account ID:     ${maskedAccount}`);
  console.log(`  CDN Base URL:   ${config.photo.r2.publicBaseUrl || "(none configured)"}`);
  console.log(`  Storage Provider: ${config.photo.storageProvider}\n`);

  const s3Client = new S3Client({
    region: "auto",
    endpoint: `https://${config.photo.r2.accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: config.photo.r2.accessKeyId,
      secretAccessKey: config.photo.r2.secretAccessKey,
    },
  });

  // -------------------------------------------------------------
  // TEST PART 1: Safe Isolated Connectivity Test
  // -------------------------------------------------------------
  console.log("--- 1. Safe Isolated R2 Connectivity Test ---");
  const uniqueId = `conn_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
  const testObjectKey = `test/r2-connectivity/${uniqueId}.txt`;
  const testPayload = `Manglam Matrimony R2 Connectivity Test Token: ${uniqueId}`;

  try {
    // 1. Upload temporary test object
    console.log(`  Uploading temporary probe: ${testObjectKey}...`);
    await s3Client.send(
      new PutObjectCommand({
        Bucket: config.photo.r2.bucketName,
        Key: testObjectKey,
        Body: Buffer.from(testPayload, "utf-8"),
        ContentType: "text/plain; charset=utf-8",
        Metadata: { purpose: "connectivity-check" },
      })
    );
    console.log("  ✔ PutObject succeeded.");

    // 2. Verify exists using HeadObject
    console.log("  Verifying object exists using HeadObject...");
    const headRes = await s3Client.send(
      new HeadObjectCommand({
        Bucket: config.photo.r2.bucketName,
        Key: testObjectKey,
      })
    );
    if (!headRes.ContentLength || headRes.ContentLength <= 0) {
      throw new Error("HeadObject returned 0 ContentLength");
    }
    console.log(`  ✔ HeadObject confirmed existence (size: ${headRes.ContentLength} bytes).`);

    // 3. Read back using GetObject and verify contents
    console.log("  Reading back object using GetObject...");
    const getRes = await s3Client.send(
      new GetObjectCommand({
        Bucket: config.photo.r2.bucketName,
        Key: testObjectKey,
      })
    );
    if (!getRes.Body) {
      throw new Error("GetObject returned empty Body");
    }
    const chunks: Buffer[] = [];
    for await (const chunk of getRes.Body as any) {
      chunks.push(Buffer.from(chunk));
    }
    const retrievedPayload = Buffer.concat(chunks).toString("utf-8");
    if (retrievedPayload !== testPayload) {
      throw new Error(`Payload mismatch: expected "${testPayload}", received "${retrievedPayload}"`);
    }
    console.log("  ✔ GetObject retrieved and verified matching payload.");

    // 4. Delete the temporary object
    console.log("  Deleting temporary probe...");
    await s3Client.send(
      new DeleteObjectCommand({
        Bucket: config.photo.r2.bucketName,
        Key: testObjectKey,
      })
    );
    console.log("  ✔ DeleteObject succeeded.");

    // 5. Verify deletion
    console.log("  Verifying deletion using HeadObject...");
    let deletionVerified = false;
    try {
      await s3Client.send(
        new HeadObjectCommand({
          Bucket: config.photo.r2.bucketName,
          Key: testObjectKey,
        })
      );
    } catch (err: any) {
      if (err?.$metadata?.httpStatusCode === 404 || err?.name === "NotFound" || err?.name === "NoSuchKey") {
        deletionVerified = true;
      }
    }

    if (!deletionVerified) {
      throw new Error("Object still exists after delete command!");
    }
    console.log("  ✔ HeadObject confirmed object is permanently removed.");

    report.connectivity = {
      status: "PASSED",
      details: `Bucket "${config.photo.r2.bucketName}" verified: PutObject, HeadObject, GetObject, DeleteObject passed.`,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("  ✖ R2 Connectivity Test Failed:", msg);
    report.connectivity = {
      status: "FAILED",
      details: msg,
    };
    return report;
  }

  // -------------------------------------------------------------
  // TEST PART 2: Actual Photo Pipeline Test against R2
  // -------------------------------------------------------------
  console.log("\n--- 2. End-to-End Photo Pipeline Test Against R2 ---");
  report.pipeline = { status: "FAILED" };

  // Set active provider to R2 in config for this test
  const originalProvider = config.photo.storageProvider;
  (config.photo as any).storageProvider = "r2";

  // Create temporary test user & profile in database
  const testUserId = `test_r2_user_${Date.now()}`;
  let createdProfileId: string | null = null;
  let uploadedPhotoId: string | null = null;
  let canonicalStorageKey: string | null = null;

  try {
    console.log("  Creating temporary test user and profile in local database...");
    const user = await prisma.user.create({
      data: {
        id: testUserId,
        email: `${testUserId}@example.com`,
        emailVerifiedAt: new Date(),
        status: "ACTIVE",
      },
    });

    const profile = await prisma.profile.create({
      data: {
        userId: user.id,
        profileCreatedFor: "MYSELF",
        profileStatus: "IN_REVIEW",
        completionPercentage: 50,
      },
    });
    createdProfileId = profile.id;
    console.log(`  ✔ Temporary test profile created: ${createdProfileId}`);

    // Generate valid 400x500 JPEG test image
    console.log("  Generating valid test image buffer (400x500 JPEG)...");
    const testImageBuffer = await sharp({
      create: {
        width: 400,
        height: 500,
        channels: 3,
        background: { r: 180, g: 120, b: 80 },
      },
    })
      .jpeg()
      .toBuffer();

    const mockMulterFile: Express.Multer.File = {
      fieldname: "photo",
      originalname: "test_r2_photo.jpg",
      encoding: "7bit",
      mimetype: "image/jpeg",
      size: testImageBuffer.length,
      buffer: testImageBuffer,
      destination: "",
      filename: "",
      path: "",
      stream: null as any,
    };

    // Upload through photoService
    console.log("  Uploading through PhotoService.uploadPhoto()...");
    const uploadRes = await photoService.uploadPhoto(testUserId, mockMulterFile);
    if (!uploadRes.success || !uploadRes.data) {
      throw new Error(`PhotoService.uploadPhoto failed: ${uploadRes.code} - ${uploadRes.message}`);
    }

    uploadedPhotoId = uploadRes.data.photo.id;
    const resolvedUrl = uploadRes.data.photo.url;
    console.log(`  ✔ Photo uploaded. Photo ID: ${uploadedPhotoId}`);
    console.log(`  ✔ Returned URL: ${resolvedUrl}`);

    // Verify database record
    console.log("  Checking PostgreSQL ProfilePhoto record...");
    const dbPhoto = await prisma.profilePhoto.findUnique({
      where: { id: uploadedPhotoId },
    });

    if (!dbPhoto) {
      throw new Error("ProfilePhoto record not found in database");
    }
    if (dbPhoto.storageProvider !== "r2") {
      throw new Error(`Expected storageProvider 'r2', found '${dbPhoto.storageProvider}'`);
    }

    canonicalStorageKey = dbPhoto.storageKey;
    const expectedPrefix = `profiles/${createdProfileId}/photos/`;
    const expectedSuffix = `/display.webp`;
    if (!canonicalStorageKey.startsWith(expectedPrefix) || !canonicalStorageKey.endsWith(expectedSuffix)) {
      throw new Error(`Storage key '${canonicalStorageKey}' does not match pattern '${expectedPrefix}*${expectedSuffix}'`);
    }
    console.log(`  ✔ Database record verified: storageProvider=r2, storageKey=${canonicalStorageKey}`);

    // Verify object exists in R2 bucket
    console.log("  Verifying actual R2 object existence via HeadObject...");
    const r2Head = await s3Client.send(
      new HeadObjectCommand({
        Bucket: config.photo.r2.bucketName,
        Key: canonicalStorageKey,
      })
    );
    console.log(
      `  ✔ Cloudflare R2 object exists (Size: ${r2Head.ContentLength} bytes, ContentType: ${r2Head.ContentType}, CacheControl: ${r2Head.CacheControl})`
    );

    // Verify CDN URL resolution
    if (config.photo.r2.publicBaseUrl) {
      const expectedCdnUrl = `${config.photo.r2.publicBaseUrl}/${canonicalStorageKey}`;
      if (resolvedUrl !== expectedCdnUrl) {
        throw new Error(`Returned URL '${resolvedUrl}' did not match expected CDN URL '${expectedCdnUrl}'`);
      }
      console.log(`  ✔ CDN URL matches: ${resolvedUrl}`);

      // Attempt CDN probe
      console.log(`  Probing CDN URL: ${resolvedUrl}...`);
      const cdnProbe = await fetchUrlStatus(resolvedUrl);
      report.pipeline.cdnFetchStatus = cdnProbe.statusCode || cdnProbe.error || "unknown";
      if (cdnProbe.statusCode === 200) {
        console.log(`  ✔ CDN URL returned HTTP 200 OK (${cdnProbe.contentType})`);
      } else {
        console.log(
          `  ℹ CDN URL returned ${cdnProbe.statusCode || "N/A"} (${cdnProbe.error || "Pending DNS propagation or custom domain setup in Cloudflare"})`
        );
      }
    }

    // Delete photo through application flow
    console.log("  Deleting photo through PhotoService.deletePhoto()...");
    const deleteRes = await photoService.deletePhoto(testUserId, uploadedPhotoId);
    if (!deleteRes.success) {
      throw new Error(`PhotoService.deletePhoto failed: ${deleteRes.code} - ${deleteRes.message}`);
    }
    console.log("  ✔ PhotoService.deletePhoto succeeded.");

    // Verify DB record is deleted
    console.log("  Verifying database record is removed...");
    const dbCheckAfterDelete = await prisma.profilePhoto.findUnique({
      where: { id: uploadedPhotoId },
    });
    if (dbCheckAfterDelete) {
      throw new Error("ProfilePhoto still exists in database after deletePhoto!");
    }
    console.log("  ✔ Database record successfully removed.");

    // Verify R2 object is removed
    console.log("  Verifying R2 object is removed via HeadObject...");
    let r2ObjectRemoved = false;
    try {
      await s3Client.send(
        new HeadObjectCommand({
          Bucket: config.photo.r2.bucketName,
          Key: canonicalStorageKey,
        })
      );
    } catch (err: any) {
      if (err?.$metadata?.httpStatusCode === 404 || err?.name === "NotFound" || err?.name === "NoSuchKey") {
        r2ObjectRemoved = true;
      }
    }

    if (!r2ObjectRemoved) {
      throw new Error("R2 object still exists in bucket after deletePhoto!");
    }
    console.log("  ✔ Cloudflare R2 object successfully removed from bucket.");

    report.pipeline = {
      status: "PASSED",
      uploadResult: true,
      storageProviderVerified: true,
      storageKeyVerified: true,
      r2ObjectExists: true,
      cdnUrlResolved: resolvedUrl,
      cdnFetchStatus: report.pipeline.cdnFetchStatus,
      deletionResult: true,
      dbCleanupResult: true,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("  ✖ Pipeline Test Failed:", msg);
    report.pipeline = {
      status: "FAILED",
      error: msg,
    };
  } finally {
    // Restore config
    (config.photo as any).storageProvider = originalProvider;

    // Clean up temporary database entities
    if (createdProfileId) {
      await prisma.profile.deleteMany({ where: { id: createdProfileId } }).catch(() => {});
    }
    if (testUserId) {
      await prisma.user.deleteMany({ where: { id: testUserId } }).catch(() => {});
    }
  }

  return report;
}

// Auto-run if executed directly
if (require.main === module) {
  runR2Verification()
    .then((report) => {
      console.log("\n===============================================================");
      console.log(" VERIFICATION SUMMARY");
      console.log("===============================================================");
      console.log(`R2 Connectivity: ${report.connectivity.status}`);
      if (report.connectivity.details) {
        console.log(`  Details: ${report.connectivity.details}`);
      }
      console.log(`R2 Pipeline E2E: ${report.pipeline.status}`);
      if (report.pipeline.error) {
        console.log(`  Error:   ${report.pipeline.error}`);
      }
      console.log("===============================================================\n");

      prisma.$disconnect().then(() => {
        if (report.connectivity.status === "FAILED" || report.pipeline.status === "FAILED") {
          process.exit(1);
        }
        process.exit(0);
      });
    })
    .catch((err) => {
      console.error("Fatal test runner error:", err);
      process.exit(1);
    });
}
