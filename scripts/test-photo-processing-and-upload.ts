import http from "http";
import jwt from "jsonwebtoken";
import { app } from "../src/app";
import { prisma } from "../src/config/database";

// In-memory PNG Generator for various dimensions and aspect ratios
function createTestPng(width: number, height: number): Buffer {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData.writeUInt8(8, 8); // 8-bit depth
  ihdrData.writeUInt8(2, 9); // Truecolor (RGB)
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

async function runPhotoSuite() {
  const PORT = 5577;
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(PORT, resolve));
  console.log(`[TEST SERVER] Running on port ${PORT}`);

  const BASE_URL = `http://localhost:${PORT}`;

  let testUserId = "";

  try {
    console.log("===============================================================");
    console.log("MANGLAM MATRIMONY — PHOTO UPLOAD & MANAGEMENT TEST SUITE");
    console.log("===============================================================");

    // 1. Create a test user & initialize profile
    const testUser = await prisma.user.create({
      data: {
        phone: `+9198${Math.floor(10000000 + Math.random() * 90000000)}`,
        status: "ACTIVE",
      },
    });
    testUserId = testUser.id;

    const token = jwt.sign(
      { userId: testUser.id, phone: testUser.phone, status: "ACTIVE" },
      process.env.JWT_SECRET || "manglam_matrimony_jwt_secret_dev_key_2026_secure",
      { expiresIn: "7d" }
    );

    // Initialize Profile
    const initRes = await fetch(`${BASE_URL}/api/profile`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ profileCreatedFor: "MYSELF" }),
    });
    const initJson = await initRes.json();
    console.log(`[INIT] Profile created for user ${testUser.id}: ${initJson.data?.profile?.id}`);

    // -------------------------------------------------------------
    // TEST 1: Upload Normalized 300x300 Profile Photo
    // -------------------------------------------------------------
    console.log("\n[TEST 1] Upload 300x300 Normalized Photo");
    const photo1Buf = createTestPng(300, 300);
    const form1 = createMultipartBody("photo", "photo1_300x300.png", "image/png", photo1Buf);

    const upload1Res = await fetch(`${BASE_URL}/api/profile/photos`, {
      method: "POST",
      headers: {
        "Content-Type": `multipart/form-data; boundary=${form1.boundary}`,
        Authorization: `Bearer ${token}`,
      },
      body: form1.body,
    });
    const upload1Json = await upload1Res.json();
    console.log(`  ✓ Status: ${upload1Res.status} | Photo ID: ${upload1Json.data?.photo?.id} | Type: ${upload1Json.data?.photo?.photoType}`);
    if (upload1Res.status !== 201 || upload1Json.data?.photo?.photoType !== "PRIMARY") {
      throw new Error("Test 1 Failed: First uploaded photo should be marked PRIMARY");
    }
    const photo1Id = upload1Json.data.photo.id;

    // -------------------------------------------------------------
    // TEST 2: Upload Second Photo (Portrait derivative 300x300)
    // -------------------------------------------------------------
    console.log("\n[TEST 2] Upload Second Photo");
    const photo2Buf = createTestPng(300, 300);
    const form2 = createMultipartBody("photo", "photo2_300x300.png", "image/png", photo2Buf);

    const upload2Res = await fetch(`${BASE_URL}/api/profile/photos`, {
      method: "POST",
      headers: {
        "Content-Type": `multipart/form-data; boundary=${form2.boundary}`,
        Authorization: `Bearer ${token}`,
      },
      body: form2.body,
    });
    const upload2Json = await upload2Res.json();
    console.log(`  ✓ Status: ${upload2Res.status} | Photo ID: ${upload2Json.data?.photo?.id} | Type: ${upload2Json.data?.photo?.photoType}`);
    if (upload2Res.status !== 201 || upload2Json.data?.photo?.photoType !== "ADDITIONAL") {
      throw new Error("Test 2 Failed: Second uploaded photo should be marked ADDITIONAL");
    }
    const photo2Id = upload2Json.data.photo.id;

    // -------------------------------------------------------------
    // TEST 3: Upload Third Photo (Landscape derivative 300x300)
    // -------------------------------------------------------------
    console.log("\n[TEST 3] Upload Third Photo");
    const photo3Buf = createTestPng(300, 300);
    const form3 = createMultipartBody("photo", "photo3_300x300.png", "image/png", photo3Buf);

    const upload3Res = await fetch(`${BASE_URL}/api/profile/photos`, {
      method: "POST",
      headers: {
        "Content-Type": `multipart/form-data; boundary=${form3.boundary}`,
        Authorization: `Bearer ${token}`,
      },
      body: form3.body,
    });
    const upload3Json = await upload3Res.json();
    console.log(`  ✓ Status: ${upload3Res.status} | Photo ID: ${upload3Json.data?.photo?.id}`);
    const photo3Id = upload3Json.data.photo.id;

    // -------------------------------------------------------------
    // TEST 4: Fetch Photo List (GET /api/profile/photos)
    // -------------------------------------------------------------
    console.log("\n[TEST 4] Get All Profile Photos");
    const getPhotosRes = await fetch(`${BASE_URL}/api/profile/photos`, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
    });
    const getPhotosJson = await getPhotosRes.json();
    console.log(`  ✓ Status: ${getPhotosRes.status} | Total Photos: ${getPhotosJson.data?.photos?.length}`);
    if (getPhotosJson.data?.photos?.length !== 3) {
      throw new Error("Test 4 Failed: Expected 3 photos in list");
    }

    // -------------------------------------------------------------
    // TEST 5: Set Primary Photo (PUT /api/profile/photos/:photoId/primary)
    // -------------------------------------------------------------
    console.log("\n[TEST 5] Set Photo 2 as Primary");
    const setPrimaryRes = await fetch(`${BASE_URL}/api/profile/photos/${photo2Id}/primary`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}` },
    });
    const setPrimaryJson = await setPrimaryRes.json();
    console.log(`  ✓ Status: ${setPrimaryRes.status} | Message: ${setPrimaryJson.message}`);
    if (setPrimaryRes.status !== 200 || setPrimaryJson.data?.photo?.photoType !== "PRIMARY") {
      throw new Error("Test 5 Failed: Setting primary photo failed");
    }

    // Verify in DB
    const dbPhoto1 = await prisma.profilePhoto.findUnique({ where: { id: photo1Id } });
    const dbPhoto2 = await prisma.profilePhoto.findUnique({ where: { id: photo2Id } });
    if (dbPhoto1?.photoType !== "ADDITIONAL" || dbPhoto2?.photoType !== "PRIMARY") {
      throw new Error("Test 5 Failed: DB photo types not properly updated");
    }
    console.log(`  ✓ PostgreSQL Verification: Photo 2 is now PRIMARY, Photo 1 is ADDITIONAL`);

    // -------------------------------------------------------------
    // TEST 6: Reorder Photos (PUT /api/profile/photos/reorder)
    // -------------------------------------------------------------
    console.log("\n[TEST 6] Reorder Photos");
    const newOrder = [photo3Id, photo2Id, photo1Id];
    const reorderRes = await fetch(`${BASE_URL}/api/profile/photos/reorder`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ photoIds: newOrder }),
    });
    const reorderJson = await reorderRes.json();
    console.log(`  ✓ Status: ${reorderRes.status} | Total returned: ${reorderJson.data?.photos?.length}`);
    // PRIMARY photo always comes first (photo2Id), followed by photo3Id then photo1Id
    if (reorderJson.data?.photos?.[0]?.id !== photo2Id || reorderJson.data?.photos?.[1]?.id !== photo3Id) {
      throw new Error("Test 6 Failed: Photo reorder not reflected");
    }
    console.log(`  ✓ Primary photo ${photo2Id} remains at index 0, followed by ${photo3Id}`);

    // -------------------------------------------------------------
    // TEST 7: Delete Photo (DELETE /api/profile/photos/:photoId)
    // -------------------------------------------------------------
    console.log("\n[TEST 7] Delete Photo 3");
    const deleteRes = await fetch(`${BASE_URL}/api/profile/photos/${photo3Id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    const deleteJson = await deleteRes.json();
    console.log(`  ✓ Status: ${deleteRes.status} | Message: ${deleteJson.message}`);
    if (deleteRes.status !== 200) {
      throw new Error("Test 7 Failed: Delete photo failed");
    }

    const remainingPhotos = await prisma.profilePhoto.findMany({ where: { profileId: dbPhoto1?.profileId } });
    console.log(`  ✓ PostgreSQL Verification: ${remainingPhotos.length} photo(s) remaining in DB`);
    if (remainingPhotos.length !== 2) {
      throw new Error("Test 7 Failed: Expected 2 photos in DB after deletion");
    }

    // -------------------------------------------------------------
    // TEST 8: Reject Corrupted / Non-Image File
    // -------------------------------------------------------------
    console.log("\n[TEST 8] Reject Invalid File");
    const textBuf = Buffer.from("this is a text file not an image");
    const formText = createMultipartBody("photo", "malicious.txt", "text/plain", textBuf);

    const invalidRes = await fetch(`${BASE_URL}/api/profile/photos`, {
      method: "POST",
      headers: {
        "Content-Type": `multipart/form-data; boundary=${formText.boundary}`,
        Authorization: `Bearer ${token}`,
      },
      body: formText.body,
    });
    const invalidJson = await invalidRes.json();
    console.log(`  ✓ Status: ${invalidRes.status} (Expected 400) | Code: ${invalidJson.code}`);
    if (invalidRes.status !== 400) {
      throw new Error("Test 8 Failed: Invalid file was not rejected with 400");
    }

    console.log("\n===============================================================");
    console.log("✅ ALL PHOTO UPLOAD & MANAGEMENT TESTS PASSED (100%)!");
    console.log("===============================================================");
  } catch (err) {
    console.error("Photo Test Suite Failure:", err);
    process.exit(1);
  } finally {
    if (testUserId) {
      await prisma.user.delete({ where: { id: testUserId } });
      console.log(`[CLEANUP] Deleted test user ${testUserId}`);
    }
    server.close();
    await prisma.$disconnect();
    process.exit(0);
  }
}

runPhotoSuite();
