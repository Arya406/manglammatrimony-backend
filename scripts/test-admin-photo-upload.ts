import "dotenv/config";
import http from "http";
import jwt from "jsonwebtoken";
import sharp from "sharp";
import { app } from "../src/app";
import { prisma } from "../src/config/database";
import { config } from "../src/config/env";
import { UserRole, UserStatus, ModerationStatus, PhotoType, Gender, MaritalStatus, ManglikStatus } from "@prisma/client";
import { getStorageProvider } from "../src/providers/storage";
import { PhotoService } from "../src/services/photo.service";

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`  ✗ FAIL: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
  console.log(`  ✓ PASS: ${message}`);
}

async function createSampleImageBuffer(format: "jpeg" | "png" | "webp", color: { r: number; g: number; b: number }): Promise<Buffer> {
  const image = sharp({
    create: {
      width: 150,
      height: 150,
      channels: 3,
      background: color,
    },
  });

  if (format === "jpeg") return image.jpeg().toBuffer();
  if (format === "png") return image.png().toBuffer();
  return image.webp().toBuffer();
}

async function runAdminPhotoUploadSuite() {
  console.log("==================================================");
  console.log("MANGLAM MATRIMONY — ADMIN PROFILE PHOTO UPLOAD TEST SUITE (24 POINTS)");
  console.log("==================================================");

  const adminEmail = process.env.ADMIN_EMAIL || "admin@gmail.com";
  const adminPassword = process.env.ADMIN_PASSWORD || "admin123@";
  const normalizedAdminEmail = adminEmail.trim().toLowerCase();

  const adminUser = await prisma.user.findUnique({
    where: { email: normalizedAdminEmail },
  });
  assert(Boolean(adminUser), `Admin user exists (${normalizedAdminEmail})`);

  // Spin up ephemeral server
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as any).port;
  const baseUrl = `http://127.0.0.1:${port}`;

  const createdUserIds: string[] = [];
  const createdPhotoIds: string[] = [];
  let passedCount = 0;

  try {
    // ------------------------------------------------------------------------
    // SETUP: Admin Auth Token & Master Data
    // ------------------------------------------------------------------------
    console.log("\n[SETUP: Admin Login]");
    const loginRes = await fetch(`${baseUrl}/api/admin/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: normalizedAdminEmail, password: adminPassword }),
    });
    const loginJson: any = await loginRes.json();
    assert(loginRes.status === 200, "Admin login successful");
    const adminToken = loginJson.data.token;

    const religion = await prisma.religion.findFirst();
    const language = await prisma.language.findFirst();
    assert(Boolean(religion && language), "Master data available");

    // Helper to create a test user with profile
    async function createTestMatrimonialUser(status: UserStatus = UserStatus.ACTIVE, createProfile = true) {
      const email = `test.photo.user.${Date.now()}.${Math.random().toString(36).slice(2, 7)}@manglam.test`;
      const user = await prisma.user.create({
        data: {
          email,
          role: UserRole.USER,
          status,
          ...(createProfile
            ? {
                profile: {
                  create: {
                    profileCreatedFor: "MYSELF" as any,
                    profileStatus: "ACTIVE" as any,
                    completionPercentage: 50,
                    personalDetails: {
                      create: {
                        firstName: "Test",
                        lastName: "Subject",
                        gender: Gender.FEMALE,
                        dateOfBirth: new Date("1995-05-15"),
                        maritalStatus: MaritalStatus.NEVER_MARRIED,
                        heightCm: 165,
                        motherTongue: { connect: { id: language!.id } },
                      },
                    },
                    religion: {
                      create: {
                        religionId: religion!.id,
                        manglik: ManglikStatus.NO,
                      },
                    },
                  },
                },
              }
            : {}),
        },
        include: { profile: true },
      });
      createdUserIds.push(user.id);
      return user;
    }

    const testUserA = await createTestMatrimonialUser();
    const testUserAProfileId = testUserA.profile!.id;

    // Helper for multipart photo upload
    async function uploadPhotoViaApi(
      targetUserId: string,
      fileBuffer: Buffer,
      fileName: string,
      mimeType: string,
      isPrimary?: boolean,
      token?: string
    ) {
      const formData = new FormData();
      const blob = new Blob([fileBuffer], { type: mimeType });
      formData.append("photo", blob, fileName);
      if (isPrimary !== undefined) {
        formData.append("isPrimary", String(isPrimary));
      }

      const headers: Record<string, string> = {};
      if (token !== undefined) {
        headers["Authorization"] = `Bearer ${token}`;
      }

      const res = await fetch(`${baseUrl}/api/admin/users/${targetUserId}/profile/photos`, {
        method: "POST",
        headers,
        body: formData,
      });

      const json: any = await res.json().catch(() => null);
      return { status: res.status, data: json };
    }

    // ========================================================================
    // POINT 4: Upload without admin auth -> 401 Unauthorized
    // ========================================================================
    console.log("\n[POINT 4: Upload without admin auth returns 401]");
    const jpegBuf = await createSampleImageBuffer("jpeg", { r: 255, g: 120, b: 60 });
    const p4 = await uploadPhotoViaApi(testUserA.id, jpegBuf, "sample.jpg", "image/jpeg", undefined, undefined);
    assert(p4.status === 401, "Unauthenticated request returns 401 Unauthorized");
    passedCount++;

    // ========================================================================
    // POINT 5: Upload with normal USER token -> 403 Forbidden
    // ========================================================================
    console.log("\n[POINT 5: Upload with normal USER token returns 403]");
    const userJwt = jwt.sign(
      { userId: testUserA.id, email: testUserA.email, role: "USER", status: "ACTIVE" },
      config.jwtSecret,
      { expiresIn: "1h" }
    );
    const p5 = await uploadPhotoViaApi(testUserA.id, jpegBuf, "sample.jpg", "image/jpeg", undefined, userJwt);
    assert(p5.status === 403, "Normal USER token returns 403 Forbidden");
    passedCount++;

    // ========================================================================
    // POINT 6: Upload targeting another ADMIN user -> 403 Forbidden
    // ========================================================================
    console.log("\n[POINT 6: Upload targeting another ADMIN user returns 403]");
    const secondAdminEmail = `sec.admin.${Date.now()}@manglam.test`;
    const secondAdmin = await prisma.user.create({
      data: { email: secondAdminEmail, role: UserRole.ADMIN, status: UserStatus.ACTIVE },
    });
    createdUserIds.push(secondAdmin.id);
    const p6 = await uploadPhotoViaApi(secondAdmin.id, jpegBuf, "sample.jpg", "image/jpeg", undefined, adminToken);
    assert(p6.status === 403, "Targeting another ADMIN user returns 403 CANNOT_MODIFY_ADMIN");
    passedCount++;

    // ========================================================================
    // POINT 7: Upload targeting non-existent user -> 404 User Not Found
    // ========================================================================
    console.log("\n[POINT 7: Upload targeting non-existent user returns 404]");
    const fakeUserId = "00000000-0000-0000-0000-000000000000";
    const p7 = await uploadPhotoViaApi(fakeUserId, jpegBuf, "sample.jpg", "image/jpeg", undefined, adminToken);
    assert(p7.status === 404 && p7.data?.code === "USER_NOT_FOUND", "Non-existent user returns 404 USER_NOT_FOUND");
    passedCount++;

    // ========================================================================
    // POINT 8: Upload targeting user without profile -> 404 Profile Not Found
    // ========================================================================
    console.log("\n[POINT 8: Upload targeting user without profile returns 404]");
    const userWithoutProfile = await createTestMatrimonialUser(UserStatus.ACTIVE, false);
    const p8 = await uploadPhotoViaApi(userWithoutProfile.id, jpegBuf, "sample.jpg", "image/jpeg", undefined, adminToken);
    assert(p8.status === 404 && p8.data?.code === "PROFILE_NOT_FOUND", "User without profile returns 404 PROFILE_NOT_FOUND");
    passedCount++;

    // ========================================================================
    // POINT 9: Upload targeting deleted user -> 400 Account Deleted
    // ========================================================================
    console.log("\n[POINT 9: Upload targeting DELETED user returns 400]");
    const deletedUser = await createTestMatrimonialUser(UserStatus.DELETED, true);
    const p9 = await uploadPhotoViaApi(deletedUser.id, jpegBuf, "sample.jpg", "image/jpeg", undefined, adminToken);
    assert(p9.status === 400 && p9.data?.code === "ACCOUNT_DELETED", "Deleted user returns 400 ACCOUNT_DELETED");
    passedCount++;

    // ========================================================================
    // POINT 10: Upload corrupted image file -> 400 Bad Request
    // ========================================================================
    console.log("\n[POINT 10: Upload corrupted image file returns 400]");
    const corruptedBuf = Buffer.from("this is definitely not a valid image payload");
    const p10 = await uploadPhotoViaApi(testUserA.id, corruptedBuf, "corrupted.jpg", "image/jpeg", undefined, adminToken);
    assert(p10.status === 400, "Corrupted image file returns 400 Bad Request");
    passedCount++;

    // ========================================================================
    // POINT 11: Upload file exceeding 5MB -> 400 Bad Request
    // ========================================================================
    console.log("\n[POINT 11: Upload file exceeding 5MB returns 400]");
    const oversizedBuf = Buffer.alloc(5.5 * 1024 * 1024); // 5.5 MB
    const p11 = await uploadPhotoViaApi(testUserA.id, oversizedBuf, "oversized.jpg", "image/jpeg", undefined, adminToken);
    assert(p11.status === 400, "File > 5MB returns 400 Bad Request");
    passedCount++;

    // ========================================================================
    // POINT 12: Upload non-image file (.txt/.pdf/.exe) -> 400 Bad Request
    // ========================================================================
    console.log("\n[POINT 12: Upload non-image file (.txt) returns 400]");
    const textBuf = Buffer.from("Hello world plain text document");
    const p12 = await uploadPhotoViaApi(testUserA.id, textBuf, "document.txt", "text/plain", undefined, adminToken);
    assert(p12.status === 400, "Non-image file returns 400 UNSUPPORTED_IMAGE_TYPE");
    passedCount++;

    // ========================================================================
    // POINT 1: Admin uploads valid JPEG to existing user profile -> succeeds (200/201)
    // ========================================================================
    console.log("\n[POINT 1: Admin uploads valid JPEG -> 200/201 OK]");
    const p1 = await uploadPhotoViaApi(testUserA.id, jpegBuf, "sample1.jpg", "image/jpeg", undefined, adminToken);
    assert((p1.status === 200 || p1.status === 201) && p1.data?.success === true, "Valid JPEG upload succeeds with 200/201");
    const photo1 = p1.data.data.photo;
    createdPhotoIds.push(photo1.id);
    passedCount++;

    // ========================================================================
    // POINT 2: Admin uploads valid PNG -> WebP converted derivative generated
    // ========================================================================
    console.log("\n[POINT 2: Admin uploads valid PNG -> WebP converted derivative generated]");
    const pngBuf = await createSampleImageBuffer("png", { r: 50, g: 150, b: 250 });
    const p2 = await uploadPhotoViaApi(testUserA.id, pngBuf, "sample2.png", "image/png", undefined, adminToken);
    assert((p2.status === 200 || p2.status === 201) && p2.data?.success === true, "Valid PNG upload succeeds with 200/201");
    const photo2 = p2.data.data.photo;
    createdPhotoIds.push(photo2.id);
    assert(photo2.storageKey?.endsWith(".webp") || photo2.url?.includes(".webp") || photo2.mimeType === "image/webp", "Converted derivative is WebP");
    passedCount++;

    // ========================================================================
    // POINT 3: Admin uploads valid WebP -> properly ingested
    // ========================================================================
    console.log("\n[POINT 3: Admin uploads valid WebP -> properly ingested]");
    const webpBuf = await createSampleImageBuffer("webp", { r: 100, g: 220, b: 100 });
    const p3 = await uploadPhotoViaApi(testUserA.id, webpBuf, "sample3.webp", "image/webp", undefined, adminToken);
    assert((p3.status === 200 || p3.status === 201) && p3.data?.success === true, "Valid WebP upload succeeds with 200/201");
    const photo3 = p3.data.data.photo;
    createdPhotoIds.push(photo3.id);
    passedCount++;

    // ========================================================================
    // POINT 13: First uploaded photo automatically marked PRIMARY
    // ========================================================================
    console.log("\n[POINT 13: First uploaded photo automatically marked PRIMARY]");
    assert(photo1.photoType === PhotoType.PRIMARY && photo1.isPrimary === true, "First photo has photoType: PRIMARY and isPrimary: true");
    passedCount++;

    // ========================================================================
    // POINT 14: Subsequent uploaded photo defaults to ADDITIONAL
    // ========================================================================
    console.log("\n[POINT 14: Subsequent uploaded photo defaults to ADDITIONAL]");
    assert(photo2.photoType === PhotoType.ADDITIONAL && photo2.isPrimary === false, "Second photo defaults to ADDITIONAL and isPrimary: false");
    passedCount++;

    // ========================================================================
    // POINT 15: Explicit isPrimary: true promotes new photo to PRIMARY and demotes previous
    // ========================================================================
    console.log("\n[POINT 15: Explicit isPrimary: true promotes to PRIMARY and demotes previous]");
    const p15 = await uploadPhotoViaApi(testUserA.id, jpegBuf, "sample4_primary.jpg", "image/jpeg", true, adminToken);
    assert((p15.status === 200 || p15.status === 201) && p15.data?.success === true, "Upload with isPrimary: true succeeds");
    const photo4 = p15.data.data.photo;
    createdPhotoIds.push(photo4.id);
    assert(photo4.photoType === PhotoType.PRIMARY && photo4.isPrimary === true, "New photo promoted to PRIMARY");

    // Verify in database that exactly ONE photo is PRIMARY and photo 1 was demoted
    const primaryPhotosInDb = await prisma.profilePhoto.findMany({
      where: { profileId: testUserAProfileId, photoType: PhotoType.PRIMARY },
    });
    assert(primaryPhotosInDb.length === 1 && primaryPhotosInDb[0].id === photo4.id, "Exactly 1 PRIMARY photo exists in database, matching newly uploaded photo");
    passedCount++;

    // ========================================================================
    // POINT 16: Uploaded photo has moderationStatus: APPROVED
    // ========================================================================
    console.log("\n[POINT 16: Uploaded photo has moderationStatus: APPROVED]");
    assert(photo1.moderationStatus === ModerationStatus.APPROVED, "Photo 1 has moderationStatus: APPROVED");
    assert(photo4.moderationStatus === ModerationStatus.APPROVED, "Photo 4 has moderationStatus: APPROVED");
    passedCount++;

    // ========================================================================
    // POINT 17: Uploaded photo has moderatedAt populated
    // ========================================================================
    console.log("\n[POINT 17: Uploaded photo has moderatedAt populated]");
    const photo1Db = await prisma.profilePhoto.findUnique({ where: { id: photo1.id } });
    assert(Boolean(photo1Db && photo1Db.moderatedAt), "moderatedAt timestamp is populated");
    assert(Date.now() - new Date(photo1Db!.moderatedAt!).getTime() < 60000, "moderatedAt is within current time frame");
    passedCount++;

    // ========================================================================
    // POINT 18: Uploaded photo has moderatedByUserId matching authenticated admin's ID
    // ========================================================================
    console.log("\n[POINT 18: Uploaded photo has moderatedByUserId matching admin ID]");
    assert(photo1Db!.moderatedByUserId === adminUser!.id, `moderatedByUserId matches admin ID (${adminUser!.id})`);
    passedCount++;

    // ========================================================================
    // POINT 19: Storage artifact exists at canonical key
    // ========================================================================
    console.log("\n[POINT 19: Storage artifact exists at canonical key]");
    const storageProvider = getStorageProvider();
    const photo4Db = await prisma.profilePhoto.findUnique({ where: { id: photo4.id } });
    assert(Boolean(photo4Db), "Photo record exists in DB");
    const keyExists = await storageProvider.exists(photo4Db!.storageKey);
    assert(keyExists === true, `Storage artifact exists at key: ${photo4Db!.storageKey}`);
    passedCount++;

    // ========================================================================
    // POINT 20: DB insert failure triggers compensating storage cleanup
    // ========================================================================
    console.log("\n[POINT 20: Compensating storage cleanup on DB failure]");
    const photoService = new PhotoService();
    let deleteSpyCalled = false;
    const originalDelete = storageProvider.delete.bind(storageProvider);
    storageProvider.delete = async (key: string) => {
      deleteSpyCalled = true;
      return originalDelete(key);
    };

    try {
      // Pass a non-existent admin user ID to trigger a foreign key constraint violation in tx.profilePhoto.create
      const fakeAdminId = "00000000-0000-0000-0000-000000000099";
      await photoService.adminUploadPhoto(fakeAdminId, testUserA.id, {
        buffer: jpegBuf,
        originalname: "compensate-test.jpg",
        mimetype: "image/jpeg",
        size: jpegBuf.length,
      } as any);
    } catch (err: any) {
      // Expected constraint violation
    } finally {
      storageProvider.delete = originalDelete;
    }
    assert(deleteSpyCalled, "Compensating storage delete was invoked after DB transaction failed");
    passedCount++;

    // ========================================================================
    // POINT 21: Profile completion percentage recalculated and updated correctly
    // ========================================================================
    console.log("\n[POINT 21: Profile completion percentage recalculated (+10% on first photo)]");
    const testUserB = await createTestMatrimonialUser();
    const userBProfileBefore = await prisma.profile.findUnique({ where: { id: testUserB.profile!.id } });
    const completionBefore = userBProfileBefore!.completionPercentage;

    const p21 = await uploadPhotoViaApi(testUserB.id, jpegBuf, "first.jpg", "image/jpeg", undefined, adminToken);
    assert((p21.status === 200 || p21.status === 201), "First photo upload for User B succeeds");
    createdPhotoIds.push(p21.data.data.photo.id);

    const userBProfileAfter = await prisma.profile.findUnique({ where: { id: testUserB.profile!.id } });
    const completionAfter = userBProfileAfter!.completionPercentage;
    assert(completionAfter >= completionBefore + 10, `Completion increased from ${completionBefore}% to ${completionAfter}% (+10% awarded)`);
    passedCount++;

    // ========================================================================
    // POINT 22: Photo limit enforced (attempting 7th photo returns 409 PHOTO_LIMIT_REACHED)
    // ========================================================================
    console.log("\n[POINT 22: Photo limit enforced (max 6 photos, 7th returns 409)]");
    // testUserA currently has 4 photos (photo1, photo2, photo3, photo4)
    // Upload 5th and 6th photo
    const p22_5 = await uploadPhotoViaApi(testUserA.id, jpegBuf, "sample5.jpg", "image/jpeg", undefined, adminToken);
    assert((p22_5.status === 200 || p22_5.status === 201), "5th photo upload succeeds");
    createdPhotoIds.push(p22_5.data.data.photo.id);

    const p22_6 = await uploadPhotoViaApi(testUserA.id, jpegBuf, "sample6.jpg", "image/jpeg", undefined, adminToken);
    assert((p22_6.status === 200 || p22_6.status === 201), "6th photo upload succeeds");
    createdPhotoIds.push(p22_6.data.data.photo.id);

    // Now attempt 7th photo
    const p22_7 = await uploadPhotoViaApi(testUserA.id, jpegBuf, "sample7_fail.jpg", "image/jpeg", undefined, adminToken);
    assert(p22_7.status === 409 && p22_7.data?.code === "PHOTO_LIMIT_REACHED", "7th photo rejected with 409 PHOTO_LIMIT_REACHED");
    passedCount++;

    // ========================================================================
    // POINT 23: Uploaded photos appear in GET /api/admin/profiles/:id with complete metadata
    // ========================================================================
    console.log("\n[POINT 23: Uploaded photos appear in GET /api/admin/profiles/:id with metadata]");
    const profileDetailRes = await fetch(`${baseUrl}/api/admin/profiles/${testUserAProfileId}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const profileDetailJson: any = await profileDetailRes.json();
    assert(profileDetailRes.status === 200 && profileDetailJson.success === true, "GET /api/admin/profiles/:id succeeds");
    const photosList = profileDetailJson.data.profile.photos;
    assert(photosList.length === 6, `Profile detail returns all 6 photos (found ${photosList.length})`);
    const verifiedPhoto = photosList.find((p: any) => p.id === photo4.id);
    assert(Boolean(verifiedPhoto), "Photo 4 found in profile photos list");
    assert(verifiedPhoto.isPrimary === true, "Photo 4 has isPrimary: true in detail response");
    assert(verifiedPhoto.moderationStatus === "APPROVED", "Photo 4 has moderationStatus: APPROVED in detail response");
    assert(verifiedPhoto.moderatedByUserId === adminUser!.id, "Photo 4 has moderatedByUserId in detail response");
    passedCount++;

    // ========================================================================
    // POINT 24: Uploaded photos appear in GET /api/admin/users/:id profile summary
    // ========================================================================
    console.log("\n[POINT 24: Uploaded photos appear in GET /api/admin/users/:id profile summary]");
    const userDetailRes = await fetch(`${baseUrl}/api/admin/users/${testUserA.id}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const userDetailJson: any = await userDetailRes.json();
    assert(userDetailRes.status === 200 && userDetailJson.success === true, "GET /api/admin/users/:id succeeds");
    const userProfile = userDetailJson.data.user.profile;
    assert(Boolean(userProfile), "User detail returns profile");
    assert(Boolean(userProfile.primaryPhotoUrl), "Primary photo URL present in user detail profile summary");
    assert(userProfile.primaryPhotoUrl.includes(".webp") || userProfile.primaryPhotoUrl.includes("photos/"), "Primary photo URL points to valid photo asset");
    passedCount++;

    console.log("\n==================================================");
    console.log(`ALL ${passedCount} OF 24 VERIFICATION POINTS PASSED PERFECTLY!`);
    console.log("==================================================");
  } finally {
    // Cleanup created photos and test users
    console.log("\n[CLEANUP: Removing test artifacts]");
    const storage = getStorageProvider();
    for (const photoId of createdPhotoIds) {
      try {
        const photo = await prisma.profilePhoto.findUnique({ where: { id: photoId } });
        if (photo) {
          await storage.delete(photo.storageKey);
          await prisma.profilePhoto.delete({ where: { id: photoId } });
        }
      } catch (e) {
        // ignore
      }
    }

    for (const userId of createdUserIds) {
      try {
        await prisma.user.delete({ where: { id: userId } });
      } catch (e) {
        // ignore
      }
    }

    await new Promise<void>((resolve) => server.close(() => resolve()));
    process.exit(0);
  }
}

runAdminPhotoUploadSuite().catch((err) => {
  console.error("\n❌ SUITE ERROR:", err);
  process.exit(1);
});
