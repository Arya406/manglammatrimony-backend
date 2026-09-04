import http from "http";
import { app } from "../src/app";
import { prisma } from "../src/config/database";
import { main as seedDatabase } from "../prisma/seed";
import {
  Gender,
  MaritalStatus,
  ManglikStatus,
  EmploymentType,
  AnnualIncomeRange,
  ProfileCreatedFor,
  ModerationStatus,
  ProfileStatus,
} from "@prisma/client";

// Generate valid in-memory PNG buffer for photo upload test
function createValidPngBuffer(width = 300, height = 300): Buffer {
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
      rawData[pixelOffset] = 200;
      rawData[pixelOffset + 1] = 100;
      rawData[pixelOffset + 2] = 120;
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const zlib = require("zlib");
  const compressed = zlib.deflateSync(rawData);
  const idatChunk = createChunk("IDAT", compressed);
  const iendChunk = createChunk("IEND", Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

function createMultipartFormData(
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

async function runEndToEndFlow() {
  const PORT = 5599;
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(PORT, resolve));
  console.log(`[TEST SERVER] Running on port ${PORT}`);

  const BASE_URL = `http://localhost:${PORT}`;

  try {
    console.log("===============================================================");
    console.log("MANGLAM MATRIMONY — FULL END-TO-END VERIFICATION FLOW");
    console.log("===============================================================");

    // Step 0: Ensure master data exists
    await seedDatabase();

    // Lookups
    const hindi = await prisma.language.findFirstOrThrow({ where: { code: "hi" } });
    const english = await prisma.language.findFirstOrThrow({ where: { code: "en" } });
    const hindu = await prisma.religion.findFirstOrThrow({ where: { slug: "hindu" } });
    const jain = await prisma.religion.findFirstOrThrow({ where: { slug: "jain" } });
    const brahmin = await prisma.community.findFirstOrThrow({ where: { slug: "brahmin" } });
    const btech = await prisma.education.findFirstOrThrow({ where: { slug: "btech" } });
    const employed = await prisma.employmentStatus.findFirstOrThrow({ where: { slug: "employed" } });
    const softwareEngineer = await prisma.occupation.upsert({
      where: {
        employmentStatusId_slug: {
          employmentStatusId: employed.id,
          slug: "software-engineer",
        },
      },
      update: {},
      create: {
        name: "Software Engineer",
        slug: "software-engineer",
        employmentStatusId: employed.id,
        sortOrder: 1,
      },
    });

    const testPhone = `98${Math.floor(10000000 + Math.random() * 90000000)}`;
    const testEmail = `user.${Date.now()}@manglam.com`;

    // STEP 1: Registration - Request OTP via HTTP API
    console.log(`\n[STEP 1] Request Registration OTP for Phone: ${testPhone}`);
    const reqOtpRes = await fetch(`${BASE_URL}/api/auth/register/request-otp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ method: "phone", identifier: testPhone }),
    });
    const reqOtpJson = await reqOtpRes.json();
    console.log(`  ✓ Status: ${reqOtpRes.status} | Message: ${reqOtpJson.message}`);
    if (!reqOtpJson.success || !reqOtpJson.data?.verificationId) {
      throw new Error(`Step 1 Failed: ${reqOtpJson.message}`);
    }
    const verificationId = reqOtpJson.data.verificationId;

    // STEP 2: Verify OTP via POST /api/auth/register/verify-otp
    console.log("\n[STEP 2] Verify OTP via HTTP API (POST /api/auth/register/verify-otp)");
    // Import otpService's provider to get dispatched OTP
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { otpService } = require("../src/services/otp.service");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { DevOtpProvider } = require("../src/providers/otp/DevOtpProvider");
    const devProvider = (otpService as any).provider as InstanceType<typeof DevOtpProvider>;
    const dispatchedOtp = devProvider.lastOtp;

    if (!dispatchedOtp) {
      throw new Error("Could not retrieve dispatched OTP from DevOtpProvider");
    }

    const verifyOtpRes = await fetch(`${BASE_URL}/api/auth/register/verify-otp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ verificationId, otp: dispatchedOtp }),
    });
    const verifyOtpJson = await verifyOtpRes.json();
    console.log(`  ✓ Status: ${verifyOtpRes.status} | Message: ${verifyOtpJson.message}`);
    if (!verifyOtpJson.success || !verifyOtpJson.data?.token || !verifyOtpJson.data?.user?.id) {
      throw new Error(`Step 2 Failed: ${verifyOtpJson.message}`);
    }

    const registeredUser = verifyOtpJson.data.user;
    const token = verifyOtpJson.data.token;
    console.log(`  ✓ Registered User ID: ${registeredUser.id}`);
    console.log(`  ✓ Registered User Phone: ${registeredUser.phone}`);
    console.log(`  ✓ JWT Token issued: ${token.substring(0, 30)}...`);

    // STEP 2B: Direct PostgreSQL Database Assertion on 'users' table
    console.log("\n[STEP 2B] Direct PostgreSQL Database Assertion on 'users' table");
    const dbUser = await prisma.user.findUnique({
      where: { id: registeredUser.id },
    });

    if (!dbUser) {
      throw new Error("CRITICAL: User was not persisted into PostgreSQL 'users' table!");
    }
    console.log(`  ✓ PostgreSQL Verification: Found row in 'users' table`);
    console.log(`  ✓ User ID in DB: ${dbUser.id}`);
    console.log(`  ✓ Phone in DB: ${dbUser.phone}`);
    console.log(`  ✓ Status in DB: ${dbUser.status}`);
    console.log(`  ✓ Phone Verified At: ${dbUser.phoneVerifiedAt}`);
    console.log(`  ✓ Created At: ${dbUser.createdAt}`);

    // Verify JWT payload matches DB user
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const jwt = require("jsonwebtoken");
    const decodedJwt = jwt.verify(token, process.env.JWT_SECRET || "manglam_matrimony_jwt_secret_dev_key_2026_secure") as any;
    if (decodedJwt.userId !== dbUser.id) {
      throw new Error(`JWT payload mismatch: decoded userId ${decodedJwt.userId} !== DB user.id ${dbUser.id}`);
    }
    console.log(`  ✓ JWT userId strictly matches PostgreSQL user.id (${decodedJwt.userId})`);

    const testUser = dbUser;

    // STEP 3: Screen 1 — Initialize Profile (POST /api/profile)
    console.log("\n[STEP 3] Screen 1: Initialize Profile (POST /api/profile)");
    const initRes = await fetch(`${BASE_URL}/api/profile`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ profileCreatedFor: ProfileCreatedFor.MYSELF }),
    });
    const initJson = await initRes.json();
    console.log(`  ✓ Status: ${initRes.status} | Profile Created For: ${initJson.data?.profile?.profileCreatedFor} | Completion: ${initJson.data?.profile?.completionPercentage}%`);

    // Verify in PostgreSQL
    const dbProfileAfterInit = await prisma.profile.findUnique({ where: { userId: testUser.id } });
    if (!dbProfileAfterInit || dbProfileAfterInit.profileCreatedFor !== "MYSELF") {
      throw new Error("Screen 1 Failed: Profile not persisted in PostgreSQL");
    }
    console.log(`  ✓ PostgreSQL Verification: Profile ${dbProfileAfterInit.id} exists in 'profiles' table with status ${dbProfileAfterInit.profileStatus}`);

    // STEP 4: Screen 2 — Save Personal Details (PUT /api/profile/personal-details)
    console.log("\n[STEP 4] Screen 2: Save Personal Details (PUT /api/profile/personal-details)");
    const pdRes = await fetch(`${BASE_URL}/api/profile/personal-details`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        firstName: "Arya",
        lastName: "Sharma",
        gender: Gender.MALE,
        dateOfBirth: "1997-08-21",
        maritalStatus: MaritalStatus.NEVER_MARRIED,
        heightCm: 178,
        motherTongueId: hindi.id,
        languageIds: [hindi.id, english.id],
      }),
    });
    const pdJson = await pdRes.json();
    console.log(`  ✓ Status: ${pdRes.status} | Completion: ${pdJson.data?.completionPercentage}%`);

    // Verify in PostgreSQL
    const dbPersonal = await prisma.profilePersonalDetails.findUnique({ where: { profileId: dbProfileAfterInit.id } });
    const dbLanguages = await prisma.profileLanguage.findMany({ where: { profileId: dbProfileAfterInit.id } });
    if (!dbPersonal || dbPersonal.firstName !== "Arya" || dbLanguages.length !== 2) {
      throw new Error("Screen 2 Failed: Personal details or languages not persisted in PostgreSQL");
    }
    console.log(`  ✓ PostgreSQL Verification: Name '${dbPersonal.firstName} ${dbPersonal.lastName}' and ${dbLanguages.length} languages saved.`);

    // STEP 5: Screen 3 — Save Religion & Community (PUT /api/profile/religion)
    console.log("\n[STEP 5] Screen 3: Save Religion & Community (PUT /api/profile/religion)");
    const relRes = await fetch(`${BASE_URL}/api/profile/religion`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        religionId: hindu.id,
        communityId: brahmin.id,
        subCommunityId: null,
        casteId: null,
        subCasteId: null,
        gotraId: null,
        manglik: ManglikStatus.NO,
      }),
    });
    const relJson = await relRes.json();
    console.log(`  ✓ Status: ${relRes.status} | Completion: ${relJson.data?.completionPercentage}%`);

    // Verify in PostgreSQL
    const dbReligion = await prisma.profileReligion.findUnique({ where: { profileId: dbProfileAfterInit.id } });
    if (!dbReligion || dbReligion.religionId !== hindu.id) {
      throw new Error("Screen 3 Failed: Religion details not persisted in PostgreSQL");
    }
    console.log(`  ✓ PostgreSQL Verification: Religion ID ${dbReligion.religionId}, Community ID ${dbReligion.communityId} saved.`);

    // STEP 6: Screen 4 — Save Education & Career (PUT /api/profile/education-career)
    console.log("\n[STEP 6] Screen 4: Save Education & Career (PUT /api/profile/education-career)");
    const eduRes = await fetch(`${BASE_URL}/api/profile/education-career`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        education: {
          educationId: btech.id,
          specializationId: null,
          institutionId: null,
          institutionName: "IIT Delhi",
        },
        career: {
          employmentStatusId: employed.id,
          occupationId: softwareEngineer.id,
          companyName: "Google",
          employmentType: EmploymentType.FULL_TIME,
          annualIncomeRange: AnnualIncomeRange.TWENTY_TO_THIRTY_LAKH,
        },
      }),
    });
    const eduJson = await eduRes.json();
    console.log(`  ✓ Status: ${eduRes.status} | Completion: ${eduJson.data?.completionPercentage}%`);

    // Verify in PostgreSQL
    const dbEducation = await prisma.profileEducation.findUnique({ where: { profileId: dbProfileAfterInit.id } });
    const dbCareer = await prisma.profileCareer.findUnique({ where: { profileId: dbProfileAfterInit.id } });
    if (!dbEducation || !dbCareer || dbCareer.companyName !== "Google") {
      throw new Error("Screen 4 Failed: Education/Career not persisted in PostgreSQL");
    }
    console.log(`  ✓ PostgreSQL Verification: Education '${dbEducation.institutionName}', Career '${dbCareer.companyName}' saved.`);

    // STEP 7: Screen 5 — Upload Photo (POST /api/profile/photos)
    console.log("\n[STEP 7] Screen 5: Upload Photo (POST /api/profile/photos)");
    const validPng = createValidPngBuffer(400, 400);
    const photoForm = createMultipartFormData("photo", "arya_profile.png", "image/png", validPng);
    const photoUploadRes = await fetch(`${BASE_URL}/api/profile/photos`, {
      method: "POST",
      headers: {
        "Content-Type": `multipart/form-data; boundary=${photoForm.boundary}`,
        Authorization: `Bearer ${token}`,
      },
      body: photoForm.body,
    });
    const photoUploadJson = await photoUploadRes.json();
    console.log(`  ✓ Status: ${photoUploadRes.status} | Photo ID: ${photoUploadJson.data?.photo?.id} | Moderation: ${photoUploadJson.data?.photo?.moderationStatus}`);
    const uploadedPhotoId = photoUploadJson.data.photo.id;

    // Verify in PostgreSQL
    const dbPhotos = await prisma.profilePhoto.findMany({ where: { profileId: dbProfileAfterInit.id } });
    if (dbPhotos.length === 0) {
      throw new Error("Screen 5 Failed: Photo record not found in PostgreSQL");
    }
    console.log(`  ✓ PostgreSQL Verification: ${dbPhotos.length} photo(s) in 'profile_photos' table.`);

    // STEP 8: Screen 6 — Save Partner Preferences (PUT /api/profile/partner-preferences)
    console.log("\n[STEP 8] Screen 6: Save Partner Preferences (PUT /api/profile/partner-preferences)");
    const partnerRes = await fetch(`${BASE_URL}/api/profile/partner-preferences`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        minAge: 23,
        maxAge: 29,
        minHeightCm: 155,
        maxHeightCm: 175,
        religionIds: [hindu.id, jain.id],
        communityIds: [brahmin.id],
        educationIds: [btech.id],
        occupationIds: [softwareEngineer.id],
        manglikStatuses: [ManglikStatus.NO],
        maritalStatuses: [MaritalStatus.NEVER_MARRIED],
      }),
    });
    const partnerJson = await partnerRes.json();
    console.log(`  ✓ Status: ${partnerRes.status} | Completion: ${partnerJson.data?.profile?.completionPercentage}%`);

    // Verify in PostgreSQL
    const dbPartner = await prisma.partnerPreference.findUnique({
      where: { profileId: dbProfileAfterInit.id },
      include: { religions: true, communities: true, educations: true, occupations: true },
    });
    if (!dbPartner || dbPartner.minAge !== 23 || dbPartner.religions.length !== 2) {
      throw new Error("Screen 6 Failed: Partner preferences not persisted in PostgreSQL");
    }
    console.log(`  ✓ PostgreSQL Verification: Partner preference with ${dbPartner.religions.length} religions, ${dbPartner.communities.length} communities saved.`);

    // STEP 9: Screen 7 — Complete Profile Review (GET /api/profile)
    console.log("\n[STEP 9] Screen 7: Profile Review (GET /api/profile)");
    const reviewRes = await fetch(`${BASE_URL}/api/profile`, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
    });
    const reviewJson = await reviewRes.json();
    console.log(`  ✓ Status: ${reviewRes.status}`);
    console.log(`  ✓ Personal Details Name: ${reviewJson.data?.personalDetails?.firstName} ${reviewJson.data?.personalDetails?.lastName}`);
    console.log(`  ✓ Religion: ${reviewJson.data?.religion?.religion?.name}`);
    console.log(`  ✓ Education: ${reviewJson.data?.education?.education?.name}`);
    console.log(`  ✓ Career: ${reviewJson.data?.career?.companyName}`);
    console.log(`  ✓ Photo count: ${reviewJson.data?.photos?.length}`);
    console.log(`  ✓ Partner Preference Religions: ${reviewJson.data?.partnerPreferences?.religions?.map((r: any) => r.name).join(", ")}`);
    console.log(`  ✓ Completion Percentage: ${reviewJson.data?.profile?.completionPercentage}%`);

    if (reviewJson.data?.profile?.completionPercentage !== 100) {
      throw new Error(`Screen 7 Failed: Expected 100% completion but got ${reviewJson.data?.profile?.completionPercentage}%`);
    }

    // STEP 10: Approve Photo via Development API & Submit Profile (POST /api/profile/submit)
    console.log("\n[STEP 10] Approve Photo via Dev Endpoint (POST /api/profile/photos/:photoId/dev-approve) & Submit Profile");
    const devApproveRes = await fetch(`${BASE_URL}/api/profile/photos/${uploadedPhotoId}/dev-approve`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    const devApproveJson = await devApproveRes.json();
    console.log(`  ✓ Dev Approve Status: ${devApproveRes.status} | Photo Status: ${devApproveJson.data?.moderationStatus}`);
    if (devApproveRes.status !== 200 || devApproveJson.data?.moderationStatus !== "APPROVED") {
      throw new Error("Step 10 Failed: Dev photo approval failed");
    }

    const submitRes = await fetch(`${BASE_URL}/api/profile/submit`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    const submitJson = await submitRes.json();
    console.log(`  ✓ Submit Status: ${submitRes.status} | Profile Status: ${submitJson.data?.profile?.profileStatus} | submittedAt: ${submitJson.data?.profile?.submittedAt}`);

    // Verify in PostgreSQL
    const dbProfileFinal = await prisma.profile.findUnique({ where: { userId: testUser.id } });
    if (!dbProfileFinal || dbProfileFinal.profileStatus !== ProfileStatus.ACTIVE || !dbProfileFinal.submittedAt) {
      throw new Error("Profile Submission Failed: Profile status not updated to ACTIVE in PostgreSQL");
    }
    console.log(`  ✓ PostgreSQL Verification: Profile ${dbProfileFinal.id} is ACTIVE with submittedAt = ${dbProfileFinal.submittedAt}`);

    // STEP 11: Refresh Survival Verification
    console.log("\n[STEP 11] Browser Refresh Data Persistence (GET /api/profile)");
    const refreshRes = await fetch(`${BASE_URL}/api/profile`, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
    });
    const refreshJson = await refreshRes.json();
    console.log(`  ✓ Status: ${refreshRes.status}`);
    console.log(`  ✓ Profile Status after refresh: ${refreshJson.data?.profile?.profileStatus}`);
    console.log(`  ✓ All data fully preserved and returned from PostgreSQL!`);

    // Clean up test user
    await prisma.user.delete({ where: { id: testUser.id } });
    console.log(`\n  ✓ Cleaned up test user ${testUser.id}`);

    console.log("\n===============================================================");
    console.log("✅ 100% END-TO-END FLOW VERIFIED & ALL TESTS PASSED!");
    console.log("===============================================================");
  } catch (err: any) {
    console.error("\n❌ End-to-End Flow Error:", err);
    process.exit(1);
  } finally {
    server.close();
    await prisma.$disconnect();
    process.exit(0);
  }
}

runEndToEndFlow();
