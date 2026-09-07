import {
  PrismaClient,
  ProfileStatus,
  UserStatus,
  Gender,
  MaritalStatus,
  ProfileCreatedFor,
  AnnualIncomeRange,
  ManglikStatus,
} from "@prisma/client";
import { profileService } from "../src/services/profile.service";
import { matchesService } from "../src/services/matches.service";
import { profileRepository } from "../src/repositories/profile.repository";

const prisma = new PrismaClient();

async function runProfileDataIntegrityTests() {
  console.log("==================================================================");
  console.log("MANGLAM MATRIMONY — PROFILE DATA INTEGRITY & AUDIT TEST SUITE");
  console.log("==================================================================");

  let passed = 0;
  let failed = 0;

  function assert(condition: any, testName: string, detail?: any) {
    if (Boolean(condition)) {
      console.log(`  ✓ PASS: ${testName}`);
      passed++;
    } else {
      console.error(`  ✗ FAIL: ${testName}`, detail !== undefined ? detail : "");
      failed++;
    }
  }

  try {
    // Clean up any test users
    const testPhones = [
      "+919888000001",
      "+919888000002",
      "+919888000003",
      "+919888000004",
      "+919888000005",
      "+919888000006",
      "+919888000099",
    ];

    await prisma.user.deleteMany({
      where: { phone: { in: testPhones } },
    });

    // Reference master data
    const hindi = await prisma.language.findFirst({ where: { code: "hi" } });
    const hindu = await prisma.religion.findFirst({ where: { slug: "hindu" } });
    const brahmin = await prisma.community.findFirst({ where: { slug: "brahmin" } });
    const eduMba = await prisma.education.findFirst();
    const empStatus = await prisma.employmentStatus.findFirst();

    if (!hindi || !hindu || !brahmin || !eduMba || !empStatus) {
      throw new Error("Master data missing in database. Run prisma/seed.ts first.");
    }

    // Observer viewer user
    const viewerUser = await prisma.user.create({
      data: { phone: "+919888000099", status: UserStatus.ACTIVE, phoneVerifiedAt: new Date() },
    });
    const viewerProfile = await prisma.profile.create({
      data: {
        userId: viewerUser.id,
        profileCreatedFor: ProfileCreatedFor.MYSELF,
        profileStatus: ProfileStatus.ACTIVE,
        completionPercentage: 100,
        submittedAt: new Date(),
      },
    });

    console.log("\n--- TEST A: Profile Creation & Real Data Integrity (User A: Delhi, Delhi) ---");
    // 1. Create User A
    const userA = await prisma.user.create({
      data: { phone: "+919888000001", status: UserStatus.ACTIVE, phoneVerifiedAt: new Date() },
    });

    const initA = await profileService.initializeProfile(userA.id, {
      profileCreatedFor: ProfileCreatedFor.MYSELF,
    });
    assert(initA.success, "Test A1: Initialize profile for User A");
    const profileIdA = initA.data!.profile.id;

    // Save Personal Details with city: "Delhi", state: "Delhi"
    const personalA = await profileService.savePersonalDetails(userA.id, {
      firstName: "Amit",
      lastName: "Sharma",
      gender: Gender.MALE,
      dateOfBirth: "1995-06-15",
      maritalStatus: MaritalStatus.NEVER_MARRIED,
      heightCm: 178,
      motherTongueId: hindi.id,
      city: "Delhi",
      state: "Delhi",
      languageIds: [hindi.id],
    });
    assert(personalA.success, "Test A2: Save personal details with city and state via service");

    // Verify DB persistence of city and state
    const dbPersonalA = await prisma.profilePersonalDetails.findUnique({
      where: { profileId: profileIdA },
    });
    assert(dbPersonalA?.city === "Delhi", "Test A3: PostgreSQL has city = 'Delhi'");
    assert(dbPersonalA?.state === "Delhi", "Test A4: PostgreSQL has state = 'Delhi'");

    // Complete remaining sections in PostgreSQL
    await prisma.profileReligion.create({
      data: {
        profileId: profileIdA,
        religionId: hindu.id,
        communityId: brahmin.id,
        manglik: ManglikStatus.NO,
      },
    });

    await prisma.profileEducation.create({
      data: {
        profileId: profileIdA,
        educationId: eduMba.id,
        institutionName: "Delhi University",
      },
    });

    await prisma.profileCareer.create({
      data: {
        profileId: profileIdA,
        employmentStatusId: empStatus.id,
        companyName: "Tech Solutions",
        annualIncomeRange: AnnualIncomeRange.PREFER_NOT_TO_SAY,
      },
    });

    await prisma.partnerPreference.create({
      data: {
        profileId: profileIdA,
        minAge: 23,
        maxAge: 30,
        minHeightCm: 155,
        maxHeightCm: 175,
      },
    });

    // Add a photo for User A
    const photoA = await prisma.profilePhoto.create({
      data: {
        profileId: profileIdA,
        storageKey: "photos/test-a.jpg",
        originalFileName: "amit_portrait.jpg",
        mimeType: "image/jpeg",
        fileSize: 150000,
        photoType: "PRIMARY",
        moderationStatus: "APPROVED",
        sortOrder: 0,
      },
    });

    // Set completion percentage to 100 before submitting
    await prisma.profile.update({
      where: { id: profileIdA },
      data: { completionPercentage: 100 },
    });

    // Submit profile directly to ACTIVE
    const submitA = await profileService.submitProfile(userA.id);
    assert(submitA.success, "Test A5: Submit profile A activates successfully");
    assert(submitA.data?.profile.profileStatus === ProfileStatus.ACTIVE, "Test A6: Profile status is ACTIVE");

    // Fetch matches from observer viewer perspective
    const matchesResA = await matchesService.getDiscoveryMatches(viewerUser.id);

    const cardA = matchesResA.profiles.find((p) => p.id === profileIdA);
    assert(!!cardA, "Test A7: Card A found in matches discovery");
    assert(cardA?.name === "Amit Sharma", "Test A8: Card A displays real name 'Amit Sharma'");
    assert(cardA?.gender === "Male", "Test A9: Card A displays gender 'Male'");
    assert(cardA?.maritalStatus === "Never Married", "Test A10: Card A displays maritalStatus 'Never Married'");
    assert(cardA?.location === "Delhi, Delhi", `Test A11: Card A location is 'Delhi, Delhi' (got: '${cardA?.location}')`);
    assert(cardA?.location !== "Jaipur, Rajasthan", "Test A12: Card A location is NOT hardcoded 'Jaipur, Rajasthan'");
    assert(
      cardA?.incomeRange === "Prefer not to say",
      `Test A13: Card A incomeRange is 'Prefer not to say' (got: '${cardA?.incomeRange}')`
    );
    assert(cardA?.incomeRange !== "₹10–15 Lakh", "Test A14: Card A incomeRange is NOT falsified '₹10–15 Lakh'");
    assert(
      cardA?.photos.includes(`/api/profile/photos/${photoA.id}/file`),
      "Test A15: Card A displays candidate's own photo"
    );

    console.log("\n--- TEST B: Location Integrity with User B (Mumbai, Maharashtra) ---");
    const userB = await prisma.user.create({
      data: { phone: "+919888000002", status: UserStatus.ACTIVE, phoneVerifiedAt: new Date() },
    });

    const initB = await profileService.initializeProfile(userB.id, {
      profileCreatedFor: ProfileCreatedFor.MYSELF,
    });
    const profileIdB = initB.data!.profile.id;

    await profileService.savePersonalDetails(userB.id, {
      firstName: "Sunita",
      lastName: "Patil",
      gender: Gender.FEMALE,
      dateOfBirth: "1997-03-22",
      maritalStatus: MaritalStatus.NEVER_MARRIED,
      heightCm: 162,
      motherTongueId: hindi.id,
      city: "Mumbai",
      state: "Maharashtra",
      languageIds: [hindi.id],
    });

    await prisma.profileReligion.create({
      data: {
        profileId: profileIdB,
        religionId: hindu.id,
        communityId: brahmin.id,
        manglik: ManglikStatus.NO,
      },
    });

    await prisma.profileEducation.create({
      data: {
        profileId: profileIdB,
        educationId: eduMba.id,
        institutionName: "Mumbai University",
      },
    });

    await prisma.profileCareer.create({
      data: {
        profileId: profileIdB,
        employmentStatusId: empStatus.id,
        annualIncomeRange: AnnualIncomeRange.FIFTEEN_TO_TWENTY_LAKH,
      },
    });

    await prisma.partnerPreference.create({
      data: {
        profileId: profileIdB,
        minAge: 25,
        maxAge: 32,
        minHeightCm: 160,
        maxHeightCm: 185,
      },
    });

    await prisma.profilePhoto.create({
      data: {
        profileId: profileIdB,
        storageKey: "photos/test-b.jpg",
        originalFileName: "sunita.jpg",
        mimeType: "image/jpeg",
        fileSize: 120000,
        photoType: "PRIMARY",
        moderationStatus: "APPROVED",
        sortOrder: 0,
      },
    });

    await prisma.profile.update({
      where: { id: profileIdB },
      data: { completionPercentage: 100 },
    });
    await profileService.submitProfile(userB.id);
    await prisma.profile.update({
      where: { id: profileIdB },
      data: { profileStatus: ProfileStatus.ACTIVE },
    });

    const matchesResB = await matchesService.getDiscoveryMatches(viewerUser.id);

    const cardB = matchesResB.profiles.find((p) => p.id === profileIdB);
    assert(!!cardB, "Test B1: Card B found in matches discovery");
    assert(cardB?.name === "Sunita Patil", "Test B2: Card B name is 'Sunita Patil'");
    assert(
      cardB?.location === "Mumbai, Maharashtra",
      `Test B3: Card B location is 'Mumbai, Maharashtra' (got: '${cardB?.location}')`
    );
    assert(cardB?.location !== "Jaipur, Rajasthan", "Test B4: Card B location is strictly NOT 'Jaipur, Rajasthan'");
    assert(cardB?.gender === "Female", "Test B5: Card B gender is 'Female'");
    assert(cardB?.incomeRange === "₹15–20 Lakh", "Test B6: Card B incomeRange is '₹15–20 Lakh'");

    console.log("\n--- TEST C: Gender Enum Mapping (OTHER -> 'Other', never 'Female') ---");
    const userC = await prisma.user.create({
      data: { phone: "+919888000003", status: UserStatus.ACTIVE, phoneVerifiedAt: new Date() },
    });

    const initC = await profileService.initializeProfile(userC.id, {
      profileCreatedFor: ProfileCreatedFor.MYSELF,
    });
    const profileIdC = initC.data!.profile.id;

    await profileService.savePersonalDetails(userC.id, {
      firstName: "Alex",
      lastName: "Verma",
      gender: Gender.OTHER,
      dateOfBirth: "1996-08-14",
      maritalStatus: MaritalStatus.NEVER_MARRIED,
      heightCm: 170,
      motherTongueId: hindi.id,
      city: "Pune",
      state: "Maharashtra",
    });

    await prisma.profileReligion.create({
      data: { profileId: profileIdC, religionId: hindu.id, manglik: ManglikStatus.NO },
    });
    await prisma.profileEducation.create({
      data: { profileId: profileIdC, educationId: eduMba.id },
    });
    await prisma.profileCareer.create({
      data: { profileId: profileIdC, employmentStatusId: empStatus.id, annualIncomeRange: AnnualIncomeRange.TEN_TO_FIFTEEN_LAKH },
    });
    await prisma.partnerPreference.create({
      data: { profileId: profileIdC, minAge: 22, maxAge: 35 },
    });
    await prisma.profilePhoto.create({
      data: {
        profileId: profileIdC,
        storageKey: "photos/test-c.jpg",
        originalFileName: "alex.jpg",
        mimeType: "image/jpeg",
        fileSize: 110000,
        photoType: "PRIMARY",
        moderationStatus: "APPROVED",
        sortOrder: 0,
      },
    });
    await prisma.profile.update({
      where: { id: profileIdC },
      data: { completionPercentage: 100 },
    });
    await profileService.submitProfile(userC.id);
    await prisma.profile.update({
      where: { id: profileIdC },
      data: { profileStatus: ProfileStatus.ACTIVE },
    });

    const matchesResC = await matchesService.getDiscoveryMatches(viewerUser.id);

    const cardC = matchesResC.profiles.find((p) => p.id === profileIdC);
    assert(cardC?.gender === "Other", `Test C1: Gender OTHER maps strictly to 'Other' (got: '${cardC?.gender}')`);
    assert(cardC?.gender !== "Female", "Test C2: Gender OTHER is NOT mapped to 'Female'");

    console.log("\n--- TEST D: Income PREFER_NOT_TO_SAY Verification ---");
    assert(
      cardA?.incomeRange === "Prefer not to say",
      "Test D1: User A incomeRange is 'Prefer not to say'"
    );

    // Also check seed candidate Meera Iyer who has PREFER_NOT_TO_SAY
    const meeraCard = matchesResA.profiles.find((p) => p.name === "Meera Iyer");
    if (meeraCard) {
      assert(
        meeraCard.incomeRange === "Prefer not to say",
        `Test D2: Seed candidate Meera Iyer incomeRange is 'Prefer not to say' (got: '${meeraCard.incomeRange}')`
      );
      assert(meeraCard.incomeRange !== "₹10–15 Lakh", "Test D3: Meera Iyer incomeRange is NOT '₹10–15 Lakh'");
    }

    console.log("\n--- TEST E: Marital Status ANNULLED Casing Fix ---");
    const userE = await prisma.user.create({
      data: { phone: "+919888000005", status: UserStatus.ACTIVE, phoneVerifiedAt: new Date() },
    });

    const initE = await profileService.initializeProfile(userE.id, {
      profileCreatedFor: ProfileCreatedFor.MYSELF,
    });
    const profileIdE = initE.data!.profile.id;

    await profileService.savePersonalDetails(userE.id, {
      firstName: "Vikram",
      lastName: "Singh",
      gender: Gender.MALE,
      dateOfBirth: "1992-10-05",
      maritalStatus: MaritalStatus.ANNULLED,
      heightCm: 175,
      motherTongueId: hindi.id,
      city: "Jaipur",
      state: "Rajasthan",
    });

    await prisma.profileReligion.create({
      data: { profileId: profileIdE, religionId: hindu.id, manglik: ManglikStatus.NO },
    });
    await prisma.profileEducation.create({
      data: { profileId: profileIdE, educationId: eduMba.id },
    });
    await prisma.profileCareer.create({
      data: { profileId: profileIdE, employmentStatusId: empStatus.id },
    });
    await prisma.partnerPreference.create({
      data: { profileId: profileIdE, minAge: 25, maxAge: 35 },
    });
    await prisma.profilePhoto.create({
      data: {
        profileId: profileIdE,
        storageKey: "photos/test-e.jpg",
        originalFileName: "vikram.jpg",
        mimeType: "image/jpeg",
        fileSize: 100000,
        photoType: "PRIMARY",
        moderationStatus: "APPROVED",
        sortOrder: 0,
      },
    });
    await prisma.profile.update({
      where: { id: profileIdE },
      data: { completionPercentage: 100 },
    });
    await profileService.submitProfile(userE.id);
    await prisma.profile.update({
      where: { id: profileIdE },
      data: { profileStatus: ProfileStatus.ACTIVE },
    });

    const matchesResE = await matchesService.getDiscoveryMatches(viewerUser.id);

    const cardE = matchesResE.profiles.find((p) => p.id === profileIdE);
    assert(cardE?.maritalStatus === "Annulled", `Test E1: Marital status is 'Annulled' (got: '${cardE?.maritalStatus}')`);
    assert(cardE?.maritalStatus !== "AnnulLED", "Test E2: Marital status does NOT contain 'AnnulLED' typo");

    console.log("\n--- TEST F: Fake Photo Fallback Elimination ---");
    // Create candidate with NO photos
    const userF = await prisma.user.create({
      data: { phone: "+919888000004", status: UserStatus.ACTIVE, phoneVerifiedAt: new Date() },
    });
    const profileF = await prisma.profile.create({
      data: {
        userId: userF.id,
        profileCreatedFor: ProfileCreatedFor.MYSELF,
        profileStatus: ProfileStatus.ACTIVE,
        completionPercentage: 100,
        submittedAt: new Date(),
        personalDetails: {
          create: {
            firstName: "PhotoLess",
            lastName: "Candidate",
            gender: Gender.FEMALE,
            dateOfBirth: new Date("1998-01-01"),
            maritalStatus: MaritalStatus.NEVER_MARRIED,
            heightCm: 160,
            motherTongueId: hindi.id,
            city: "Bhopal",
            state: "Madhya Pradesh",
          },
        },
      },
    });

    const matchesResF = await matchesService.getDiscoveryMatches(viewerUser.id);

    const cardF = matchesResF.profiles.find((p) => p.id === profileF.id);
    assert(!!cardF, "Test F1: PhotoLess candidate found in matches");
    assert(cardF?.photos.length === 0, `Test F2: Photo-less candidate photos array is empty (got length ${cardF?.photos.length})`);
    assert(
      !cardF?.photos.some((url) => url.includes("priya_1.jpg")),
      "Test F3: Photo-less candidate does NOT have Priya Sharma's image"
    );

    console.log("\n--- TEST G: Dynamic Greeting Resolution ---");
    const profileDtoA = await profileService.getProfile(userA.id);
    assert(
      profileDtoA.data?.personalDetails?.firstName === "Amit",
      "Test G1: User A profile returns real first name 'Amit' for greeting"
    );

    const profileDtoB = await profileService.getProfile(userB.id);
    assert(
      profileDtoB.data?.personalDetails?.firstName === "Sunita",
      "Test G2: User B profile returns real first name 'Sunita' for greeting"
    );

    console.log("\n--- TEST H: Profile Editing Persistence (City, State, Income) ---");
    // Update User A's city, state, and income
    await profileService.savePersonalDetails(userA.id, {
      firstName: "Amit",
      lastName: "Sharma",
      gender: Gender.MALE,
      dateOfBirth: "1995-06-15",
      maritalStatus: MaritalStatus.NEVER_MARRIED,
      heightCm: 178,
      motherTongueId: hindi.id,
      city: "Udaipur",
      state: "Rajasthan",
    });

    await prisma.profileCareer.update({
      where: { profileId: profileIdA },
      data: {
        annualIncomeRange: AnnualIncomeRange.TWENTY_TO_THIRTY_LAKH,
      },
    });

    await prisma.profile.update({
      where: { id: profileIdA },
      data: { completionPercentage: 100 },
    });

    // Check PostgreSQL
    const updatedPersonalA = await prisma.profilePersonalDetails.findUnique({
      where: { profileId: profileIdA },
    });
    assert(updatedPersonalA?.city === "Udaipur", "Test H1: Updated city 'Udaipur' persisted to DB");
    assert(updatedPersonalA?.state === "Rajasthan", "Test H2: Updated state 'Rajasthan' persisted to DB");

    // Check discovery reflection
    const matchesResH = await matchesService.getDiscoveryMatches(viewerUser.id);
    const updatedCardA = matchesResH.profiles.find((p) => p.id === profileIdA);
    assert(
      updatedCardA?.location === "Udaipur, Rajasthan",
      `Test H3: Updated location 'Udaipur, Rajasthan' immediately reflected in discovery (got: '${updatedCardA?.location}')`
    );
    assert(
      updatedCardA?.incomeRange === "₹20–30 Lakh",
      `Test H4: Updated income '₹20–30 Lakh' immediately reflected in discovery (got: '${updatedCardA?.incomeRange}')`
    );

    console.log("\n--- TEST I: ProfileCreatedFor Update Persistence ---");
    // Initialize profile with MY_SON
    const userI = await prisma.user.create({
      data: { phone: "+919888000006", status: UserStatus.ACTIVE, phoneVerifiedAt: new Date() },
    });
    const initI1 = await profileRepository.createOrGetProfile(userI.id, ProfileCreatedFor.MY_SON);
    assert(initI1.profile.profileCreatedFor === ProfileCreatedFor.MY_SON, "Test I1: Profile initialized with MY_SON");

    // User navigates back and selects MYSELF
    const initI2 = await profileRepository.createOrGetProfile(userI.id, ProfileCreatedFor.MYSELF);
    assert(
      initI2.profile.profileCreatedFor === ProfileCreatedFor.MYSELF,
      `Test I2: ProfileCreatedFor updated to MYSELF in DB (got: ${initI2.profile.profileCreatedFor})`
    );

    // Verify in database directly
    const dbProfileI = await prisma.profile.findUnique({ where: { userId: userI.id } });
    assert(
      dbProfileI?.profileCreatedFor === ProfileCreatedFor.MYSELF,
      "Test I3: DB profile reflects updated profileCreatedFor = MYSELF"
    );

    console.log("\n==================================================================");
    console.log(`TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
    console.log("==================================================================");

    if (failed > 0) {
      process.exit(1);
    }
  } finally {
    await prisma.$disconnect();
  }
}

runProfileDataIntegrityTests().catch((err) => {
  console.error("Test execution failed with error:", err);
  process.exit(1);
});
