import http from "http";
import jwt from "jsonwebtoken";
import { app } from "../src/app";
import { config } from "../src/config/env";
import { prisma } from "../src/config/database";
import { Gender, MaritalStatus, ManglikStatus, EmploymentType, AnnualIncomeRange, ProfileCreatedFor } from "@prisma/client";

let server: http.Server;
const PORT = 5577;
const BASE_URL = `http://localhost:${PORT}`;

function createTestToken(userId: string, phone: string): string {
  return jwt.sign(
    {
      userId,
      phone,
      status: "ACTIVE",
    },
    config.jwtSecret,
    { expiresIn: "1h" }
  );
}

async function runTests() {
  console.log("===============================================================");
  console.log("MANGLAM MATRIMONY — EDIT PROFILE DATA PERSISTENCE & ISOLATION");
  console.log("===============================================================");

  server = app.listen(PORT);
  console.log(`[TEST SERVER] Running on port ${PORT}`);

  try {
    // 1. Fetch seed references
    const hinduism = await prisma.religion.findFirst({ where: { name: "Hindu" } });
    const brahmin = await prisma.community.findFirst({ where: { name: "Brahmin" } });
    const btech = await prisma.education.findFirst({ where: { name: "B.Tech." } });
    const fullTime = await prisma.employmentStatus.findFirst({ where: { name: "Employed" } });
    const hindi = await prisma.language.findFirst({ where: { name: "Hindi" } });
    const english = await prisma.language.findFirst({ where: { name: "English" } });
    const marathi = await prisma.language.findFirst({ where: { name: "Marathi" } });

    // Clean up any pre-existing test users
    await prisma.user.deleteMany({
      where: { phone: { in: ["+919999888801", "+919999888802"] } },
    });

    // 2. Create User 1
    const user1 = await prisma.user.create({
      data: {
        phone: "+919999888801",
        status: "ACTIVE",
        phoneVerifiedAt: new Date(),
      },
    });
    const token1 = createTestToken(user1.id, user1.phone!);

    // Create User 2 (for cross-user isolation test)
    const user2 = await prisma.user.create({
      data: {
        phone: "+919999888802",
        status: "ACTIVE",
        phoneVerifiedAt: new Date(),
      },
    });
    const token2 = createTestToken(user2.id, user2.phone!);

    console.log(`[INIT] Created User 1 ID: ${user1.id}, User 2 ID: ${user2.id}`);

    // STEP 1: User 1 Initial Profile
    const initRes = await fetch(`${BASE_URL}/api/profile`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token1}` },
      body: JSON.stringify({ profileCreatedFor: ProfileCreatedFor.MYSELF }),
    });
    const initData = await initRes.json();
    console.log(`[STEP 1] User 1 Initialized Profile. Status: ${initRes.status}`);
    if (initRes.status !== 201) throw new Error("Failed to initialize User 1 profile");

    // STEP 2: User 1 Save Initial Personal Details
    const initialPd = {
      firstName: "Rohan",
      lastName: "Kapoor",
      gender: Gender.MALE,
      dateOfBirth: "1994-06-15T00:00:00.000Z",
      maritalStatus: MaritalStatus.NEVER_MARRIED,
      heightCm: 178,
      motherTongueId: hindi!.id,
      languageIds: [hindi!.id, english!.id],
    };
    const pdRes1 = await fetch(`${BASE_URL}/api/profile/personal-details`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token1}` },
      body: JSON.stringify(initialPd),
    });
    console.log(`[STEP 2] User 1 Initial Personal Details. Status: ${pdRes1.status}`);

    // STEP 3: User 1 Edit Personal Details
    console.log("\n[TEST 4] Edit Existing Personal Information & Verify Update");
    const editedPd = {
      firstName: "Rohan-Edited",
      lastName: "Kapoor-Updated",
      gender: Gender.MALE,
      dateOfBirth: "1994-06-15T00:00:00.000Z",
      maritalStatus: MaritalStatus.NEVER_MARRIED,
      heightCm: 180,
      motherTongueId: hindi!.id,
      languageIds: [hindi!.id, english!.id, marathi!.id],
    };
    const pdRes2 = await fetch(`${BASE_URL}/api/profile/personal-details`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token1}` },
      body: JSON.stringify(editedPd),
    });
    const pdData2 = (await pdRes2.json()) as any;
    console.log(`  ✓ Status: ${pdRes2.status} | Success: ${pdData2.success}`);

    // PostgreSQL Direct Assertion
    const user1DbPd = await prisma.profilePersonalDetails.findFirst({
      where: { profile: { userId: user1.id } },
      include: { profile: { include: { languages: true } } },
    });
    if (user1DbPd?.firstName !== "Rohan-Edited" || user1DbPd?.heightCm !== 180) {
      throw new Error(`DB Assertion Failed: Expected Rohan-Edited / 180cm, got ${user1DbPd?.firstName} / ${user1DbPd?.heightCm}`);
    }
    if (user1DbPd.profile.languages.length !== 3) {
      throw new Error(`DB Assertion Failed: Expected 3 languages, got ${user1DbPd.profile.languages.length}`);
    }
    console.log(`  ✓ PostgreSQL Verified: firstName='${user1DbPd.firstName}', heightCm=${user1DbPd.heightCm}, languages=3`);

    // STEP 4: User 1 Edit Religion & Community
    console.log("\n[TEST 5] Edit Religion / Community & Verify Update");
    const religionPayload = {
      religionId: hinduism!.id,
      communityId: brahmin!.id,
      manglik: ManglikStatus.NO,
    };
    const relRes = await fetch(`${BASE_URL}/api/profile/religion`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token1}` },
      body: JSON.stringify(religionPayload),
    });
    console.log(`  ✓ Status: ${relRes.status}`);

    const user1DbRel = await prisma.profileReligion.findFirst({
      where: { profile: { userId: user1.id } },
    });
    if (user1DbRel?.manglik !== ManglikStatus.NO) {
      throw new Error(`DB Assertion Failed for Religion: Expected NO, got ${user1DbRel?.manglik}`);
    }
    console.log(`  ✓ PostgreSQL Verified: religionId=${user1DbRel.religionId}, manglik=${user1DbRel.manglik}`);

    // STEP 5: User 1 Edit Education & Career
    console.log("\n[TEST 6] Edit Education & Career & Verify Update");
    const softwareEngineer = await prisma.occupation.findFirst({ where: { name: "Software Professional" } }) || await prisma.occupation.findFirst();
    const eduCareerPayload = {
      education: {
        educationId: btech!.id,
        institutionName: "BITS Pilani",
      },
      career: {
        employmentStatusId: fullTime!.id,
        occupationId: softwareEngineer?.id,
        companyName: "Microsoft India",
        employmentType: EmploymentType.FULL_TIME,
        annualIncomeRange: AnnualIncomeRange.TWENTY_TO_THIRTY_LAKH,
      },
    };
    const eduRes = await fetch(`${BASE_URL}/api/profile/education-career`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token1}` },
      body: JSON.stringify(eduCareerPayload),
    });
    console.log(`  ✓ Status: ${eduRes.status}`);

    const user1DbEdu = await prisma.profileEducation.findFirst({
      where: { profile: { userId: user1.id } },
    });
    const user1DbCareer = await prisma.profileCareer.findFirst({
      where: { profile: { userId: user1.id } },
    });
    if (user1DbEdu?.institutionName !== "BITS Pilani" || user1DbCareer?.companyName !== "Microsoft India") {
      throw new Error(`DB Assertion Failed for Education/Career`);
    }
    console.log(`  ✓ PostgreSQL Verified: institution='${user1DbEdu.institutionName}', company='${user1DbCareer.companyName}'`);

    // STEP 6: User 1 Edit Partner Preferences
    console.log("\n[TEST 7] Edit Partner Preferences & Verify Update");
    const partnerPrefPayload = {
      minAge: 24,
      maxAge: 29,
      minHeightCm: 160,
      maxHeightCm: 175,
      religionIds: [hinduism!.id],
      communityIds: [brahmin!.id],
      maritalStatuses: [MaritalStatus.NEVER_MARRIED],
      manglikStatuses: [ManglikStatus.NO],
    };
    const prefRes = await fetch(`${BASE_URL}/api/profile/partner-preferences`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token1}` },
      body: JSON.stringify(partnerPrefPayload),
    });
    console.log(`  ✓ Status: ${prefRes.status}`);

    const user1DbPref = await prisma.partnerPreference.findFirst({
      where: { profile: { userId: user1.id } },
      include: { religions: true, communities: true },
    });
    if (user1DbPref?.minAge !== 24 || user1DbPref?.maxAge !== 29) {
      throw new Error(`DB Assertion Failed for Partner Preferences`);
    }
    console.log(`  ✓ PostgreSQL Verified: minAge=${user1DbPref.minAge}, maxAge=${user1DbPref.maxAge}, religionsCount=${user1DbPref.religions.length}`);

    // STEP 7: Security & Isolation Verification (User 2 attempts to overwrite or edit)
    console.log("\n[TEST 9] User Identity & Token Isolation Check (req.user.userId derivation)");
    // User 2 initializes own profile
    await fetch(`${BASE_URL}/api/profile`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token2}` },
      body: JSON.stringify({ profileCreatedFor: ProfileCreatedFor.MY_SON }),
    });

    // User 2 saves details
    await fetch(`${BASE_URL}/api/profile/personal-details`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token2}` },
      body: JSON.stringify({
        firstName: "Aditya",
        lastName: "Sharma",
        gender: Gender.MALE,
        dateOfBirth: "1996-01-01T00:00:00.000Z",
        maritalStatus: MaritalStatus.NEVER_MARRIED,
        heightCm: 172,
        motherTongueId: hindi!.id,
        languageIds: [hindi!.id],
      }),
    });

    // Verify User 1's profile remains 100% intact
    const verifyUser1 = await prisma.profilePersonalDetails.findFirst({
      where: { profile: { userId: user1.id } },
    });
    if (verifyUser1?.firstName !== "Rohan-Edited") {
      throw new Error(`Security Violation: User 1 profile was modified by User 2 action!`);
    }
    console.log(`  ✓ Cross-User Profile Isolation Verified: User 1 remains '${verifyUser1.firstName}', User 2 is independent.`);

    // STEP 8: Fetch Full Profile (Browser Refresh Simulation)
    console.log("\n[TEST 8 & 11] GET /api/profile Data Refresh Persistence");
    const getRes = await fetch(`${BASE_URL}/api/profile`, {
      headers: { Authorization: `Bearer ${token1}` },
    });
    const getData = (await getRes.json()) as any;
    if (
      getData.data.personalDetails.firstName !== "Rohan-Edited" ||
      getData.data.education.institutionName !== "BITS Pilani" ||
      getData.data.career.companyName !== "Microsoft India" ||
      getData.data.partnerPreferences.minAge !== 24
    ) {
      throw new Error("Full profile fetch did not return edited values");
    }
    console.log(`  ✓ Status: ${getRes.status} | All edited fields returned cleanly from PostgreSQL.`);

    // Cleanup test users
    await prisma.user.deleteMany({
      where: { phone: { in: ["+919999888801", "+919999888802"] } },
    });
    console.log("\n[CLEANUP] Deleted test users from database.");

    console.log("\n===============================================================");
    console.log("✅ ALL EDIT PROFILE PERSISTENCE & SECURITY SCENARIOS PASSED!");
    console.log("===============================================================");
  } finally {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    await prisma.$disconnect();
  }
  process.exit(0);
}

runTests().catch((err) => {
  console.error("Test failed:", err);
  if (server) server.close();
  process.exit(1);
});
