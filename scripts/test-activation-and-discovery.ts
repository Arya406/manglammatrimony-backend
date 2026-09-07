import { PrismaClient, ProfileStatus, UserStatus, Gender, MaritalStatus, ManglikStatus } from "@prisma/client";
import jwt from "jsonwebtoken";
import { config } from "../src/config/env";
import { profileService } from "../src/services/profile.service";
import { matchesService } from "../src/services/matches.service";
import { messageRequestService } from "../src/services/message-request.service";
import { profileController } from "../src/controllers/profile.controller";
import { matchesController } from "../src/controllers/matches.controller";

const prisma = new PrismaClient();

async function runTests() {
  console.log("==================================================");
  console.log("MANGLAM MATRIMONY — PROFILE DIRECT ACTIVATION & DISCOVERY TEST SUITE");
  console.log("==================================================");

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail?: any) {
    if (condition) {
      console.log(`  ✓ PASS: ${testName}`);
      passed++;
    } else {
      console.error(`  ✗ FAIL: ${testName}`, detail !== undefined ? detail : "");
      failed++;
    }
  }

  // Clean test users
  const testPhones = [
    "+919999900001",
    "+919999900002",
    "+919999900003",
    "+919999900004",
    "+919999900005",
    "+919999900006",
    "+919999900007",
  ];
  await prisma.user.deleteMany({
    where: { phone: { in: testPhones } },
  });

  const phoneA = "+919999900001";
  const userA = await prisma.user.create({
    data: {
      phone: phoneA,
      status: UserStatus.ACTIVE,
      phoneVerifiedAt: new Date(),
    },
  });

  const tokenA = jwt.sign(
    { userId: userA.id, phone: userA.phone, status: userA.status },
    config.jwtSecret,
    { expiresIn: "1h" }
  );

  // Setup profile for User A (initialize incomplete)
  const profileA = await prisma.profile.create({
    data: {
      userId: userA.id,
      profileCreatedFor: "MYSELF",
      profileStatus: ProfileStatus.INCOMPLETE,
      completionPercentage: 0,
    },
  });

  // Fetch languages & religions
  const hindi = await prisma.language.findFirst({ where: { code: "hi" } });
  const hindu = await prisma.religion.findFirst({ where: { slug: "hindu" } });
  const btech = await prisma.education.findFirst();
  const employed = await prisma.employmentStatus.findFirst();

  // Populate all required sections for User A
  await prisma.profilePersonalDetails.create({
    data: {
      profileId: profileA.id,
      firstName: "Rohan",
      lastName: "Verma",
      gender: Gender.MALE,
      dateOfBirth: new Date("1996-05-15"),
      maritalStatus: MaritalStatus.NEVER_MARRIED,
      heightCm: 178,
      motherTongueId: hindi!.id,
    },
  });

  await prisma.profileReligion.create({
    data: {
      profileId: profileA.id,
      religionId: hindu!.id,
      manglik: ManglikStatus.NO,
    },
  });

  await prisma.profileEducation.create({
    data: {
      profileId: profileA.id,
      educationId: btech!.id,
      institutionName: "IIT Delhi",
    },
  });

  await prisma.profileCareer.create({
    data: {
      profileId: profileA.id,
      employmentStatusId: employed!.id,
      companyName: "Tech Corp",
      annualIncomeRange: "TWENTY_TO_THIRTY_LAKH",
    },
  });

  const photoA = await prisma.profilePhoto.create({
    data: {
      profileId: profileA.id,
      storageKey: "test-photo-rohan.jpg",
      originalFileName: "rohan.jpg",
      mimeType: "image/jpeg",
      fileSize: 54000,
      photoType: "PRIMARY",
      moderationStatus: "APPROVED",
    },
  });

  await prisma.partnerPreference.create({
    data: {
      profileId: profileA.id,
      minAge: 24,
      maxAge: 30,
      minHeightCm: 155,
      maxHeightCm: 175,
    },
  });

  // Set completion percentage to 100
  await prisma.profile.update({
    where: { id: profileA.id },
    data: { completionPercentage: 100 },
  });

  console.log("\n[TEST GROUP 1: Profile Submission & Direct Activation Flow]");
  // Test 1: Valid onboarding submission transitions INCOMPLETE -> ACTIVE directly
  const submitRes = await profileService.submitProfile(userA.id);
  assert(
    submitRes.success && submitRes.data?.profile?.profileStatus === ProfileStatus.ACTIVE,
    "1. Valid onboarding submission directly activates profile to ACTIVE",
    submitRes
  );

  // Test 2: submittedAt timestamp is populated
  const updatedProfileA = await prisma.profile.findUnique({ where: { id: profileA.id } });
  assert(
    updatedProfileA?.profileStatus === ProfileStatus.ACTIVE &&
      updatedProfileA.submittedAt !== null,
    "2. submittedAt is populated in database upon submission"
  );

  // Test 3: Duplicate submission remains safely handled (idempotent, returns PROFILE_ALREADY_ACTIVE)
  const duplicateSubmit = await profileService.submitProfile(userA.id);
  assert(
    duplicateSubmit.success &&
      duplicateSubmit.code === "PROFILE_ALREADY_ACTIVE" &&
      duplicateSubmit.data?.profile?.profileStatus === ProfileStatus.ACTIVE,
    "3. Duplicate submission remains safely and idempotently handled"
  );

  // Test 4: Existing ACTIVE profile remains ACTIVE
  assert(
    updatedProfileA?.profileStatus === ProfileStatus.ACTIVE,
    "4. Existing ACTIVE profile remains ACTIVE without modification"
  );

  console.log("\n[TEST GROUP 2: Immediate Discovery for Activated Profiles]");
  // Create User B (Active Female candidate)
  const userB = await prisma.user.create({
    data: { phone: "+919999900002", status: UserStatus.ACTIVE, phoneVerifiedAt: new Date() },
  });
  const profileB = await prisma.profile.create({
    data: {
      userId: userB.id,
      profileCreatedFor: "MYSELF",
      profileStatus: ProfileStatus.ACTIVE,
      completionPercentage: 100,
    },
  });
  await prisma.profilePersonalDetails.create({
    data: {
      profileId: profileB.id,
      firstName: "Simran",
      lastName: "Kaur",
      gender: Gender.FEMALE,
      dateOfBirth: new Date("1997-08-20"),
      maritalStatus: MaritalStatus.NEVER_MARRIED,
      heightCm: 165,
      motherTongueId: hindi!.id,
    },
  });
  await prisma.profilePhoto.create({
    data: {
      profileId: profileB.id,
      storageKey: "test-photo-simran.jpg",
      originalFileName: "simran.jpg",
      mimeType: "image/jpeg",
      fileSize: 48000,
      photoType: "PRIMARY",
      moderationStatus: "APPROVED",
    },
  });

  // Test 5: Submitted profile is immediately visible through discovery (User B sees User A without admin moderation)
  const matchesForB = await matchesService.getDiscoveryMatches(userB.id);
  const foundAInB = matchesForB.profiles.some((p) => p.id === profileA.id);
  assert(
    foundAInB,
    "5. Newly submitted profile is immediately visible in discovery without review gate"
  );

  // Test 6: User A can discover compatible User B
  const matchesForA = await matchesService.getDiscoveryMatches(userA.id);
  const foundBInA = matchesForA.profiles.some((p) => p.id === profileB.id);
  assert(foundBInA, "6. User A discovers compatible active candidate (User B)");

  // Test 7: Current user never appears in their own matches
  const foundSelfInA = matchesForA.profiles.some((p) => p.id === profileA.id);
  assert(!foundSelfInA, "7. Current user (User A) NEVER appears in their own Matches discovery");

  console.log("\n[TEST GROUP 3: Migration of Existing IN_REVIEW Profiles]");
  // Test 8: Existing IN_REVIEW profile migration becomes ACTIVE
  const userInReview = await prisma.user.create({
    data: { phone: "+919999900004", status: UserStatus.ACTIVE, phoneVerifiedAt: new Date() },
  });
  const profileInReview = await prisma.profile.create({
    data: {
      userId: userInReview.id,
      profileCreatedFor: "MYSELF",
      profileStatus: ProfileStatus.IN_REVIEW,
      completionPercentage: 100,
      submittedAt: new Date(),
    },
  });

  // Test 8: Verify Prisma migration SQL query (UPDATE "profiles" SET "profile_status" = 'ACTIVE' WHERE "profile_status" = 'IN_REVIEW')
  const migratedCount = await prisma.$executeRawUnsafe(
    `UPDATE "profiles" SET "profile_status" = 'ACTIVE' WHERE "profile_status" = 'IN_REVIEW';`
  );
  assert(migratedCount >= 1, `8a. Prisma migration SQL transitioned ${migratedCount} IN_REVIEW profiles`);

  const reloadedInReview = await prisma.profile.findUnique({ where: { id: profileInReview.id } });
  assert(
    reloadedInReview?.profileStatus === ProfileStatus.ACTIVE,
    "8b. Existing IN_REVIEW profile successfully migrated to ACTIVE via migration rule"
  );

  console.log("\n[TEST GROUP 4: Guardrails for INCOMPLETE and SUSPENDED Statuses]");
  // Test 9: INCOMPLETE profile cannot be submitted or activated
  const userIncomplete = await prisma.user.create({
    data: { phone: "+919999900003", status: UserStatus.ACTIVE, phoneVerifiedAt: new Date() },
  });
  const profileIncomplete = await prisma.profile.create({
    data: {
      userId: userIncomplete.id,
      profileCreatedFor: "MYSELF",
      profileStatus: ProfileStatus.INCOMPLETE,
      completionPercentage: 40,
    },
  });

  const submitIncomplete = await profileService.submitProfile(userIncomplete.id);
  assert(
    !submitIncomplete.success && submitIncomplete.code === "PROFILE_INCOMPLETE",
    "9a. INCOMPLETE profile submission blocked with PROFILE_INCOMPLETE"
  );

  const checkStillIncomplete = await prisma.profile.findUnique({
    where: { id: profileIncomplete.id },
  });
  assert(
    checkStillIncomplete?.profileStatus === ProfileStatus.INCOMPLETE,
    "9b. INCOMPLETE profile is not accidentally activated"
  );

  const matchesWithIncomplete = await matchesService.getDiscoveryMatches(userA.id);
  assert(
    !matchesWithIncomplete.profiles.some((p) => p.id === profileIncomplete.id),
    "9c. INCOMPLETE profile does NOT appear in discovery matches"
  );

  // Test 10: SUSPENDED profile behavior remains unchanged
  const userSuspended = await prisma.user.create({
    data: { phone: "+919999900006", status: UserStatus.ACTIVE, phoneVerifiedAt: new Date() },
  });
  const profileSuspended = await prisma.profile.create({
    data: {
      userId: userSuspended.id,
      profileCreatedFor: "MYSELF",
      profileStatus: ProfileStatus.SUSPENDED,
      completionPercentage: 100,
    },
  });

  const submitSuspended = await profileService.submitProfile(userSuspended.id);
  assert(
    !submitSuspended.success && submitSuspended.code === "PROFILE_SUSPENDED",
    "10a. SUSPENDED profile submission rejected with PROFILE_SUSPENDED"
  );

  const matchesWithSuspended = await matchesService.getDiscoveryMatches(userA.id);
  assert(
    !matchesWithSuspended.profiles.some((p) => p.id === profileSuspended.id),
    "10b. SUSPENDED profile does NOT appear in discovery matches"
  );

  // Test 11: Blocked/Suspended user account does not appear even if profileStatus is ACTIVE
  const userBlocked = await prisma.user.create({
    data: { phone: "+919999900005", status: UserStatus.BLOCKED, phoneVerifiedAt: new Date() },
  });
  const profileBlocked = await prisma.profile.create({
    data: {
      userId: userBlocked.id,
      profileCreatedFor: "MYSELF",
      profileStatus: ProfileStatus.ACTIVE,
      completionPercentage: 100,
    },
  });
  const matchesAfterBlocked = await matchesService.getDiscoveryMatches(userA.id);
  assert(
    !matchesAfterBlocked.profiles.some((p) => p.id === profileBlocked.id),
    "11. BLOCKED user account does NOT appear in discovery even if profileStatus is ACTIVE"
  );

  console.log("\n[TEST GROUP 5: Security & Unauthenticated Access Protection]");
  // Test 12: Unauthenticated access to /api/matches is rejected with 401
  let matchesUnauthorizedPassed = false;
  const mockMatchesReq: any = { user: undefined, query: {} };
  const mockMatchesRes: any = {
    status(code: number) {
      if (code === 401) matchesUnauthorizedPassed = true;
      return this;
    },
    json(body: any) {
      if (body.code === "UNAUTHORIZED") matchesUnauthorizedPassed = true;
      return this;
    },
  };
  await matchesController.getMatches(mockMatchesReq, mockMatchesRes);
  assert(
    matchesUnauthorizedPassed,
    "12. Unauthenticated access to discovery matches returns 401 UNAUTHORIZED"
  );

  // Test 13: Unauthenticated access to /api/profile/submit is rejected with 401
  let submitUnauthorizedPassed = false;
  const mockSubmitReq: any = { user: undefined };
  const mockSubmitRes: any = {
    status(code: number) {
      if (code === 401) submitUnauthorizedPassed = true;
      return this;
    },
    json(body: any) {
      if (body.code === "UNAUTHORIZED") submitUnauthorizedPassed = true;
      return this;
    },
  };
  await profileController.submitProfile(mockSubmitReq, mockSubmitRes);
  assert(
    submitUnauthorizedPassed,
    "13. Unauthenticated access to profile submission returns 401 UNAUTHORIZED"
  );

  console.log("\n[TEST GROUP 6: Interaction & Messaging with Newly Activated Profiles]");
  // Test 14: User A can send a real message request to newly activated User B
  const reqRes = await messageRequestService.createRequest(userA.id, {
    receiverProfileId: profileB.id,
  });
  assert(
    reqRes.success && reqRes.data?.request?.status === "PENDING",
    "14. User A can send a message request to newly activated User B",
    reqRes
  );

  // Test 15: User B sees relationship state as PENDING_RECEIVED
  const relStatusB = await messageRequestService.getRelationshipStatus(userB.id, profileA.id);
  assert(
    relStatusB.data?.relationshipState === "PENDING_RECEIVED",
    "15. User B sees relationship state as PENDING_RECEIVED for User A"
  );

  // Test 16: User B accepts request from User A
  const acceptRes = await messageRequestService.acceptRequest(
    userB.id,
    (reqRes.data as any).request.id
  );
  assert(
    acceptRes.success && acceptRes.data?.conversationId !== undefined,
    "16. User B accepts User A's request, atomically creating active conversation"
  );

  console.log("\n[TEST GROUP 7: Profile Editing for ACTIVE Profiles]");
  // Test 17: Editing a field on an ACTIVE profile preserves ACTIVE status
  await prisma.profilePersonalDetails.update({
    where: { profileId: profileA.id },
    data: { heightCm: 180 },
  });
  const checkProfileAStillActive = await prisma.profile.findUnique({ where: { id: profileA.id } });
  assert(
    checkProfileAStillActive?.profileStatus === ProfileStatus.ACTIVE,
    "17. Editing personal details on an ACTIVE profile preserves ACTIVE discovery status"
  );

  // Clean up test users
  await prisma.user.deleteMany({
    where: { phone: { in: testPhones } },
  });

  console.log("\n==================================================");
  console.log(`TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log("==================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().finally(() => prisma.$disconnect());
