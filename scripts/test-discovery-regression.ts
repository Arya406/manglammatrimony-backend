import { prisma } from "../src/config/database";
import { matchesService } from "../src/services/matches.service";
import { ProfileStatus, UserStatus, Gender } from "@prisma/client";

async function runRegressionTest() {
  console.log("==================================================");
  console.log("RUNNING DISCOVERY REGRESSION TEST SUITE");
  console.log("==================================================");

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, message: string) {
    if (condition) {
      console.log(`  ✓ PASS: ${message}`);
      passed++;
    } else {
      console.error(`  ✗ FAIL: ${message}`);
      failed++;
    }
  }

  // 1. Find an active MALE test user
  const maleUser = await prisma.user.findFirst({
    where: {
      status: UserStatus.ACTIVE,
      profile: {
        profileStatus: ProfileStatus.ACTIVE,
        completionPercentage: 100,
        personalDetails: { gender: Gender.MALE },
      },
    },
    include: { profile: { include: { personalDetails: true } } },
  });

  assert(!!maleUser, "Active 100% complete MALE user exists in test database");

  // 2. Find an active FEMALE test user
  const femaleUser = await prisma.user.findFirst({
    where: {
      status: UserStatus.ACTIVE,
      profile: {
        profileStatus: ProfileStatus.ACTIVE,
        completionPercentage: 100,
        personalDetails: { gender: Gender.FEMALE },
      },
    },
    include: { profile: { include: { personalDetails: true } } },
  });

  assert(!!femaleUser, "Active 100% complete FEMALE user exists in test database");

  if (maleUser && femaleUser) {
    // 3. MALE user discovers FEMALE candidates
    const maleDiscovery = await matchesService.getDiscoveryMatches(maleUser.id);
    assert(maleDiscovery.profiles.length > 0, `MALE user discovers candidates (found: ${maleDiscovery.profiles.length})`);
    const allFemale = maleDiscovery.profiles.every((p) => p.gender === "Female");
    assert(allFemale, "All candidates discovered by MALE user are Female");
    const maleExcluded = maleDiscovery.profiles.every((p) => p.id !== maleUser.profile?.id);
    assert(maleExcluded, "MALE user's own profile is strictly excluded from results");

    // 4. FEMALE user discovers MALE candidates
    const femaleDiscovery = await matchesService.getDiscoveryMatches(femaleUser.id);
    assert(femaleDiscovery.profiles.length > 0, `FEMALE user discovers candidates (found: ${femaleDiscovery.profiles.length})`);
    const allMale = femaleDiscovery.profiles.every((p) => p.gender === "Male");
    assert(allMale, "All candidates discovered by FEMALE user are Male");
    const femaleExcluded = femaleDiscovery.profiles.every((p) => p.id !== femaleUser.profile?.id);
    assert(femaleExcluded, "FEMALE user's own profile is strictly excluded from results");

    // 5. Verify all discovered profiles are ACTIVE, 100% complete, and have ACTIVE users
    const discoveredIds = maleDiscovery.profiles.map((p) => p.id);
    const dbProfiles = await prisma.profile.findMany({
      where: { id: { in: discoveredIds } },
      include: { user: true },
    });

    const allActiveStatus = dbProfiles.every((p) => p.profileStatus === ProfileStatus.ACTIVE);
    assert(allActiveStatus, "All discovered profiles in DB have profileStatus = ACTIVE");

    const all100Completion = dbProfiles.every((p) => p.completionPercentage === 100);
    assert(all100Completion, "All discovered profiles in DB have completionPercentage = 100");

    const allActiveUsers = dbProfiles.every((p) => p.user.status === UserStatus.ACTIVE);
    assert(allActiveUsers, "All discovered profiles belong to users with status = ACTIVE");

    // 6. Test with a mock OTHER gender user ID (or temporary user)
    const otherUser = await prisma.user.findFirst({
      where: {
        profile: { personalDetails: { gender: Gender.OTHER } },
      },
      include: { profile: { include: { personalDetails: true } } },
    });

    if (otherUser) {
      const otherDiscovery = await matchesService.getDiscoveryMatches(otherUser.id);
      assert(otherDiscovery !== undefined, "OTHER gender user query succeeds without crashing");
      console.log(`  (OTHER gender user retrieved ${otherDiscovery.profiles.length} profiles without opposite gender restriction)`);
    }
  }

  console.log("==================================================");
  console.log(`RESULTS: ${passed} passed, ${failed} failed`);
  console.log("==================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runRegressionTest()
  .catch((err) => {
    console.error("Test failed with error:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
