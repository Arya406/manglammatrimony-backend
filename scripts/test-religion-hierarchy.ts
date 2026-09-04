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

const prisma = new PrismaClient();

async function runReligionHierarchyTests() {
  console.log("==================================================================");
  console.log("MANGLAM MATRIMONY — RELIGION HIERARCHY & AMENDMENTS TEST SUITE");
  console.log("==================================================================");

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

  try {
    const testPhones = [
      "+919876540001",
      "+919876540002",
      "+919876540003",
      "+919876540004",
      "+919876540005",
      "+919876540006",
      "+919876540007",
      "+919876540008",
      "+919876540009",
    ];

    await prisma.user.deleteMany({
      where: { phone: { in: testPhones } },
    });

    // Master data
    const hindu = await prisma.religion.findFirst({ where: { slug: "hindu" } });
    const muslim = await prisma.religion.findFirst({ where: { slug: "muslim" } });
    const christian = await prisma.religion.findFirst({ where: { slug: "christian" } });
    const otherRel = await prisma.religion.findFirst({ where: { slug: "other" } });
    const preferNotToSayRel = await prisma.religion.findFirst({ where: { slug: "prefer-not-to-say" } });

    const brahmin = await prisma.community.findFirst({ where: { slug: "brahmin" } });
    const otherCom = await prisma.community.findFirst({ where: { slug: "other" } });
    const preferNotToSayCom = await prisma.community.findFirst({ where: { slug: "prefer-not-to-say" } });

    if (!hindu || !otherRel || !preferNotToSayRel || !brahmin || !otherCom || !preferNotToSayCom) {
      throw new Error("Master taxonomy missing required records. Ensure prisma/seed.ts is executed.");
    }

    // Helper to create test user & profile
    async function createTestUser(phone: string, firstName: string) {
      const user = await prisma.user.create({
        data: {
          phone,
          status: UserStatus.ACTIVE,
          phoneVerifiedAt: new Date(),
        },
      });
      await profileService.initializeProfile(user.id, {
        profileCreatedFor: ProfileCreatedFor.MYSELF,
      });
      const hindi = await prisma.language.findFirst();
      await profileService.savePersonalDetails(user.id, {
        firstName,
        lastName: "Test",
        gender: Gender.FEMALE,
        dateOfBirth: "1998-05-15",
        maritalStatus: MaritalStatus.NEVER_MARRIED,
        heightCm: 165,
        motherTongueId: hindi!.id,
        city: "Jaipur",
        state: "Rajasthan",
        languageIds: [hindi!.id],
      });
      return { user };
    }

    console.log("\n--- TEST GROUP 1: RELIGION REQUIRED & PREFER NOT TO SAY ---");
    {
      const { user } = await createTestUser("+919876540001", "Aarti");

      // 1.1 Blank religion should fail
      const blankRes = await profileService.saveReligion(user.id, {
        religionId: "",
      } as any);
      assert(!blankRes.success, "Blank religionId is rejected");

      // 1.2 Invalid religion UUID should fail
      const invalidRes = await profileService.saveReligion(user.id, {
        religionId: "00000000-0000-0000-0000-000000000000",
      });
      assert(!invalidRes.success, "Invalid religionId is rejected");

      // 1.3 Religion = Prefer not to say
      const pntsRes = await profileService.saveReligion(user.id, {
        religionId: preferNotToSayRel.id,
      });
      assert(pntsRes.success, "Religion = Prefer not to say is accepted as valid completed choice");

      // Verify GET returns effective value and never exposes 'Other'
      const getRes = await profileService.getProfile(user.id);
      const relData = getRes.data?.religion;
      assert(relData?.effectiveReligion === "Prefer not to say", "Effective religion displays 'Prefer not to say'");
      assert(relData?.customReligion === null, "customReligion is null for predefined prefer-not-to-say");
    }

    console.log("\n--- TEST GROUP 2: RELIGION = OTHER + CUSTOM VALUE ---");
    {
      const { user } = await createTestUser("+919876540002", "Bhavna");

      // 2.1 Religion = Other without customReligion should fail
      const failOther = await profileService.saveReligion(user.id, {
        religionId: otherRel.id,
        customReligion: "",
      });
      assert(!failOther.success && failOther.code === "INVALID_CUSTOM_RELIGION", "Religion = Other with empty customReligion is rejected");

      // 2.2 Religion = Other + custom value
      const saveOther = await profileService.saveReligion(user.id, {
        religionId: otherRel.id,
        customReligion: "  Bahá'í  ",
      });
      assert(saveOther.success, "Religion = Other + custom value ('Bahá'í') is saved");

      // 2.3 Effective display value must be custom value, NEVER 'Other'
      const getRes = await profileService.getProfile(user.id);
      const relData = getRes.data?.religion;
      assert(relData?.customReligion === "Bahá'í", "customReligion is trimmed to 'Bahá'í'");
      assert(relData?.effectiveReligion === "Bahá'í", "effectiveReligion is 'Bahá'í' (never 'Other')");

      // 2.4 Matches card display
      const formatted = await prisma.profile.findUnique({
        where: { id: (getRes.data as any)?.id || getRes.data?.profile?.id },
        include: {
          personalDetails: true,
          religion: { include: { religion: true, community: true } },
          education: { include: { education: true } },
          career: { include: { occupation: true } },
          photos: true,
        },
      });
      const { formatDiscoveryProfile } = await import("../src/services/matches.service");
      const card = formatDiscoveryProfile(formatted);
      assert(card.religion === "Bahá'í", "Match card displays custom religion 'Bahá'í', never 'Other'");
    }

    console.log("\n--- TEST GROUP 3: COMMUNITY = PREFER NOT TO SAY & NOT APPLICABLE ---");
    {
      const { user } = await createTestUser("+919876540003", "Chitra");

      // 3.1 Community = Prefer not to say
      const comPnts = await profileService.saveReligion(user.id, {
        religionId: hindu.id,
        communityId: preferNotToSayCom.id,
      });
      assert(comPnts.success, "Community = Prefer not to say is accepted");
      let getRes = await profileService.getProfile(user.id);
      assert(getRes.data?.religion?.effectiveCommunity === "Prefer not to say", "Effective community displays 'Prefer not to say'");

      // 3.2 Community = Not Applicable
      const comNa = await profileService.saveReligion(user.id, {
        religionId: hindu.id,
        communityId: null,
        customCommunity: "Not Applicable",
      });
      assert(comNa.success, "Community = Not Applicable is accepted with communityId: null");
      getRes = await profileService.getProfile(user.id);
      assert(getRes.data?.religion?.communityId === null, "DB communityId is null for Not Applicable");
      assert(getRes.data?.religion?.customCommunity === "Not Applicable", "DB customCommunity is 'Not Applicable'");
      assert(getRes.data?.religion?.effectiveCommunity === "Not Applicable", "Effective community displays 'Not Applicable'");
    }

    console.log("\n--- TEST GROUP 4: CASTE & SUB-CASTE = PREFER NOT TO SAY & NOT APPLICABLE ---");
    {
      const { user } = await createTestUser("+919876540004", "Deepa");

      // 4.1 Caste = Prefer not to say, Sub-caste = Prefer not to say
      const pntsRes = await profileService.saveReligion(user.id, {
        religionId: hindu.id,
        communityId: brahmin.id,
        customCaste: "Prefer not to say",
        customSubCaste: "Prefer not to say",
      });
      assert(pntsRes.success, "Caste & Sub-caste = Prefer not to say is saved");
      let getRes = await profileService.getProfile(user.id);
      assert(getRes.data?.religion?.effectiveCaste === "Prefer not to say", "Effective caste displays 'Prefer not to say'");
      assert(getRes.data?.religion?.effectiveSubCaste === "Prefer not to say", "Effective sub-caste displays 'Prefer not to say'");

      // 4.2 Caste = Not Applicable, Sub-caste = Not Applicable
      const naRes = await profileService.saveReligion(user.id, {
        religionId: hindu.id,
        communityId: brahmin.id,
        customCaste: "Not Applicable",
        customSubCaste: "Not Applicable",
      });
      assert(naRes.success, "Caste & Sub-caste = Not Applicable is saved");
      getRes = await profileService.getProfile(user.id);
      assert(getRes.data?.religion?.effectiveCaste === "Not Applicable", "Effective caste displays 'Not Applicable'");
      assert(getRes.data?.religion?.effectiveSubCaste === "Not Applicable", "Effective sub-caste displays 'Not Applicable'");
    }

    console.log("\n--- TEST GROUP 5: FULL CUSTOM HIERARCHY (OTHER AT ALL LEVELS) ---");
    {
      const { user } = await createTestUser("+919876540005", "Ekta");

      const fullCustom = await profileService.saveReligion(user.id, {
        religionId: otherRel.id,
        customReligion: "Spiritual",
        communityId: otherCom.id,
        customCommunity: "Global Community",
        customCaste: "Universal",
        customSubCaste: "Seeker",
      });
      assert(fullCustom.success, "Full custom hierarchy (Religion, Community, Caste, Sub-caste) is saved");

      const getRes = await profileService.getProfile(user.id);
      const r = getRes.data?.religion;
      assert(r?.effectiveReligion === "Spiritual", "effectiveReligion is 'Spiritual'");
      assert(r?.effectiveCommunity === "Global Community", "effectiveCommunity is 'Global Community'");
      assert(r?.effectiveCaste === "Universal", "effectiveCaste is 'Universal'");
      assert(r?.effectiveSubCaste === "Seeker", "effectiveSubCaste is 'Seeker'");
      assert(r?.customReligion === "Spiritual", "customReligion persisted");
      assert(r?.customCommunity === "Global Community", "customCommunity persisted");
      assert(r?.customCaste === "Universal", "customCaste persisted");
      assert(r?.customSubCaste === "Seeker", "customSubCaste persisted");

      // Check Match card does NOT expose caste or sub-caste (Amendment 6)
      const { formatDiscoveryProfile } = await import("../src/services/matches.service");
      const formatted = await prisma.profile.findUnique({
        where: { id: (getRes.data as any)?.id || getRes.data?.profile?.id },
        include: {
          personalDetails: true,
          religion: { include: { religion: true, community: true } },
          education: { include: { education: true } },
          career: { include: { occupation: true } },
          photos: true,
        },
      });
      const card = formatDiscoveryProfile(formatted);
      assert(card.religion === "Spiritual", "Card shows effective religion 'Spiritual'");
      assert(card.community === "Global Community", "Card shows effective community 'Global Community'");
      assert(!("caste" in card), "Card does NOT expose caste");
      assert(!("subCaste" in card), "Card does NOT expose sub-caste");
    }

    console.log("\n--- TEST GROUP 6: ATOMIC DEPENDENCY CLEARING & NO STALE VALUES ---");
    {
      const { user } = await createTestUser("+919876540006", "Geeta");

      // 6.1 Set full initial hierarchy
      await profileService.saveReligion(user.id, {
        religionId: hindu.id,
        communityId: brahmin.id,
        customCaste: "Gour",
        customSubCaste: "Chitpavan",
      });
      let getRes = await profileService.getProfile(user.id);
      assert(getRes.data?.religion?.communityId === brahmin.id, "Initial community is Brahmin");
      assert(getRes.data?.religion?.effectiveCaste === "Gour", "Initial caste is Gour");
      assert(getRes.data?.religion?.effectiveSubCaste === "Chitpavan", "Initial sub-caste is Chitpavan");

      // 6.2 Changing Religion to Christian: atomically clears Community, Caste, Sub-caste
      const switchRel = await profileService.saveReligion(user.id, {
        religionId: christian!.id,
        communityId: null,
        customCommunity: null,
        casteId: null,
        customCaste: null,
        subCasteId: null,
        customSubCaste: null,
      });
      assert(switchRel.success, "Switched religion to Christian with cleared child values");

      getRes = await profileService.getProfile(user.id);
      const r = getRes.data?.religion;
      assert(r?.religionId === christian!.id, "Religion updated to Christian");
      assert(r?.communityId === null, "Community ID is null (not stale Brahmin)");
      assert(r?.customCommunity === null, "Custom community is null");
      assert(r?.casteId === null, "Caste ID is null");
      assert(r?.customCaste === null, "Custom caste is null (not stale Gour)");
      assert(r?.subCasteId === null, "Sub-caste ID is null");
      assert(r?.customSubCaste === null, "Custom sub-caste is null (not stale Chitpavan)");
      assert(r?.effectiveCommunity === null, "effectiveCommunity is null");
      assert(r?.effectiveCaste === null, "effectiveCaste is null");
      assert(r?.effectiveSubCaste === null, "effectiveSubCaste is null");

      // 6.3 Changing Community clears Caste and Sub-caste
      // First set community and caste
      await profileService.saveReligion(user.id, {
        religionId: hindu.id,
        communityId: otherCom.id,
        customCommunity: "Sindhi",
        customCaste: "Bhaiband",
        customSubCaste: "Larkana",
      });
      getRes = await profileService.getProfile(user.id);
      assert(getRes.data?.religion?.effectiveCommunity === "Sindhi", "Community set to Sindhi");
      assert(getRes.data?.religion?.effectiveCaste === "Bhaiband", "Caste set to Bhaiband");

      // Now change Community to Not Applicable, clearing Caste and Sub-caste
      await profileService.saveReligion(user.id, {
        religionId: hindu.id,
        communityId: null,
        customCommunity: "Not Applicable",
        casteId: null,
        customCaste: null,
        subCasteId: null,
        customSubCaste: null,
      });
      getRes = await profileService.getProfile(user.id);
      assert(getRes.data?.religion?.effectiveCommunity === "Not Applicable", "Community updated to Not Applicable");
      assert(getRes.data?.religion?.customCaste === null, "Caste cleared (not stale Bhaiband)");
      assert(getRes.data?.religion?.customSubCaste === null, "Sub-caste cleared (not stale Larkana)");
    }

    console.log("\n--- TEST GROUP 7: PRESERVE EXISTING STRUCTURED PROFILES ---");
    {
      const { user } = await createTestUser("+919876540007", "Hemlata");

      // Existing structured profile with standard Hindu + Brahmin (no custom fields)
      const saveRes = await profileService.saveReligion(user.id, {
        religionId: hindu.id,
        communityId: brahmin.id,
        manglik: ManglikStatus.NO,
      });
      assert(saveRes.success, "Standard structured profile saved successfully");

      const getRes = await profileService.getProfile(user.id);
      const r = getRes.data?.religion;
      assert(r?.religion?.slug === "hindu", "Religion relation intact");
      assert(r?.community?.slug === "brahmin", "Community relation intact");
      assert(r?.effectiveReligion === "Hindu", "effectiveReligion is 'Hindu'");
      assert(r?.effectiveCommunity === "Brahmin", "effectiveCommunity is 'Brahmin'");
      assert(r?.customReligion === null, "customReligion is null");
      assert(r?.customCommunity === null, "customCommunity is null");
      assert(r?.customCaste === null, "customCaste is null");
      assert(r?.customSubCaste === null, "customSubCaste is null");
      assert(r?.manglik === "NO", "Manglik status preserved");
    }

    console.log("\n--- TEST GROUP 8: VALIDATION EDGES & INPUT SANITIZATION ---");
    {
      const { user } = await createTestUser("+919876540008", "Indira");

      // 8.1 Custom strings trimmed
      const trimRes = await profileService.saveReligion(user.id, {
        religionId: otherRel.id,
        customReligion: "   Parsi Irani   ",
        communityId: otherCom.id,
        customCommunity: "   Zoroastrian   ",
        customCaste: "   Kadmi   ",
        customSubCaste: "   Mobad   ",
      });
      assert(trimRes.success, "Whitespace around custom values trimmed");
      const getRes = await profileService.getProfile(user.id);
      const r = getRes.data?.religion;
      assert(r?.customReligion === "Parsi Irani", "customReligion whitespace trimmed");
      assert(r?.customCommunity === "Zoroastrian", "customCommunity whitespace trimmed");
      assert(r?.customCaste === "Kadmi", "customCaste whitespace trimmed");
      assert(r?.customSubCaste === "Mobad", "customSubCaste whitespace trimmed");
    }

    // Cleanup test users
    await prisma.user.deleteMany({
      where: { phone: { in: testPhones } },
    });

    console.log("\n==================================================================");
    console.log(`TOTAL RESULTS: ${passed} PASSED, ${failed} FAILED`);
    console.log("==================================================================");

    if (failed > 0) {
      process.exit(1);
    }
  } catch (error) {
    console.error("Test execution failed:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

runReligionHierarchyTests();
