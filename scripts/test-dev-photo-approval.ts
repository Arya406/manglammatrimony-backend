import http from "http";
import jwt from "jsonwebtoken";
import { app } from "../src/app";
import { prisma } from "../src/config/database";
import { config } from "../src/config/env";

function createTestPng(width: number, height: number): Buffer {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData.writeUInt8(8, 8);
  ihdrData.writeUInt8(2, 9);
  ihdrData.writeUInt8(0, 10);
  ihdrData.writeUInt8(0, 11);
  ihdrData.writeUInt8(0, 12);

  const crcTable = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    crcTable[n] = c;
  }
  function crc32(buf: Buffer): number {
    let crc = -1;
    for (let i = 0; i < buf.length; i++) {
      crc = (crc >>> 8) ^ crcTable[(crc ^ buf[i]) & 0xff];
    }
    return (crc ^ -1) >>> 0;
  }

  function createChunk(type: string, data: Buffer): Buffer {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const typeBuf = Buffer.from(type, "ascii");
    const crcBuf = Buffer.alloc(4);
    crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
    return Buffer.concat([len, typeBuf, data, crcBuf]);
  }

  const ihdrChunk = createChunk("IHDR", ihdrData);
  const rowSize = 1 + width * 3;
  const rawData = Buffer.alloc(rowSize * height);
  for (let y = 0; y < height; y++) {
    const rowOffset = y * rowSize;
    rawData[rowOffset] = 0;
    for (let x = 0; x < width; x++) {
      const pixelOffset = rowOffset + 1 + x * 3;
      rawData[pixelOffset] = (x * 2) % 255;
      rawData[pixelOffset + 1] = (y * 3) % 255;
      rawData[pixelOffset + 2] = 150;
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const zlib = require("zlib");
  const compressed = zlib.deflateSync(rawData);
  const idatChunk = createChunk("IDAT", compressed);
  const iendChunk = createChunk("IEND", Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

function createMultipartBody(
  fieldName: string,
  fileName: string,
  mimeType: string,
  fileBuffer: Buffer
): { body: Buffer; boundary: string } {
  const boundary = `----WebKitFormBoundary${Date.now().toString(16)}`;
  const head = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="${fieldName}"; filename="${fileName}"\r\nContent-Type: ${mimeType}\r\n\r\n`
  );
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
  return {
    body: Buffer.concat([head, fileBuffer, tail]),
    boundary,
  };
}

async function runDevPhotoApprovalSuite() {
  const PORT = 5566;
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(PORT, resolve));
  console.log(`[TEST SERVER] Running on port ${PORT}`);

  const BASE_URL = `http://localhost:${PORT}`;
  const createdUserIds: string[] = [];

  try {
    console.log("===============================================================");
    console.log("MANGLAM MATRIMONY — DEV-ONLY PHOTO APPROVAL TEST BATTERY");
    console.log("===============================================================");

    // 1. Create User 1 & initialize profile
    const user1 = await prisma.user.create({
      data: {
        phone: `+9198${Math.floor(10000000 + Math.random() * 90000000)}`,
        status: "ACTIVE",
      },
    });
    createdUserIds.push(user1.id);

    const token1 = jwt.sign(
      { userId: user1.id, phone: user1.phone, status: "ACTIVE" },
      process.env.JWT_SECRET || "manglam_matrimony_jwt_secret_dev_key_2026_secure",
      { expiresIn: "7d" }
    );

    // Initialize Profile for User 1
    const initRes = await fetch(`${BASE_URL}/api/profile`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token1}`,
      },
      body: JSON.stringify({ profileCreatedFor: "MYSELF" }),
    });
    const initJson = await initRes.json();
    console.log(`[INIT] User 1 Profile initialized: ${initJson.data?.profile?.id}`);

    // Upload photo for User 1 (starts with PENDING)
    const photoBuf = createTestPng(300, 300);
    const form1 = createMultipartBody("photo", "user1_photo.png", "image/png", photoBuf);

    const uploadRes = await fetch(`${BASE_URL}/api/profile/photos`, {
      method: "POST",
      headers: {
        "Content-Type": `multipart/form-data; boundary=${form1.boundary}`,
        Authorization: `Bearer ${token1}`,
      },
      body: form1.body,
    });
    const uploadJson = await uploadRes.json();
    const photo1Id = uploadJson.data?.photo?.id;
    console.log(`[UPLOAD] User 1 Photo uploaded: ${photo1Id} | Initial Status: ${uploadJson.data?.photo?.moderationStatus}`);
    if (uploadJson.data?.photo?.moderationStatus !== "PENDING") {
      throw new Error("Initial upload must be PENDING");
    }

    // -------------------------------------------------------------
    // SCENARIO 1: Unauthenticated request must return 401
    // -------------------------------------------------------------
    console.log("\n[SCENARIO 1] Unauthenticated Dev Approval");
    const unauthRes = await fetch(`${BASE_URL}/api/profile/photos/${photo1Id}/dev-approve`, {
      method: "POST",
    });
    console.log(`  ✓ Status: ${unauthRes.status} (Expected 401)`);
    if (unauthRes.status !== 401) {
      throw new Error("Scenario 1 Failed: Unauthenticated request should be rejected with 401");
    }

    // -------------------------------------------------------------
    // SCENARIO 2: Non-existent photoId must return 404
    // -------------------------------------------------------------
    console.log("\n[SCENARIO 2] Non-existent photoId Dev Approval");
    const notFoundRes = await fetch(`${BASE_URL}/api/profile/photos/00000000-0000-0000-0000-000000000000/dev-approve`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token1}` },
    });
    console.log(`  ✓ Status: ${notFoundRes.status} (Expected 404)`);
    if (notFoundRes.status !== 404) {
      throw new Error("Scenario 2 Failed: Non-existent photo should return 404");
    }

    // -------------------------------------------------------------
    // SCENARIO 3: Cross-user authorization check (User 2 cannot approve User 1's photo)
    // -------------------------------------------------------------
    console.log("\n[SCENARIO 3] Cross-User Security Check");
    const user2 = await prisma.user.create({
      data: {
        phone: `+9197${Math.floor(10000000 + Math.random() * 90000000)}`,
        status: "ACTIVE",
      },
    });
    createdUserIds.push(user2.id);

    const token2 = jwt.sign(
      { userId: user2.id, phone: user2.phone, status: "ACTIVE" },
      process.env.JWT_SECRET || "manglam_matrimony_jwt_secret_dev_key_2026_secure",
      { expiresIn: "7d" }
    );

    // Initialize Profile for User 2
    await fetch(`${BASE_URL}/api/profile`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token2}`,
      },
      body: JSON.stringify({ profileCreatedFor: "MYSELF" }),
    });

    const crossUserRes = await fetch(`${BASE_URL}/api/profile/photos/${photo1Id}/dev-approve`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token2}` },
    });
    console.log(`  ✓ Status: ${crossUserRes.status} (Expected 404)`);
    if (crossUserRes.status !== 404) {
      throw new Error("Scenario 3 Failed: User 2 must NOT be able to approve User 1's photo");
    }

    // -------------------------------------------------------------
    // SCENARIO 4: Dev Approval for Owner's PENDING photo -> APPROVED
    // -------------------------------------------------------------
    console.log("\n[SCENARIO 4] Owner Dev Approval for PENDING Photo");
    const approveRes = await fetch(`${BASE_URL}/api/profile/photos/${photo1Id}/dev-approve`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token1}` },
    });
    const approveJson = await approveRes.json();
    console.log(`  ✓ Status: ${approveRes.status} | ModerationStatus: ${approveJson.data?.moderationStatus}`);
    if (approveRes.status !== 200 || approveJson.data?.moderationStatus !== "APPROVED") {
      throw new Error("Scenario 4 Failed: Dev approval should update status to APPROVED");
    }

    // Direct PostgreSQL assertion
    const dbPhoto = await prisma.profilePhoto.findUnique({ where: { id: photo1Id } });
    console.log(`  ✓ PostgreSQL Verification: Photo moderationStatus = ${dbPhoto?.moderationStatus}`);
    if (dbPhoto?.moderationStatus !== "APPROVED") {
      throw new Error("Scenario 4 Failed: PostgreSQL moderationStatus is not APPROVED");
    }

    // -------------------------------------------------------------
    // SCENARIO 5: Idempotent call on already APPROVED photo -> 200 OK
    // -------------------------------------------------------------
    console.log("\n[SCENARIO 5] Idempotent Dev Approval for Already APPROVED Photo");
    const reApproveRes = await fetch(`${BASE_URL}/api/profile/photos/${photo1Id}/dev-approve`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token1}` },
    });
    const reApproveJson = await reApproveRes.json();
    console.log(`  ✓ Status: ${reApproveRes.status} | ModerationStatus: ${reApproveJson.data?.moderationStatus}`);
    if (reApproveRes.status !== 200 || reApproveJson.data?.moderationStatus !== "APPROVED") {
      throw new Error("Scenario 5 Failed: Idempotent call on APPROVED photo should succeed");
    }

    // -------------------------------------------------------------
    // SCENARIO 6: Attempting to approve a REJECTED photo -> returns 400
    // -------------------------------------------------------------
    console.log("\n[SCENARIO 6] Attempting Dev Approval for REJECTED Photo");
    // Manually set photo to REJECTED in database
    await prisma.profilePhoto.update({
      where: { id: photo1Id },
      data: { moderationStatus: "REJECTED" },
    });

    const rejectedApproveRes = await fetch(`${BASE_URL}/api/profile/photos/${photo1Id}/dev-approve`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token1}` },
    });
    const rejectedApproveJson = await rejectedApproveRes.json();
    console.log(`  ✓ Status: ${rejectedApproveRes.status} (Expected 400) | Code: ${rejectedApproveJson.code}`);
    if (rejectedApproveRes.status !== 400 || rejectedApproveJson.code !== "PHOTO_REJECTED") {
      throw new Error("Scenario 6 Failed: Dev approval must reject REJECTED photos");
    }

    // Reset photo back to APPROVED for subsequent tests
    await prisma.profilePhoto.update({
      where: { id: photo1Id },
      data: { moderationStatus: "APPROVED" },
    });

    // -------------------------------------------------------------
    // SCENARIO 7: Disabled in Production Mode (Simulated Guard)
    // -------------------------------------------------------------
    console.log("\n[SCENARIO 7] Disabled in Production Mode");
    const origEnv = config.nodeEnv;
    (config as any).nodeEnv = "production";

    const prodRes = await fetch(`${BASE_URL}/api/profile/photos/${photo1Id}/dev-approve`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token1}` },
    });
    const prodJson = await prodRes.json();
    console.log(`  ✓ Status: ${prodRes.status} (Expected 403) | Code: ${prodJson.code}`);
    (config as any).nodeEnv = origEnv; // Restore
    if (prodRes.status !== 403 || prodJson.code !== "DEV_FEATURE_DISABLED") {
      throw new Error("Scenario 7 Failed: Endpoint must return 403 DEV_FEATURE_DISABLED in production");
    }

    // -------------------------------------------------------------
    // SCENARIO 8: Disabled when DEV_PHOTO_APPROVAL_ENABLED is false
    // -------------------------------------------------------------
    console.log("\n[SCENARIO 8] Disabled when DEV_PHOTO_APPROVAL_ENABLED=false");
    (config as any).devPhotoApprovalEnabled = false;

    const flagDisabledRes = await fetch(`${BASE_URL}/api/profile/photos/${photo1Id}/dev-approve`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token1}` },
    });
    const flagDisabledJson = await flagDisabledRes.json();
    console.log(`  ✓ Status: ${flagDisabledRes.status} (Expected 403) | Code: ${flagDisabledJson.code}`);
    (config as any).devPhotoApprovalEnabled = true; // Restore
    if (flagDisabledRes.status !== 403 || flagDisabledJson.code !== "DEV_FEATURE_DISABLED") {
      throw new Error("Scenario 8 Failed: Endpoint must return 403 DEV_FEATURE_DISABLED when flag is false");
    }

    // -------------------------------------------------------------
    // SCENARIO 9: Submission endpoint requires approved photo
    // -------------------------------------------------------------
    console.log("\n[SCENARIO 9] Submission requires at least one APPROVED photo");
    // For User 2 (no photos uploaded yet), submission must fail with NO_APPROVED_PHOTO / missing sections
    const user2SubmitRes = await fetch(`${BASE_URL}/api/profile/submit`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token2}`,
      },
      body: JSON.stringify({}),
    });
    console.log(`  ✓ Status: ${user2SubmitRes.status} (Expected 400)`);
    if (user2SubmitRes.status !== 400) {
      throw new Error("Scenario 9 Failed: Incomplete profile submission was not rejected");
    }

    console.log("\n===============================================================");
    console.log("✅ ALL 9 DEV PHOTO APPROVAL SCENARIOS PASSED (100%)!");
    console.log("===============================================================");
  } catch (err) {
    console.error("Dev Photo Approval Test Failure:", err);
    process.exit(1);
  } finally {
    for (const uid of createdUserIds) {
      await prisma.user.delete({ where: { id: uid } }).catch(() => {});
    }
    console.log(`[CLEANUP] Deleted ${createdUserIds.length} test user(s).`);
    server.close();
    await prisma.$disconnect();
    process.exit(0);
  }
}

runDevPhotoApprovalSuite();
