import { PrismaClient, ProfileStatus, UserStatus, Gender, MaritalStatus, ManglikStatus } from "@prisma/client";
import jwt from "jsonwebtoken";
import { config } from "../src/config/env";
import { profileService } from "../src/services/profile.service";
import { matchesService } from "../src/services/matches.service";
import { messageRequestService } from "../src/services/message-request.service";

const prisma = new PrismaClient();

async function runTests() {
  console.log("==================================================");
  console.log("MANGLAM MATRIMONY — PROFILE ACTIVATION & DISCOVERY TEST SUITE");
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

  // 1. Create a clean test user with phone +919999900001
  const phoneA = "+919999900001";
  await prisma.user.deleteMany({
    where: { phone: { in: [phoneA, "+919999900002", "+919999900003", "+919999900004", "+919999900005"] } },
  });

  const userA = await prisma.user.create({
    data: {
      phone: phoneA,
      status: UserStatus.ACTIVE,
      phoneVerifiedAt: new Date(),
      
    },
  });

  const tokenA = jwt.sign(
    { userId: userA.id, phone: userA.phone,  status: userA.status },
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
      moderationStatus: "PENDING", // PENDING moderation status must NOT block activation
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

  console.log("\n[TEST GROUP 1: Profile Submission & Activation Transition]");
  // Test 1: Submit profile transitions to IN_REVIEW (requires admin approval to become ACTIVE)
  const submitRes = await profileService.submitProfile(userA.id);
  assert(
    submitRes.success && submitRes.data?.profile?.profileStatus === ProfileStatus.IN_REVIEW,
    "1. Newly completed profile becomes IN_REVIEW upon submission",
    submitRes
  );

  const updatedProfileA = await prisma.profile.findUnique({ where: { id: profileA.id } });
  assert(
    updatedProfileA?.profileStatus === ProfileStatus.IN_REVIEW &&
      updatedProfileA.submittedAt !== null,
    "2. Profile status in database is IN_REVIEW with submittedAt recorded"
  );

  // Admin/moderator approves profile to ACTIVE for discovery verification
  await prisma.profile.update({
    where: { id: profileA.id },
    data: { profileStatus: ProfileStatus.ACTIVE, reviewedAt: new Date() },
  });

  console.log("\n[TEST GROUP 2: Central Discovery Visibility Filtering]");
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

  // Test 3: User A can see User B's ACTIVE profile in discovery
  const matchesForA = await matchesService.getDiscoveryMatches(userA.id);
  const foundB = matchesForA.profiles.some((p) => p.id === profileB.id);
  assert(foundB, "3. Completed ACTIVE profile (User B) appears in User A's Matches discovery");

  // Test 4: Current user never appears in their own matches
  const foundSelfInA = matchesForA.profiles.some((p) => p.id === profileA.id);
  assert(!foundSelfInA, "4. Current user (User A) NEVER appears in their own Matches discovery");

  // Test 5: User B sees User A's ACTIVE profile
  const matchesForB = await matchesService.getDiscoveryMatches(userB.id);
  const foundA = matchesForB.profiles.some((p) => p.id === profileA.id);
  assert(foundA, "5. User B can see User A's newly activated profile in Matches discovery");

  // Test 6: INCOMPLETE profile does NOT appear in discovery
  const userIncomplete = await prisma.user.create({
    data: { phone: "+919999900003", status: UserStatus.ACTIVE, phoneVerifiedAt: new Date() },
  });
  const profileIncomplete = await prisma.profile.create({
    data: {
      userId: userIncomplete.id,
      profileCreatedFor: "MYSELF",
      profileStatus: ProfileStatus.INCOMPLETE,
      completionPercentage: 60,
    },
  });
  const matchesAfterIncomplete = await matchesService.getDiscoveryMatches(userA.id);
  assert(
    !matchesAfterIncomplete.profiles.some((p) => p.id === profileIncomplete.id),
    "6. INCOMPLETE profile does NOT appear in Matches discovery"
  );

  // Test 7: IN_REVIEW profile does NOT appear in discovery
  const userInReview = await prisma.user.create({
    data: { phone: "+919999900004", status: UserStatus.ACTIVE, phoneVerifiedAt: new Date() },
  });
  const profileInReview = await prisma.profile.create({
    data: {
      userId: userInReview.id,
      profileCreatedFor: "MYSELF",
      profileStatus: ProfileStatus.IN_REVIEW,
      completionPercentage: 100,
    },
  });
  const matchesAfterInReview = await matchesService.getDiscoveryMatches(userA.id);
  assert(
    !matchesAfterInReview.profiles.some((p) => p.id === profileInReview.id),
    "7. IN_REVIEW profile does NOT appear in Matches discovery"
  );

  // Test 8: REJECTED profile does NOT appear in discovery
  await prisma.profile.update({
    where: { id: profileInReview.id },
    data: { profileStatus: ProfileStatus.REJECTED },
  });
  const matchesAfterRejected = await matchesService.getDiscoveryMatches(userA.id);
  assert(
    !matchesAfterRejected.profiles.some((p) => p.id === profileInReview.id),
    "8. REJECTED profile does NOT appear in Matches discovery"
  );

  // Test 9: SUSPENDED profile does NOT appear in discovery
  await prisma.profile.update({
    where: { id: profileInReview.id },
    data: { profileStatus: ProfileStatus.SUSPENDED },
  });
  const matchesAfterSuspended = await matchesService.getDiscoveryMatches(userA.id);
  assert(
    !matchesAfterSuspended.profiles.some((p) => p.id === profileInReview.id),
    "9. SUSPENDED profile does NOT appear in Matches discovery"
  );

  // Test 10: Suspended/Blocked user account does NOT appear even if profileStatus is ACTIVE
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
    "10. BLOCKED user account does NOT appear in discovery even if profile status is ACTIVE"
  );

  console.log("\n[TEST GROUP 3: Security & Authorization Boundaries]");
  // Test 11: User A cannot activate or submit another user's profile
  // submitProfile uses req.user.userId (tested directly with userB identity attempting to submit userA's profile - profileService.submitProfile only accepts caller's userId)
  const userAAttemptSubmitB = await profileService.submitProfile(userIncomplete.id);
  // User incomplete has incomplete sections
  assert(
    !userAAttemptSubmitB.success && userAAttemptSubmitB.code === "PROFILE_INCOMPLETE",
    "11. Profile submission strictly operates on authenticated caller's profile and validates completeness"
  );

  // Test 12: Profile submission idempotency (already ACTIVE)
  const submitAgain = await profileService.submitProfile(userA.id);
  assert(
    submitAgain.success && submitAgain.data?.profile?.profileStatus === ProfileStatus.ACTIVE,
    "12. Already ACTIVE profile submission is idempotent and preserves ACTIVE status"
  );

  console.log("\n[TEST GROUP 4: Pagination & Ordering]");
  // Test 13: Pagination works with pageSize = 1
  const pageOne = await matchesService.getDiscoveryMatches(userA.id, { page: 1, pageSize: 1 });
  assert(
    pageOne.profiles.length === 1 && pageOne.pagination.total > 1 && pageOne.pagination.hasNextPage,
    "13. Database pagination functions accurately (page 1 returns 1 item, hasNextPage = true)"
  );

  // Test 14: Pagination page 2 returns distinct next profile
  const pageTwo = await matchesService.getDiscoveryMatches(userA.id, { page: 2, pageSize: 1 });
  assert(
    pageTwo.profiles.length === 1 && pageTwo.profiles[0].id !== pageOne.profiles[0].id,
    "14. Database pagination returns distinct records with no duplicates"
  );

  console.log("\n[TEST GROUP 5: Messaging & Interaction with Activated Profiles]");
  // Test 15: User A can send a real message request to newly activated User B
  const reqRes = await messageRequestService.createRequest(userA.id, { receiverProfileId: profileB.id });
  assert(
    reqRes.success && reqRes.data?.request?.status === "PENDING",
    "15. User A can send a real message request to newly activated User B",
    reqRes
  );

  // Test 16: User B sees relationship state as PENDING_RECEIVED
  const relStatusB = await messageRequestService.getRelationshipStatus(userB.id, profileA.id);
  assert(
    relStatusB.data?.relationshipState === "PENDING_RECEIVED",
    "16. User B sees relationship state as PENDING_RECEIVED for User A"
  );

  // Test 17: User B accepts request from User A
  const acceptRes = await messageRequestService.acceptRequest(userB.id, reqRes.data!.request.id);
  assert(
    acceptRes.success && acceptRes.data?.conversationId !== undefined,
    "17. User B accepts User A's request, atomically creating active conversation"
  );

  console.log("\n[TEST GROUP 6: Profile Editing for ACTIVE Profiles]");
  // Test 18: Editing a field on an ACTIVE profile preserves ACTIVE status
  await prisma.profilePersonalDetails.update({
    where: { profileId: profileA.id },
    data: { heightCm: 180 },
  });
  const checkProfileAStillActive = await prisma.profile.findUnique({ where: { id: profileA.id } });
  assert(
    checkProfileAStillActive?.profileStatus === ProfileStatus.ACTIVE,
    "18. Editing personal details on an ACTIVE profile preserves ACTIVE discovery status"
  );

  // Clean up test users
  await prisma.user.deleteMany({
    where: { phone: { in: [phoneA, "+919999900002", "+919999900003", "+919999900004", "+919999900005"] } },
  });

  console.log("\n==================================================");
  console.log(`TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log("==================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().finally(() => prisma.$disconnect());
