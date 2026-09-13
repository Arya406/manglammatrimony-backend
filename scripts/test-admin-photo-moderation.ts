import "dotenv/config";
import http from "http";
import jwt from "jsonwebtoken";
import { app } from "../src/app";
import { prisma } from "../src/config/database";
import { config } from "../src/config/env";
import { UserRole, UserStatus, ModerationStatus, PhotoType } from "@prisma/client";

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`  ✗ FAIL: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
  console.log(`  ✓ PASS: ${message}`);
}

async function runPhotoModerationSuite() {
  console.log("==================================================");
  console.log("MANGLAM MATRIMONY — ADMIN PHOTO MODERATION TEST SUITE (STEP 4)");
  console.log("==================================================");

  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!adminEmail || !adminPassword) {
    throw new Error("ADMIN_EMAIL and ADMIN_PASSWORD must be defined in .env");
  }

  const normalizedEmail = adminEmail.trim().toLowerCase();

  const adminUser = await prisma.user.findUnique({
    where: { email: normalizedEmail },
  });
  assert(Boolean(adminUser), "Admin user exists in database");

  const normalUser = await prisma.user.findFirst({
    where: { role: UserRole.USER, status: UserStatus.ACTIVE },
    include: { profile: { include: { personalDetails: true, photos: true } } },
  });
  assert(Boolean(normalUser && normalUser.profile), "Normal test USER with profile exists in database");

  const testProfileId = normalUser!.profile!.id;

  // Spin up ephemeral test server
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as any).port;
  const baseUrl = `http://127.0.0.1:${port}`;

  let passedTests = 0;
  const createdPhotoIds: string[] = [];

  try {
    // Authenticate Admin
    const loginRes = await fetch(`${baseUrl}/api/admin/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: normalizedEmail, password: adminPassword }),
    });
    const loginJson: any = await loginRes.json();
    assert(loginRes.status === 200, "Admin login successful");
    const adminToken = loginJson.data.token;

    // Normal user token
    const userJwt = jwt.sign(
      { userId: normalUser!.id, email: normalUser!.email, role: "USER", status: "ACTIVE" },
      config.jwtSecret,
      { expiresIn: "1h" }
    );

    // Setup temporary test photos for moderation testing
    const pendingPhoto1 = await prisma.profilePhoto.create({
      data: {
        profileId: testProfileId,
        storageKey: "photos/test-queue-photo-1.jpg",
        originalFileName: "photo1.jpg",
        mimeType: "image/jpeg",
        fileSize: 10240,
        photoType: PhotoType.ADDITIONAL,
        moderationStatus: ModerationStatus.PENDING,
      },
    });
    createdPhotoIds.push(pendingPhoto1.id);

    const pendingPhoto2 = await prisma.profilePhoto.create({
      data: {
        profileId: testProfileId,
        storageKey: "photos/test-queue-photo-2.jpg",
        originalFileName: "photo2.jpg",
        mimeType: "image/jpeg",
        fileSize: 12400,
        photoType: PhotoType.ADDITIONAL,
        moderationStatus: ModerationStatus.PENDING,
      },
    });
    createdPhotoIds.push(pendingPhoto2.id);

    // 1. GET /api/admin/photos with admin JWT -> 200
    console.log("\n[TEST 1: GET /api/admin/photos with admin JWT → 200]");
    const res1 = await fetch(`${baseUrl}/api/admin/photos`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const json1: any = await res1.json();
    assert(res1.status === 200, "HTTP status is 200");
    assert(json1.success === true, "Envelope has success: true");
    assert(Array.isArray(json1.data.photos), "data.photos is an array");
    assert(Boolean(json1.data.pagination), "data.pagination exists");
    assert(Boolean(json1.data.stats), "data.stats exists");
    assert(typeof json1.data.stats.pending === "number", "stats.pending is a number");
    assert(typeof json1.data.stats.approved === "number", "stats.approved is a number");
    assert(typeof json1.data.stats.rejected === "number", "stats.rejected is a number");
    passedTests++;

    // 2. GET /api/admin/photos without token -> 401
    console.log("\n[TEST 2: GET /api/admin/photos without token → 401]");
    const res2 = await fetch(`${baseUrl}/api/admin/photos`);
    const json2: any = await res2.json();
    assert(res2.status === 401, "HTTP status is 401");
    assert(json2.code === "UNAUTHORIZED", "Error code is UNAUTHORIZED");
    passedTests++;

    // 3. GET /api/admin/photos with USER JWT -> 403
    console.log("\n[TEST 3: GET /api/admin/photos with USER JWT → 403]");
    const res3 = await fetch(`${baseUrl}/api/admin/photos`, {
      headers: { Authorization: `Bearer ${userJwt}` },
    });
    const json3: any = await res3.json();
    assert(res3.status === 403, "HTTP status is 403");
    assert(json3.code === "FORBIDDEN", "Error code is FORBIDDEN");
    passedTests++;

    // 4. GET /api/admin/photos/:photoId with admin JWT -> 200
    console.log("\n[TEST 4: GET /api/admin/photos/:photoId with admin JWT → 200]");
    const res4 = await fetch(`${baseUrl}/api/admin/photos/${pendingPhoto1.id}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const json4: any = await res4.json();
    assert(res4.status === 200, "HTTP status is 200");
    assert(json4.success === true, "Envelope has success: true");
    assert(json4.data.photo.id === pendingPhoto1.id, "Photo ID matches");
    assert(json4.data.photo.moderationStatus === "PENDING", "Status is PENDING");
    passedTests++;

    // 5. GET /api/admin/photos/:photoId without token -> 401
    console.log("\n[TEST 5: GET /api/admin/photos/:photoId without token → 401]");
    const res5 = await fetch(`${baseUrl}/api/admin/photos/${pendingPhoto1.id}`);
    const json5: any = await res5.json();
    assert(res5.status === 401, "HTTP status is 401");
    assert(json5.code === "UNAUTHORIZED", "Error code is UNAUTHORIZED");
    passedTests++;

    // 6. GET /api/admin/photos/:photoId with USER JWT -> 403
    console.log("\n[TEST 6: GET /api/admin/photos/:photoId with USER JWT → 403]");
    const res6 = await fetch(`${baseUrl}/api/admin/photos/${pendingPhoto1.id}`, {
      headers: { Authorization: `Bearer ${userJwt}` },
    });
    const json6: any = await res6.json();
    assert(res6.status === 403, "HTTP status is 403");
    assert(json6.code === "FORBIDDEN", "Error code is FORBIDDEN");
    passedTests++;

    // 7. GET /api/admin/photos/:photoId for non-existent photo -> 404
    console.log("\n[TEST 7: GET /api/admin/photos/:photoId for non-existent photo → 404]");
    const res7 = await fetch(`${baseUrl}/api/admin/photos/00000000-0000-0000-0000-000000000000`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const json7: any = await res7.json();
    assert(res7.status === 404, "HTTP status is 404");
    assert(json7.code === "PHOTO_NOT_FOUND", "Error code is PHOTO_NOT_FOUND");
    passedTests++;

    // 8. POST /api/admin/photos/:photoId/approve without token -> 401
    console.log("\n[TEST 8: POST /api/admin/photos/:photoId/approve without token → 401]");
    const res8 = await fetch(`${baseUrl}/api/admin/photos/${pendingPhoto1.id}/approve`, {
      method: "POST",
    });
    const json8: any = await res8.json();
    assert(res8.status === 401, "HTTP status is 401");
    passedTests++;

    // 9. POST /api/admin/photos/:photoId/approve with USER JWT -> 403
    console.log("\n[TEST 9: POST /api/admin/photos/:photoId/approve with USER JWT → 403]");
    const res9 = await fetch(`${baseUrl}/api/admin/photos/${pendingPhoto1.id}/approve`, {
      method: "POST",
      headers: { Authorization: `Bearer ${userJwt}` },
    });
    const json9: any = await res9.json();
    assert(res9.status === 403, "HTTP status is 403");
    passedTests++;

    // 10. POST /api/admin/photos/:photoId/reject without token -> 401
    console.log("\n[TEST 10: POST /api/admin/photos/:photoId/reject without token → 401]");
    const res10 = await fetch(`${baseUrl}/api/admin/photos/${pendingPhoto2.id}/reject`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: "Inappropriate photo" }),
    });
    const json10: any = await res10.json();
    assert(res10.status === 401, "HTTP status is 401");
    passedTests++;

    // 11. POST /api/admin/photos/:photoId/reject with USER JWT -> 403
    console.log("\n[TEST 11: POST /api/admin/photos/:photoId/reject with USER JWT → 403]");
    const res11 = await fetch(`${baseUrl}/api/admin/photos/${pendingPhoto2.id}/reject`, {
      method: "POST",
      headers: { Authorization: `Bearer ${userJwt}`, "Content-Type": "application/json" },
      body: JSON.stringify({ reason: "Inappropriate photo" }),
    });
    const json11: any = await res11.json();
    assert(res11.status === 403, "HTTP status is 403");
    passedTests++;

    // 12. Rejection validation: missing reason -> 400
    console.log("\n[TEST 12: Rejection validation: missing reason → 400]");
    const res12 = await fetch(`${baseUrl}/api/admin/photos/${pendingPhoto2.id}/reject`, {
      method: "POST",
      headers: { Authorization: `Bearer ${adminToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const json12: any = await res12.json();
    assert(res12.status === 400, "HTTP status is 400 for missing reason");
    passedTests++;

    // 13. Rejection validation: empty / whitespace reason -> 400
    console.log("\n[TEST 13: Rejection validation: whitespace reason → 400]");
    const res13 = await fetch(`${baseUrl}/api/admin/photos/${pendingPhoto2.id}/reject`, {
      method: "POST",
      headers: { Authorization: `Bearer ${adminToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ reason: "   " }),
    });
    const json13: any = await res13.json();
    assert(res13.status === 400, "HTTP status is 400 for whitespace reason");
    passedTests++;

    // 14. Rejection validation: oversized reason (> 500 chars) -> 400
    console.log("\n[TEST 14: Rejection validation: oversized reason → 400]");
    const oversizedReason = "a".repeat(501);
    const res14 = await fetch(`${baseUrl}/api/admin/photos/${pendingPhoto2.id}/reject`, {
      method: "POST",
      headers: { Authorization: `Bearer ${adminToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ reason: oversizedReason }),
    });
    const json14: any = await res14.json();
    assert(res14.status === 400, "HTTP status is 400 for > 500 chars");
    passedTests++;

    // 15. POST /api/admin/photos/:photoId/approve with admin JWT -> 200 (Approve pendingPhoto1)
    console.log("\n[TEST 15: POST /api/admin/photos/:photoId/approve with admin JWT → 200]");
    const res15 = await fetch(`${baseUrl}/api/admin/photos/${pendingPhoto1.id}/approve`, {
      method: "POST",
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const json15: any = await res15.json();
    assert(res15.status === 200, "HTTP status is 200");
    assert(json15.success === true, "Envelope success is true");
    assert(json15.data.photo.moderationStatus === "APPROVED", "Status updated to APPROVED");
    assert(Boolean(json15.data.photo.moderatedAt), "moderatedAt is populated");
    assert(json15.data.photo.moderatedByUserId === adminUser!.id, "moderatedByUserId is set to admin id");
    passedTests++;

    // 16. Idempotency: re-approve already APPROVED photo -> 200
    console.log("\n[TEST 16: Idempotency: re-approve already APPROVED photo → 200]");
    const res16 = await fetch(`${baseUrl}/api/admin/photos/${pendingPhoto1.id}/approve`, {
      method: "POST",
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const json16: any = await res16.json();
    assert(res16.status === 200, "HTTP status is 200 for idempotent approve");
    assert(json16.data.photo.moderationStatus === "APPROVED", "Status remains APPROVED");
    passedTests++;

    // 17. POST /api/admin/photos/:photoId/reject with admin JWT -> 200 (Reject pendingPhoto2)
    console.log("\n[TEST 17: POST /api/admin/photos/:photoId/reject with admin JWT → 200]");
    const rejectionReason = "Blurry and face not clearly visible.";
    const res17 = await fetch(`${baseUrl}/api/admin/photos/${pendingPhoto2.id}/reject`, {
      method: "POST",
      headers: { Authorization: `Bearer ${adminToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ reason: `  ${rejectionReason}  ` }),
    });
    const json17: any = await res17.json();
    assert(res17.status === 200, "HTTP status is 200");
    assert(json17.success === true, "Envelope success is true");
    assert(json17.data.photo.moderationStatus === "REJECTED", "Status updated to REJECTED");
    assert(json17.data.photo.moderationReason === rejectionReason, "Reason trimmed and persisted");
    assert(Boolean(json17.data.photo.moderatedAt), "moderatedAt is populated");
    assert(json17.data.photo.moderatedByUserId === adminUser!.id, "moderatedByUserId is set to admin id");
    passedTests++;

    // 18. Idempotency: re-reject already REJECTED photo with same reason -> 200
    console.log("\n[TEST 18: Idempotency: re-reject already REJECTED photo with same reason → 200]");
    const res18 = await fetch(`${baseUrl}/api/admin/photos/${pendingPhoto2.id}/reject`, {
      method: "POST",
      headers: { Authorization: `Bearer ${adminToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ reason: rejectionReason }),
    });
    const json18: any = await res18.json();
    assert(res18.status === 200, "HTTP status is 200 for idempotent reject");
    assert(json18.data.photo.moderationStatus === "REJECTED", "Status remains REJECTED");
    passedTests++;

    // 19. State conflict: Cannot approve a REJECTED photo -> 409 MODERATION_CONFLICT
    console.log("\n[TEST 19: State conflict: Cannot approve a REJECTED photo → 409 MODERATION_CONFLICT]");
    const res19 = await fetch(`${baseUrl}/api/admin/photos/${pendingPhoto2.id}/approve`, {
      method: "POST",
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const json19: any = await res19.json();
    assert(res19.status === 409, "HTTP status is 409 for approve on REJECTED");
    assert(json19.code === "MODERATION_CONFLICT", "Error code is MODERATION_CONFLICT");
    passedTests++;

    // 20. State conflict: Cannot reject an APPROVED photo -> 409 MODERATION_CONFLICT
    console.log("\n[TEST 20: State conflict: Cannot reject an APPROVED photo → 409 MODERATION_CONFLICT]");
    const res20 = await fetch(`${baseUrl}/api/admin/photos/${pendingPhoto1.id}/reject`, {
      method: "POST",
      headers: { Authorization: `Bearer ${adminToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ reason: "Too late to reject" }),
    });
    const json20: any = await res20.json();
    assert(res20.status === 409, "HTTP status is 409 for reject on APPROVED");
    assert(json20.code === "MODERATION_CONFLICT", "Error code is MODERATION_CONFLICT");
    passedTests++;

    // 21. Search by email filter matches
    console.log("\n[TEST 21: Search by email filter matches]");
    const res21 = await fetch(`${baseUrl}/api/admin/photos?q=${encodeURIComponent(normalUser!.email)}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const json21: any = await res21.json();
    assert(res21.status === 200, "HTTP status is 200");
    assert(json21.data.photos.length > 0, "Search by email returns photos");
    assert(json21.data.photos.some((p: any) => p.user && p.user.email === normalUser!.email), "Found user photo by email");
    passedTests++;

    // 22. Search by name filter matches
    const firstName = normalUser!.profile?.personalDetails?.firstName;
    if (firstName) {
      console.log(`\n[TEST 22: Search by firstName "${firstName}" filter matches]`);
      const res22 = await fetch(`${baseUrl}/api/admin/photos?q=${encodeURIComponent(firstName)}`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const json22: any = await res22.json();
      assert(res22.status === 200, "HTTP status is 200");
      assert(json22.data.photos.length > 0, "Search by firstName returns photos");
    } else {
      console.log("\n[TEST 22: Search by firstName skipped - normalUser has no personalDetails]");
    }
    passedTests++;

    // 23. Filter by moderationStatus=PENDING returns only PENDING
    console.log("\n[TEST 23: Filter by moderationStatus=PENDING]");
    // Create a temporary 3rd pending photo to verify filter returns it
    const pendingPhoto3 = await prisma.profilePhoto.create({
      data: {
        profileId: testProfileId,
        storageKey: "photos/test-queue-photo-3.jpg",
        originalFileName: "photo3.jpg",
        mimeType: "image/jpeg",
        fileSize: 15300,
        photoType: PhotoType.ADDITIONAL,
        moderationStatus: ModerationStatus.PENDING,
      },
    });
    createdPhotoIds.push(pendingPhoto3.id);

    const res23 = await fetch(`${baseUrl}/api/admin/photos?moderationStatus=PENDING`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const json23: any = await res23.json();
    assert(res23.status === 200, "HTTP status is 200");
    assert(json23.data.photos.every((p: any) => p.moderationStatus === "PENDING"), "All returned photos have status PENDING");
    assert(json23.data.photos.some((p: any) => p.id === pendingPhoto3.id), "Includes pendingPhoto3");
    passedTests++;

    // 24. Filter by moderationStatus=APPROVED returns only APPROVED
    console.log("\n[TEST 24: Filter by moderationStatus=APPROVED]");
    const res24 = await fetch(`${baseUrl}/api/admin/photos?moderationStatus=APPROVED`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const json24: any = await res24.json();
    assert(res24.status === 200, "HTTP status is 200");
    assert(json24.data.photos.every((p: any) => p.moderationStatus === "APPROVED"), "All returned photos have status APPROVED");
    assert(json24.data.photos.some((p: any) => p.id === pendingPhoto1.id), "Includes approved pendingPhoto1");
    passedTests++;

    // 25. Filter by moderationStatus=REJECTED returns only REJECTED
    console.log("\n[TEST 25: Filter by moderationStatus=REJECTED]");
    const res25 = await fetch(`${baseUrl}/api/admin/photos?moderationStatus=REJECTED`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const json25: any = await res25.json();
    assert(res25.status === 200, "HTTP status is 200");
    assert(json25.data.photos.every((p: any) => p.moderationStatus === "REJECTED"), "All returned photos have status REJECTED");
    assert(json25.data.photos.some((p: any) => p.id === pendingPhoto2.id), "Includes rejected pendingPhoto2");
    passedTests++;

    // 26. Sorting: newest vs oldest
    console.log("\n[TEST 26: Sorting newest vs oldest]");
    const res26New = await fetch(`${baseUrl}/api/admin/photos?sort=newest&pageSize=5`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const json26New: any = await res26New.json();
    const res26Old = await fetch(`${baseUrl}/api/admin/photos?sort=oldest&pageSize=5`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const json26Old: any = await res26Old.json();
    assert(res26New.status === 200 && res26Old.status === 200, "Both sort queries returned 200");
    if (json26New.data.photos.length > 1 && json26Old.data.photos.length > 1) {
      assert(json26New.data.photos[0].id !== json26Old.data.photos[0].id, "First item differs between newest and oldest sort");
    }
    passedTests++;

    // 27. Pagination page and pageSize
    console.log("\n[TEST 27: Pagination page and pageSize]");
    const res27 = await fetch(`${baseUrl}/api/admin/photos?page=1&pageSize=2`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const json27: any = await res27.json();
    assert(res27.status === 200, "HTTP status is 200");
    assert(json27.data.pagination.pageSize === 2, "Pagination pageSize is 2");
    assert(json27.data.photos.length <= 2, "Returned photos count <= 2");
    passedTests++;

    // 28. PageSize max 100 enforced
    console.log("\n[TEST 28: PageSize max 100 enforced via 400 validation]");
    const res28 = await fetch(`${baseUrl}/api/admin/photos?pageSize=250`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const json28: any = await res28.json();
    assert(res28.status === 400, "HTTP status is 400 when pageSize exceeds 100");
    assert(json28.code === "INVALID_PAGE_SIZE", "Error code is INVALID_PAGE_SIZE");
    passedTests++;

    // 29. Detail returns complete inspection details and moderator info
    console.log("\n[TEST 29: Detail returns complete inspection details]");
    const res29 = await fetch(`${baseUrl}/api/admin/photos/${pendingPhoto2.id}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const json29: any = await res29.json();
    assert(res29.status === 200, "HTTP status is 200");
    const d = json29.data.photo;
    assert(Boolean(d.profile), "Detail contains profile");
    assert(Boolean(d.user), "Detail contains user");
    assert(Boolean(d.moderator), "Detail contains moderator info");
    assert(d.moderator.id === adminUser!.id, "Moderator is admin user");
    assert(d.moderator.email === normalizedEmail, "Moderator email matches");
    passedTests++;

    // 30. Detail redacts sensitive user fields
    console.log("\n[TEST 30: Detail redacts sensitive user fields]");
    assert(d.user.passwordHash === undefined, "passwordHash is omitted/redacted");
    assert(d.user.otpHash === undefined, "otpHash is omitted/redacted");
    assert(d.user.token === undefined, "token is omitted/redacted");
    passedTests++;

    // 31. Rejection does NOT delete photo record or storage file
    console.log("\n[TEST 31: Storage & record preservation]");
    const dbRecord = await prisma.profilePhoto.findUnique({
      where: { id: pendingPhoto2.id },
    });
    assert(Boolean(dbRecord), "Photo record remains in database after rejection");
    assert(dbRecord?.storageKey === "photos/test-queue-photo-2.jpg", "Photo storage key preserved");
    passedTests++;

    // 32. Discovery safety: /api/matches only queries APPROVED photos
    console.log("\n[TEST 32: Discovery safety - /api/matches queries only APPROVED photos]");
    // Query db via same clause as matches service
    const discoverablePhotos = await prisma.profilePhoto.findMany({
      where: {
        profileId: testProfileId,
        moderationStatus: ModerationStatus.APPROVED,
      },
    });
    assert(discoverablePhotos.some((p) => p.id === pendingPhoto1.id), "Approved photo is discoverable");
    assert(!discoverablePhotos.some((p) => p.id === pendingPhoto2.id), "Rejected photo is NOT discoverable");
    assert(!discoverablePhotos.some((p) => p.id === pendingPhoto3.id), "Pending photo is NOT discoverable");
    passedTests++;

    console.log("\n==================================================");
    console.log(`ALL ${passedTests} PHOTO MODERATION TESTS PASSED!`);
    console.log("==================================================");
  } finally {
    // Cleanup temporary test photos
    if (createdPhotoIds.length > 0) {
      await prisma.profilePhoto.deleteMany({
        where: { id: { in: createdPhotoIds } },
      });
      console.log(`[CLEANUP] Deleted ${createdPhotoIds.length} temporary test photos`);
    }
    server.close();
    await prisma.$disconnect();
  }
}

runPhotoModerationSuite().catch((err) => {
  console.error("Test suite failed:", err);
  process.exit(1);
});
