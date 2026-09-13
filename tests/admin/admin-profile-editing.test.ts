import "dotenv/config";
import http from "http";
import jwt from "jsonwebtoken";
import { app } from "../../src/app";
import { prisma } from "../../src/config/database";
import { config } from "../../src/config/env";
import {
  UserRole,
  UserStatus,
  AccountActivationStatus,
  ProfileStatus,
  ProfileCreatedFor,
  Gender,
  MaritalStatus,
  ManglikStatus,
  EmploymentType,
  AnnualIncomeRange,
} from "@prisma/client";

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`  ✗ FAIL: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
  console.log(`  ✓ PASS: ${message}`);
}

export async function runStep7TestSuite() {
  console.log("==================================================");
  console.log("MANGLAM MATRIMONY — STEP 7: PROFILE EDITING & MANAGEMENT TEST SUITE");
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

  // Spin up ephemeral test server
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as any).port;
  const baseUrl = `http://127.0.0.1:${port}`;

  let passedTests = 0;
  const cleanupUserIds: string[] = [];

  try {
    // ----------------------------------------------------
    // SETUP: Authenticate Administrator
    // ----------------------------------------------------
    console.log("\n[SETUP] Authenticating Administrator...");
    const loginRes = await fetch(`${baseUrl}/api/admin/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: normalizedEmail, password: adminPassword }),
    });
    const loginJson: any = await loginRes.json();
    assert(loginRes.status === 200, "Admin login returned 200 OK");
    const adminToken = loginJson.data.token;

    // Normal USER token for 403 test
    let normalUser = await prisma.user.findFirst({
      where: { role: UserRole.USER, status: UserStatus.ACTIVE },
    });
    if (!normalUser) {
      normalUser = await prisma.user.create({
        data: {
          email: `temp.normal.${Date.now()}@example.com`,
          role: UserRole.USER,
          status: UserStatus.ACTIVE,
        },
      });
      cleanupUserIds.push(normalUser.id);
    }
    const candidateToken = jwt.sign(
      { userId: normalUser.id, role: "USER", status: "ACTIVE" },
      config.jwtSecret,
      { expiresIn: "1h" }
    );

    // Fetch Master Data
    console.log("[SETUP] Fetching master data references...");
    const hinduReligion = await prisma.religion.findFirst({ where: { slug: "hindu" } });
    const otherReligion = await prisma.religion.findFirst({ where: { slug: "other" } });
    const preferReligion = await prisma.religion.findFirst({ where: { slug: "prefer-not-to-say" } });
    const muslimReligion = await prisma.religion.findFirst({ where: { slug: "muslim" } });
    const languages = await prisma.language.findMany({ take: 3 });
    const educations = await prisma.education.findMany({ take: 2 });
    const occupation = await prisma.occupation.findFirstOrThrow({
      where: { isActive: true },
      include: { employmentStatus: true },
    });
    const employmentStatus = occupation.employmentStatus;

    assert(Boolean(hinduReligion), "Hindu religion exists in DB");
    assert(Boolean(otherReligion), "Other religion exists in DB");
    assert(languages.length >= 2, "At least 2 languages exist in DB");
    assert(educations.length >= 1, "At least 1 education exists in DB");
    assert(Boolean(occupation), "Occupation exists in DB");

    // Community for Hindu
    let hinduCommunity = await prisma.community.findFirst({
      where: { religionId: hinduReligion!.id, slug: { notIn: ["other", "prefer-not-to-say"] } },
    });
    if (!hinduCommunity) {
      hinduCommunity = await prisma.community.findFirst({
        where: { slug: "brahmin" },
      });
    }
    assert(Boolean(hinduCommunity), "Community exists for Hindu tests");

    // Community for Muslim (to test invalid hierarchy)
    let muslimCommunity = await prisma.community.findFirst({
      where: { religionId: muslimReligion?.id },
    });

    // Create a Step 6 profile shell for tests (personalDetails === null)
    console.log("[SETUP] Creating test user with profile shell (Step 6 style)...");
    const testUser = await prisma.user.create({
      data: {
        email: `test.profile.edit.${Date.now()}@example.com`,
        role: UserRole.USER,
        status: UserStatus.ACTIVE,
        activationStatus: AccountActivationStatus.PENDING_ACTIVATION,
        profile: {
          create: {
            profileCreatedFor: ProfileCreatedFor.MYSELF,
            profileStatus: ProfileStatus.INCOMPLETE,
            completionPercentage: 10,
          },
        },
      },
      include: { profile: true },
    });
    cleanupUserIds.push(testUser.id);
    const profileId = testUser.profile!.id;

    // ====================================================
    // TEST 1: Unauthenticated -> 401
    // ====================================================
    console.log("\n[TEST 1] Unauthenticated request returns 401 Unauthorized");
    const test1Res = await fetch(`${baseUrl}/api/admin/profiles/${profileId}/profile-created-for`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        profileCreatedFor: "MY_SON",
        expectedUpdatedAt: testUser.profile!.updatedAt.toISOString(),
      }),
    });
    assert(test1Res.status === 401, "Test 1: Unauthenticated request returns 401");
    passedTests++;

    // ====================================================
    // TEST 2: Candidate token -> 403 Forbidden
    // ====================================================
    console.log("\n[TEST 2] Candidate user token returns 403 Forbidden");
    const test2Res = await fetch(`${baseUrl}/api/admin/profiles/${profileId}/profile-created-for`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${candidateToken}`,
      },
      body: JSON.stringify({
        profileCreatedFor: "MY_SON",
        expectedUpdatedAt: testUser.profile!.updatedAt.toISOString(),
      }),
    });
    assert(test2Res.status === 403, "Test 2: Candidate token returns 403");
    passedTests++;

    // ====================================================
    // TEST 3: Admin success -> 200 OK
    // ====================================================
    console.log("\n[TEST 3] Admin success returns 200 OK");
    const currentProfile = await prisma.profile.findUniqueOrThrow({ where: { id: profileId } });
    const test3Res = await fetch(`${baseUrl}/api/admin/profiles/${profileId}/profile-created-for`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        profileCreatedFor: "MY_DAUGHTER",
        expectedUpdatedAt: currentProfile.updatedAt.toISOString(),
      }),
    });
    const test3Json: any = await test3Res.json();
    assert(test3Res.status === 200, "Test 3: Admin success returns 200");
    assert(test3Json.success === true, "Test 3: success flag is true");
    assert(test3Json.data.profile.profileCreatedFor === "MY_DAUGHTER", "Test 3: ProfileCreatedFor updated");
    passedTests++;

    // ====================================================
    // TEST 4: Missing profile -> 404
    // ====================================================
    console.log("\n[TEST 4] Non-existent profile ID returns 404");
    const fakeId = "00000000-0000-0000-0000-000000000000";
    const test4Res = await fetch(`${baseUrl}/api/admin/profiles/${fakeId}/profile-created-for`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        profileCreatedFor: "MY_SON",
        expectedUpdatedAt: new Date().toISOString(),
      }),
    });
    assert(test4Res.status === 404, "Test 4: Non-existent profile returns 404");
    passedTests++;

    // ====================================================
    // TEST 5: Missing expectedUpdatedAt -> 400
    // ====================================================
    console.log("\n[TEST 5] Missing expectedUpdatedAt returns 400 VALIDATION_ERROR");
    const test5Res = await fetch(`${baseUrl}/api/admin/profiles/${profileId}/profile-created-for`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        profileCreatedFor: "MY_SON",
      }),
    });
    const test5Json: any = await test5Res.json();
    assert(test5Res.status === 400, "Test 5: Missing expectedUpdatedAt returns 400");
    assert(test5Json.code === "VALIDATION_ERROR", "Test 5: code is VALIDATION_ERROR");
    passedTests++;

    // ====================================================
    // TEST 6: Malformed expectedUpdatedAt -> 400
    // ====================================================
    console.log("\n[TEST 6] Malformed expectedUpdatedAt returns 400 VALIDATION_ERROR");
    const test6Res = await fetch(`${baseUrl}/api/admin/profiles/${profileId}/profile-created-for`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        profileCreatedFor: "MY_SON",
        expectedUpdatedAt: "not-a-date",
      }),
    });
    const test6Json: any = await test6Res.json();
    assert(test6Res.status === 400, "Test 6: Malformed expectedUpdatedAt returns 400");
    assert(test6Json.code === "VALIDATION_ERROR", "Test 6: code is VALIDATION_ERROR");
    passedTests++;

    // ====================================================
    // TEST 7: Stale expectedUpdatedAt -> 409 PROFILE_EDIT_CONFLICT
    // ====================================================
    console.log("\n[TEST 7] Stale expectedUpdatedAt returns 409 PROFILE_EDIT_CONFLICT");
    const staleDate = new Date(Date.now() - 3600000).toISOString();
    const test7Res = await fetch(`${baseUrl}/api/admin/profiles/${profileId}/profile-created-for`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        profileCreatedFor: "MY_SON",
        expectedUpdatedAt: staleDate,
      }),
    });
    const test7Json: any = await test7Res.json();
    assert(test7Res.status === 409, "Test 7: Stale timestamp returns 409 Conflict");
    assert(test7Json.code === "PROFILE_EDIT_CONFLICT", "Test 7: code is PROFILE_EDIT_CONFLICT");
    passedTests++;

    // ====================================================
    // TEST 8: Stale update rolls back child/audit changes
    // ====================================================
    console.log("\n[TEST 8] Stale update rolls back child and audit changes");
    const beforeStale = await prisma.profile.findUniqueOrThrow({
      where: { id: profileId },
      include: { personalDetails: true },
    });
    const stalePersonalRes = await fetch(`${baseUrl}/api/admin/profiles/${profileId}/personal-details`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        firstName: "ShouldRollback",
        lastName: "ShouldRollback",
        gender: "MALE",
        dateOfBirth: "1995-05-15",
        maritalStatus: "NEVER_MARRIED",
        heightCm: 175,
        motherTongueId: languages[0].id,
        languageIds: [languages[0].id],
        city: "Jaipur",
        state: "Rajasthan",
        expectedUpdatedAt: staleDate,
      }),
    });
    assert(stalePersonalRes.status === 409, "Test 8: Rejected with 409");
    const afterStale = await prisma.profile.findUniqueOrThrow({
      where: { id: profileId },
      include: { personalDetails: true },
    });
    assert(afterStale.personalDetails === null, "Test 8: Child table was not modified");
    assert(afterStale.updatedAt.getTime() === beforeStale.updatedAt.getTime(), "Test 8: Profile updatedAt untouched");
    passedTests++;

    // ====================================================
    // TEST 9: Future DOB rejected -> 400
    // ====================================================
    console.log("\n[TEST 9] Future dateOfBirth rejected with 400");
    const profileFor9 = await prisma.profile.findUniqueOrThrow({ where: { id: profileId } });
    const futureDate = new Date(Date.now() + 86400000 * 365).toISOString().split("T")[0];
    const test9Res = await fetch(`${baseUrl}/api/admin/profiles/${profileId}/personal-details`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        firstName: "Future",
        lastName: "Person",
        gender: "MALE",
        dateOfBirth: futureDate,
        maritalStatus: "NEVER_MARRIED",
        heightCm: 175,
        motherTongueId: languages[0].id,
        languageIds: [languages[0].id],
        city: "Jaipur",
        state: "Rajasthan",
        expectedUpdatedAt: profileFor9.updatedAt.toISOString(),
      }),
    });
    assert(test9Res.status === 400, "Test 9: Future DOB rejected with 400");
    passedTests++;

    // ====================================================
    // TEST 10: Invalid master data rejected -> 400
    // ====================================================
    console.log("\n[TEST 10] Non-existent master data ID rejected with 400");
    const profileFor10 = await prisma.profile.findUniqueOrThrow({ where: { id: profileId } });
    const test10Res = await fetch(`${baseUrl}/api/admin/profiles/${profileId}/personal-details`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        firstName: "Rahul",
        lastName: "Sharma",
        gender: "MALE",
        dateOfBirth: "1994-01-01",
        maritalStatus: "NEVER_MARRIED",
        heightCm: 175,
        motherTongueId: fakeId,
        languageIds: [languages[0].id],
        city: "Jaipur",
        state: "Rajasthan",
        expectedUpdatedAt: profileFor10.updatedAt.toISOString(),
      }),
    });
    assert(test10Res.status === 400, "Test 10: Non-existent language ID rejected with 400");
    passedTests++;

    // ====================================================
    // TEST 11: Invalid cultural relationship rejected -> 400
    // ====================================================
    console.log("\n[TEST 11] Invalid cultural relationship rejected with 400");
    const profileFor11 = await prisma.profile.findUniqueOrThrow({ where: { id: profileId } });
    // Try to pair Muslim religion with Hindu community if muslimCommunity exists, or Hindu with Muslim community
    let mismatchReligionId = hinduReligion!.id;
    let mismatchCommunityId = muslimCommunity?.id;
    if (!mismatchCommunityId) {
      // Find or create mismatched pair
      mismatchReligionId = otherReligion!.id;
      mismatchCommunityId = hinduCommunity!.id;
    }
    const test11Res = await fetch(`${baseUrl}/api/admin/profiles/${profileId}/religion`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        religionId: mismatchReligionId,
        communityId: mismatchCommunityId,
        manglik: "NO",
        expectedUpdatedAt: profileFor11.updatedAt.toISOString(),
      }),
    });
    assert(test11Res.status === 400, "Test 11: Cultural mismatch rejected with 400");
    passedTests++;

    // ====================================================
    // TEST 12: Other without custom text rejected -> 400
    // ====================================================
    console.log("\n[TEST 12] Other religion without customReligion rejected with 400");
    const profileFor12 = await prisma.profile.findUniqueOrThrow({ where: { id: profileId } });
    const test12Res = await fetch(`${baseUrl}/api/admin/profiles/${profileId}/religion`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        religionId: otherReligion!.id,
        customReligion: "", // empty
        manglik: "NO",
        expectedUpdatedAt: profileFor12.updatedAt.toISOString(),
      }),
    });
    assert(test12Res.status === 400, "Test 12: Other without custom text rejected with 400");
    passedTests++;

    // ====================================================
    // TEST 13: Prefer Not To Say preserved
    // ====================================================
    console.log("\n[TEST 13] Prefer Not To Say preserved without custom text");
    const profileFor13 = await prisma.profile.findUniqueOrThrow({ where: { id: profileId } });
    const test13Res = await fetch(`${baseUrl}/api/admin/profiles/${profileId}/religion`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        religionId: preferReligion!.id,
        manglik: "NO",
        expectedUpdatedAt: profileFor13.updatedAt.toISOString(),
      }),
    });
    assert(test13Res.status === 200, "Test 13: Prefer Not To Say accepted with 200");
    passedTests++;

    // ====================================================
    // TEST 14: Not Applicable preserved
    // ====================================================
    console.log("\n[TEST 14] Manglik NOT_APPLICABLE accepted and preserved");
    const profileFor14 = await prisma.profile.findUniqueOrThrow({ where: { id: profileId } });
    const test14Res = await fetch(`${baseUrl}/api/admin/profiles/${profileId}/religion`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        religionId: hinduReligion!.id,
        communityId: hinduCommunity!.id,
        manglik: "NOT_APPLICABLE",
        expectedUpdatedAt: profileFor14.updatedAt.toISOString(),
      }),
    });
    const test14Json: any = await test14Res.json();
    assert(test14Res.status === 200, "Test 14: NOT_APPLICABLE accepted with 200");
    assert(test14Json.data.religion.manglik === "NOT_APPLICABLE", "Test 14: Manglik is NOT_APPLICABLE");
    passedTests++;

    // ====================================================
    // TEST 15: Cultural dependency clearing
    // ====================================================
    console.log("\n[TEST 15] Cultural dependency clearing when parent changed");
    const profileFor15 = await prisma.profile.findUniqueOrThrow({ where: { id: profileId } });
    // Switch religion to Sikh or Jain or Buddhist without community
    const sikhReligion = await prisma.religion.findFirst({ where: { slug: "sikh" } });
    assert(Boolean(sikhReligion), "Sikh religion exists");
    const test15Res = await fetch(`${baseUrl}/api/admin/profiles/${profileId}/religion`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        religionId: sikhReligion!.id,
        communityId: null,
        subCommunityId: null,
        casteId: null,
        subCasteId: null,
        gotraId: null,
        manglik: "NO",
        expectedUpdatedAt: profileFor15.updatedAt.toISOString(),
      }),
    });
    const test15Json: any = await test15Res.json();
    assert(test15Res.status === 200, "Test 15: Religion switched successfully");
    assert(test15Json.data.religion.religionId === sikhReligion!.id, "Test 15: Religion updated");
    assert(test15Json.data.religion.communityId === null, "Test 15: Community cleared");
    assert(test15Json.data.religion.casteId === null, "Test 15: Caste cleared");
    passedTests++;

    // ====================================================
    // TEST 16: Step 6 personalDetails-null shell can be populated
    // ====================================================
    console.log("\n[TEST 16] Step 6 shell with personalDetails=null can be populated (atomic create branch)");
    const profileFor16 = await prisma.profile.findUniqueOrThrow({
      where: { id: profileId },
      include: { personalDetails: true },
    });
    assert(profileFor16.personalDetails === null, "Pre-condition: personalDetails is null");
    const test16Res = await fetch(`${baseUrl}/api/admin/profiles/${profileId}/personal-details`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        firstName: "Aarav",
        lastName: "Sharma",
        gender: "MALE",
        dateOfBirth: "1993-08-20",
        maritalStatus: "NEVER_MARRIED",
        heightCm: 180,
        motherTongueId: languages[0].id,
        languageIds: [languages[0].id, languages[1].id],
        city: "Jaipur",
        state: "Rajasthan",
        expectedUpdatedAt: profileFor16.updatedAt.toISOString(),
      }),
    });
    const test16Json: any = await test16Res.json();
    assert(test16Res.status === 200, "Test 16: Personal details create branch returns 200");
    assert(test16Json.data.personalDetails !== null, "Test 16: Personal details created");
    assert(test16Json.data.personalDetails.firstName === "Aarav", "Test 16: First name saved");
    assert(test16Json.data.languages.length === 2, "Test 16: Spoken languages synced");
    passedTests++;

    // ====================================================
    // TEST 17: Existing personal details updated in place
    // ====================================================
    console.log("\n[TEST 17] Existing personal details updated in place (atomic update branch)");
    const profileFor17 = await prisma.profile.findUniqueOrThrow({
      where: { id: profileId },
      include: { personalDetails: true },
    });
    assert(profileFor17.personalDetails !== null, "Pre-condition: personalDetails exists");
    const test17Res = await fetch(`${baseUrl}/api/admin/profiles/${profileId}/personal-details`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        firstName: "Aarav",
        lastName: "Verma",
        gender: "MALE",
        dateOfBirth: "1993-08-20",
        maritalStatus: "NEVER_MARRIED",
        heightCm: 182,
        motherTongueId: languages[0].id,
        languageIds: [languages[0].id],
        city: "Udaipur",
        state: "Rajasthan",
        expectedUpdatedAt: profileFor17.updatedAt.toISOString(),
      }),
    });
    const test17Json: any = await test17Res.json();
    assert(test17Res.status === 200, "Test 17: Update in place returns 200");
    assert(test17Json.data.personalDetails.lastName === "Verma", "Test 17: Last name updated");
    assert(test17Json.data.personalDetails.heightCm === 182, "Test 17: Height updated");
    assert(test17Json.data.personalDetails.city === "Udaipur", "Test 17: City updated");
    assert(test17Json.data.languages.length === 1, "Test 17: Spoken languages synced to 1");
    passedTests++;

    // ====================================================
    // TEST 18: Education + career atomic update
    // ====================================================
    console.log("\n[TEST 18] Education + Career atomic update");
    const profileFor18 = await prisma.profile.findUniqueOrThrow({ where: { id: profileId } });
    const test18Res = await fetch(`${baseUrl}/api/admin/profiles/${profileId}/education-career`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        education: {
          educationId: educations[0].id,
          specializationId: null,
          institutionId: null,
          institutionName: "IIT Delhi",
        },
        career: {
          employmentStatusId: employmentStatus.id,
          occupationId: occupation.id,
          companyName: "Google",
          employmentType: "FULL_TIME",
          annualIncomeRange: "TWENTY_TO_THIRTY_LAKH",
        },
        expectedUpdatedAt: profileFor18.updatedAt.toISOString(),
      }),
    });
    const test18Json: any = await test18Res.json();
    if (test18Res.status !== 200) {
      console.log("Test 18 failed with:", test18Res.status, test18Json);
    }
    assert(test18Res.status === 200, "Test 18: Education & career saved with 200");
    assert(test18Json.data.education.institutionName === "IIT Delhi", "Test 18: Education institution saved");
    assert(test18Json.data.career.companyName === "Google", "Test 18: Company saved");
    assert(test18Json.data.career.annualIncomeRange === "TWENTY_TO_THIRTY_LAKH", "Test 18: Income saved");
    passedTests++;

    // ====================================================
    // TEST 19: Partner preferences atomic update
    // ====================================================
    console.log("\n[TEST 19] Partner Preferences atomic update and junction sync");
    const profileFor19 = await prisma.profile.findUniqueOrThrow({ where: { id: profileId } });
    const test19Res = await fetch(`${baseUrl}/api/admin/profiles/${profileId}/partner-preferences`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        minAge: 24,
        maxAge: 30,
        minHeightCm: 155,
        maxHeightCm: 180,
        religionIds: [hinduReligion!.id],
        communityIds: [hinduCommunity!.id],
        subCommunityIds: [],
        casteIds: [],
        gotraIds: [],
        educationIds: [educations[0].id],
        occupationIds: [occupation.id],
        manglikStatuses: ["NO", "DONT_KNOW"],
        maritalStatuses: ["NEVER_MARRIED"],
        expectedUpdatedAt: profileFor19.updatedAt.toISOString(),
      }),
    });
    const test19Json: any = await test19Res.json();
    assert(test19Res.status === 200, "Test 19: Partner preferences saved with 200");
    assert(test19Json.data.partnerPreferences.minAge === 24, "Test 19: Min age saved");
    assert(test19Json.data.partnerPreferences.maxAge === 30, "Test 19: Max age saved");
    assert(test19Json.data.partnerPreferences.religions.length === 1, "Test 19: Preferred religions synced");
    assert(test19Json.data.partnerPreferences.manglik.length === 2, "Test 19: Manglik statuses synced");
    passedTests++;

    // ====================================================
    // TEST 20: Profile Created For update
    // ====================================================
    console.log("\n[TEST 20] Profile Created For update");
    const profileFor20 = await prisma.profile.findUniqueOrThrow({ where: { id: profileId } });
    const test20Res = await fetch(`${baseUrl}/api/admin/profiles/${profileId}/profile-created-for`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        profileCreatedFor: "MY_SON",
        expectedUpdatedAt: profileFor20.updatedAt.toISOString(),
      }),
    });
    const test20Json: any = await test20Res.json();
    assert(test20Res.status === 200, "Test 20: Profile created for updated to MY_SON");
    assert(test20Json.data.profile.profileCreatedFor === "MY_SON", "Test 20: profileCreatedFor is MY_SON");
    passedTests++;

    // ====================================================
    // TEST 21: Completion recalculated using authoritative engine
    // ====================================================
    console.log("\n[TEST 21] Completion recalculated using authoritative engine");
    const profileAfterAll = await prisma.profile.findUniqueOrThrow({ where: { id: profileId } });
    // It had 10% initially. Now with personal details, religion, education, career, and partner preferences, completion percentage is significantly higher
    assert(profileAfterAll.completionPercentage > 10, "Test 21: completionPercentage increased from 10");
    assert(typeof profileAfterAll.completionPercentage === "number", "Test 21: completionPercentage is a number");
    passedTests++;

    // ====================================================
    // TEST 22: profileStatus strictly preserved
    // ====================================================
    console.log("\n[TEST 22] profileStatus strictly preserved (does not auto-transition)");
    assert(profileAfterAll.profileStatus === ProfileStatus.INCOMPLETE, "Test 22: profileStatus remains INCOMPLETE");
    passedTests++;

    // ====================================================
    // TEST 23: User status/activationStatus unchanged
    // ====================================================
    console.log("\n[TEST 23] User status and activationStatus completely unchanged");
    const userAfterAll = await prisma.user.findUniqueOrThrow({ where: { id: testUser.id } });
    assert(userAfterAll.status === UserStatus.ACTIVE, "Test 23: User status remains ACTIVE");
    assert(userAfterAll.activationStatus === AccountActivationStatus.PENDING_ACTIVATION, "Test 23: activationStatus remains PENDING_ACTIVATION");
    passedTests++;

    // ====================================================
    // TEST 24: Auth fields cannot be mutated (Mass Assignment protection)
    // ====================================================
    console.log("\n[TEST 24] Auth fields cannot be mutated (Mass assignment protection)");
    const profileFor24 = await prisma.profile.findUniqueOrThrow({ where: { id: profileId } });
    const maliciousPayload = {
      role: "ADMIN",
      email: "hacked@example.com",
      passwordHash: "hacked_password_hash",
      status: "DELETED",
      activationStatus: "ACTIVATED",
      profileStatus: "ACTIVE",
    };
    const test24Res = await fetch(`${baseUrl}/api/admin/profiles/${profileId}/profile-created-for`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        profileCreatedFor: "MYSELF",
        expectedUpdatedAt: profileFor24.updatedAt.toISOString(),
        ...maliciousPayload,
      }),
    });
    assert(test24Res.status === 200, "Test 24: Request processed safely");
    const userProtected = await prisma.user.findUniqueOrThrow({ where: { id: testUser.id } });
    const profileProtected = await prisma.profile.findUniqueOrThrow({ where: { id: profileId } });
    assert(userProtected.role === UserRole.USER, "Test 24: Role was NOT modified to ADMIN");
    assert(userProtected.email === testUser.email, "Test 24: Email was NOT modified");
    assert(userProtected.passwordHash === null, "Test 24: PasswordHash was NOT injected");
    assert(userProtected.status === UserStatus.ACTIVE, "Test 24: User status was NOT modified");
    assert(profileProtected.profileStatus === ProfileStatus.INCOMPLETE, "Test 24: profileStatus was NOT modified");
    passedTests++;

    // ====================================================
    // TEST 25: Audit metadata only changes on successful update
    // ====================================================
    console.log("\n[TEST 25] Audit metadata only changes on successful admin updates");
    const profileBeforeAudit = await prisma.profile.findUniqueOrThrow({ where: { id: profileId } });
    assert(profileBeforeAudit.lastEditedByUserId === adminUser!.id, "Test 25: lastEditedByUserId matches admin user ID");
    assert(profileBeforeAudit.lastEditedAt !== null, "Test 25: lastEditedAt is populated");
    const lastEditedTime = profileBeforeAudit.lastEditedAt!.getTime();

    // Trigger a failed request (409 Conflict)
    await fetch(`${baseUrl}/api/admin/profiles/${profileId}/profile-created-for`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        profileCreatedFor: "MY_SON",
        expectedUpdatedAt: staleDate,
      }),
    });

    const profileAfterFailed = await prisma.profile.findUniqueOrThrow({ where: { id: profileId } });
    assert(
      profileAfterFailed.lastEditedAt!.getTime() === lastEditedTime,
      "Test 25: Audit lastEditedAt did NOT change on failed/conflicted edit"
    );
    passedTests++;

    // ====================================================
    // TEST 26: Sensitive fields absent from response
    // ====================================================
    console.log("\n[TEST 26] Sensitive fields absent from API responses");
    const profileFor26 = await prisma.profile.findUniqueOrThrow({ where: { id: profileId } });
    const test26Res = await fetch(`${baseUrl}/api/admin/profiles/${profileId}/profile-created-for`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        profileCreatedFor: "OTHER",
        expectedUpdatedAt: profileFor26.updatedAt.toISOString(),
      }),
    });
    const test26Json: any = await test26Res.json();
    assert(test26Res.status === 200, "Test 26: Success response received");
    const resString = JSON.stringify(test26Json);
    assert(!resString.includes("passwordHash"), "Test 26: passwordHash is not in response");
    assert(!resString.includes("activationToken"), "Test 26: activationToken is not in response");
    assert(!resString.includes("otp"), "Test 26: otp is not in response");
    passedTests++;

    // ====================================================
    // TEST 27: Duplicate junction IDs deduplicated cleanly
    // ====================================================
    console.log("\n[TEST 27] Duplicate junction IDs deduplicated cleanly");
    const profileFor27 = await prisma.profile.findUniqueOrThrow({ where: { id: profileId } });
    const test27Res = await fetch(`${baseUrl}/api/admin/profiles/${profileId}/personal-details`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        firstName: "Aarav",
        lastName: "Verma",
        gender: "MALE",
        dateOfBirth: "1993-08-20",
        maritalStatus: "NEVER_MARRIED",
        heightCm: 182,
        motherTongueId: languages[0].id,
        languageIds: [languages[0].id, languages[0].id, languages[1].id, languages[1].id], // duplicates
        city: "Udaipur",
        state: "Rajasthan",
        expectedUpdatedAt: profileFor27.updatedAt.toISOString(),
      }),
    });
    const test27Json: any = await test27Res.json();
    assert(test27Res.status === 200, "Test 27: Handled duplicate IDs gracefully");
    assert(test27Json.data.languages.length === 2, "Test 27: Deduplicated to exactly 2 languages");
    passedTests++;

    // ====================================================
    // TEST 28: Empty optional preference arrays handled cleanly
    // ====================================================
    console.log("\n[TEST 28] Empty optional preference arrays handled cleanly");
    const profileFor28 = await prisma.profile.findUniqueOrThrow({ where: { id: profileId } });
    const test28Res = await fetch(`${baseUrl}/api/admin/profiles/${profileId}/partner-preferences`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        minAge: 21,
        maxAge: 35,
        minHeightCm: 150,
        maxHeightCm: 190,
        religionIds: [],
        communityIds: [],
        subCommunityIds: [],
        casteIds: [],
        gotraIds: [],
        educationIds: [],
        occupationIds: [],
        manglikStatuses: [],
        maritalStatuses: [],
        expectedUpdatedAt: profileFor28.updatedAt.toISOString(),
      }),
    });
    const test28Json: any = await test28Res.json();
    assert(test28Res.status === 200, "Test 28: Empty arrays saved with 200");
    assert(test28Json.data.partnerPreferences.religions.length === 0, "Test 28: Preferred religions is empty");
    assert(test28Json.data.partnerPreferences.educations.length === 0, "Test 28: Preferred educations is empty");
    passedTests++;

    console.log("\n==================================================");
    console.log(`TEST SUITE COMPLETE: ${passedTests} OF ${passedTests} TESTS PASSED`);
    console.log("==================================================");
  } finally {
    // Teardown
    server.close();
    if (cleanupUserIds.length > 0) {
      console.log(`\n[TEARDOWN] Cleaning up ${cleanupUserIds.length} test users...`);
      for (const uid of cleanupUserIds) {
        try {
          await prisma.user.delete({ where: { id: uid } });
        } catch {
          // ignore cleanup errors
        }
      }
    }
  }
}

if (require.main === module) {
  runStep7TestSuite()
    .then(() => {
      console.log("\nAll Step 7 profile editing tests passed successfully!");
      process.exit(0);
    })
    .catch((err) => {
      console.error("\nTest suite failed:", err);
      process.exit(1);
    });
}
