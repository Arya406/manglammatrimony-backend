/**
 * ==============================================================================
 * MANGLAM MATRIMONY — PERSISTENT FAVOURITES & LIKES TEST SUITE
 * 
 * Verifies production-grade Favourites / Likes:
 * - Outgoing vs Incoming semantics
 * - Database persistence & composite unique constraints
 * - Self-favouriting prevention & ineligible profile protection
 * - Idempotent create / delete operations
 * - Concurrent safety
 * - Account isolation (A -> B != B -> A)
 * - Discovery Matches isFavourited batch integration (zero N+1)
 * - Dynamic incoming count calculations
 * ==============================================================================
 */

import { PrismaClient, UserStatus, ProfileStatus } from "@prisma/client";
import { favouriteService } from "../src/services/favourite.service";
import { matchesService } from "../src/services/matches.service";

const prisma = new PrismaClient();

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

async function runTests() {
  console.log("==================================================");
  console.log("MANGLAM MATRIMONY — FAVOURITES & LIKES TEST SUITE");
  console.log("==================================================");

  // Setup unique test phone numbers
  const testPhoneA = `+917777${Math.floor(100000 + Math.random() * 900000)}`;
  const testPhoneB = `+917778${Math.floor(100000 + Math.random() * 900000)}`;
  const testPhoneC = `+917779${Math.floor(100000 + Math.random() * 900000)}`;
  const testPhoneD = `+917780${Math.floor(100000 + Math.random() * 900000)}`;

  let userA: any = null;
  let userB: any = null;
  let userC: any = null;
  let userD: any = null;

  try {
    const religion = await prisma.religion.findFirst();
    const hindi = await prisma.language.findFirst();

    // 1. Create User A (Aarav - Active)
    userA = await prisma.user.create({
      data: {
        phone: testPhoneA,
        status: UserStatus.ACTIVE,
        profile: {
          create: {
            profileCreatedFor: "MYSELF",
            profileStatus: ProfileStatus.ACTIVE,
            completionPercentage: 100,
            personalDetails: {
              create: {
                firstName: "Aarav",
                lastName: "FavTest",
                gender: "MALE",
                maritalStatus: "NEVER_MARRIED",
                dateOfBirth: new Date("1994-05-15"),
                city: "Delhi",
                state: "Delhi",
                heightCm: 178,
                motherTongueId: hindi!.id,
              },
            },
          },
        },
      },
      include: { profile: true },
    });

    // 2. Create User B (Diya - Active)
    userB = await prisma.user.create({
      data: {
        phone: testPhoneB,
        status: UserStatus.ACTIVE,
        profile: {
          create: {
            profileCreatedFor: "MYSELF",
            profileStatus: ProfileStatus.ACTIVE,
            completionPercentage: 100,
            personalDetails: {
              create: {
                firstName: "Diya",
                lastName: "FavTest",
                gender: "FEMALE",
                maritalStatus: "NEVER_MARRIED",
                dateOfBirth: new Date("1996-08-20"),
                city: "Mumbai",
                state: "Maharashtra",
                heightCm: 165,
                motherTongueId: hindi!.id,
              },
            },
          },
        },
      },
      include: { profile: true },
    });

    // 3. Create User C (Rohan - Active)
    userC = await prisma.user.create({
      data: {
        phone: testPhoneC,
        status: UserStatus.ACTIVE,
        profile: {
          create: {
            profileCreatedFor: "MYSELF",
            profileStatus: ProfileStatus.ACTIVE,
            completionPercentage: 100,
            personalDetails: {
              create: {
                firstName: "Tara",
                lastName: "FavTest",
                gender: "FEMALE",
                maritalStatus: "NEVER_MARRIED",
                dateOfBirth: new Date("1995-11-10"),
                city: "Bengaluru",
                state: "Karnataka",
                heightCm: 168,
                motherTongueId: hindi!.id,
              },
            },
          },
        },
      },
      include: { profile: true },
    });

    // 4. Create User D (Inactive User / Profile)
    userD = await prisma.user.create({
      data: {
        phone: testPhoneD,
        status: UserStatus.SUSPENDED,
        profile: {
          create: {
            profileCreatedFor: "MYSELF",
            profileStatus: ProfileStatus.SUSPENDED,
            completionPercentage: 50,
            personalDetails: {
              create: {
                firstName: "Inactive",
                lastName: "User",
                gender: "FEMALE",
                maritalStatus: "NEVER_MARRIED",
                dateOfBirth: new Date("1995-01-01"),
                city: "Pune",
                state: "Maharashtra",
                heightCm: 160,
                motherTongueId: hindi!.id,
              },
            },
          },
        },
      },
      include: { profile: true },
    });

    console.log("\n--- TEST GROUP 1: BASIC FAVOURITE & VALIDATION ---");

    // Test 1: Authenticated user can favourite another profile
    const addRes1 = await favouriteService.addFavourite(userA.id, userB.profile.id);
    assert(
      addRes1.success === true && addRes1.data?.isFavourited === true,
      "Test 1: User A successfully favourites User B's profile",
      addRes1
    );

    // Test 2: Database contains exactly 1 row for (A, B)
    const dbFav1 = await prisma.profileFavourite.findUnique({
      where: {
        userId_targetProfileId: {
          userId: userA.id,
          targetProfileId: userB.profile.id,
        },
      },
    });
    assert(dbFav1 !== null, "Test 2: PostgreSQL row exists for (User A, Profile B)");

    // Test 3: Duplicate favourite (idempotent; no duplicate rows)
    const addResDup = await favouriteService.addFavourite(userA.id, userB.profile.id);
    assert(
      addResDup.success === true && addResDup.data?.isFavourited === true,
      "Test 3: Repeated favourite request succeeds idempotently",
      addResDup
    );

    const countFav = await prisma.profileFavourite.count({
      where: { userId: userA.id, targetProfileId: userB.profile.id },
    });
    assert(countFav === 1, "Test 4: Exactly 1 row in PostgreSQL after duplicate add request");

    // Test 5: Self-favourite is rejected
    const selfRes = await favouriteService.addFavourite(userA.id, userA.profile.id);
    assert(
      selfRes.success === false && selfRes.code === "CANNOT_FAVOURITE_SELF",
      "Test 5: Self-favourite is rejected with CANNOT_FAVOURITE_SELF",
      selfRes
    );

    // Test 6: Invalid UUID target is rejected
    const invalidRes = await favouriteService.addFavourite(userA.id, "not-a-valid-uuid");
    assert(
      invalidRes.success === false && invalidRes.code === "INVALID_PROFILE_ID",
      "Test 6: Invalid UUID profileId is rejected with INVALID_PROFILE_ID",
      invalidRes
    );

    // Test 7: Inactive / Suspended profile cannot be favourited
    const inactiveRes = await favouriteService.addFavourite(userA.id, userD.profile.id);
    assert(
      inactiveRes.success === false && inactiveRes.code === "TARGET_PROFILE_NOT_FOUND",
      "Test 7: Inactive/suspended target profile is rejected with TARGET_PROFILE_NOT_FOUND",
      inactiveRes
    );

    console.log("\n--- TEST GROUP 2: STATUS & REMOVAL ---");

    // Test 8: Check status reports true
    const statusRes1 = await favouriteService.getFavouriteStatus(userA.id, userB.profile.id);
    assert(
      statusRes1.success === true && statusRes1.data?.isFavourited === true,
      "Test 8: getFavouriteStatus returns isFavourited: true for (A, B)",
      statusRes1
    );

    // Test 9: Check status for un-favourited profile reports false
    const statusResUnfav = await favouriteService.getFavouriteStatus(userA.id, userC.profile.id);
    assert(
      statusResUnfav.success === true && statusResUnfav.data?.isFavourited === false,
      "Test 9: getFavouriteStatus returns isFavourited: false for (A, C)",
      statusResUnfav
    );

    // Test 10: Remove favourite
    const removeRes1 = await favouriteService.removeFavourite(userA.id, userB.profile.id);
    assert(
      removeRes1.success === true && removeRes1.data?.isFavourited === false,
      "Test 10: removeFavourite returns success and isFavourited: false",
      removeRes1
    );

    const dbFavDeleted = await prisma.profileFavourite.findUnique({
      where: {
        userId_targetProfileId: {
          userId: userA.id,
          targetProfileId: userB.profile.id,
        },
      },
    });
    assert(dbFavDeleted === null, "Test 11: PostgreSQL row successfully removed after removeFavourite");

    // Test 12: Repeated remove (idempotent)
    const removeResIdemp = await favouriteService.removeFavourite(userA.id, userB.profile.id);
    assert(
      removeResIdemp.success === true && removeResIdemp.data?.isFavourited === false,
      "Test 12: Repeated removeFavourite is safely idempotent",
      removeResIdemp
    );

    console.log("\n--- TEST GROUP 3: PERSISTENCE & SEMANTICS ---");

    // Re-add favourite A -> B for persistence tests
    await favouriteService.addFavourite(userA.id, userB.profile.id);

    // Test 13: Favourite survives query reload
    const reloadedFav = await prisma.profileFavourite.findFirst({
      where: { userId: userA.id, targetProfileId: userB.profile.id },
    });
    assert(reloadedFav !== null, "Test 13: Favourite relationship persists in PostgreSQL");

    // Test 14: Direction isolation: A favourited B does NOT mean B favourited A
    const bStatusOnA = await favouriteService.getFavouriteStatus(userB.id, userA.profile.id);
    assert(
      bStatusOnA.data?.isFavourited === false,
      "Test 14: Outgoing favourite is directional: B does NOT automatically favourite A",
      bStatusOnA
    );

    // Test 15: Incoming likes count for B equals 1
    const bLikesCount = await favouriteService.getReceivedLikesCount(userB.id);
    assert(
      bLikesCount.data?.count === 1,
      "Test 15: B's received likes count equals 1",
      bLikesCount
    );

    // Test 16: Incoming likes count for A equals 0
    const aLikesCount = await favouriteService.getReceivedLikesCount(userA.id);
    assert(
      aLikesCount.data?.count === 0,
      "Test 16: A's received likes count equals 0 (outgoing likes != incoming likes)",
      aLikesCount
    );

    // Test 17: User C also favourites User B
    await favouriteService.addFavourite(userC.id, userB.profile.id);
    const bLikesCount2 = await favouriteService.getReceivedLikesCount(userB.id);
    assert(
      bLikesCount2.data?.count === 2,
      "Test 17: B's received likes count updates to 2 after C favourites B",
      bLikesCount2
    );

    // Test 18: User B's getReceivedLikes lists both A and C
    const bReceivedList = await favouriteService.getReceivedLikes(userB.id);
    const receivedIds = (bReceivedList.data?.profiles || []).map((p) => p.id);
    assert(
      receivedIds.includes(userA.profile.id) && receivedIds.includes(userC.profile.id),
      "Test 18: B's received likes list includes profiles of both A and C",
      receivedIds
    );

    // Test 19: User A's getSentFavourites contains User B
    const aSentList = await favouriteService.getSentFavourites(userA.id);
    const sentIds = (aSentList.data?.profiles || []).map((p) => p.id);
    assert(
      sentIds.includes(userB.profile.id),
      "Test 19: A's sent favourites list contains B's profile",
      sentIds
    );

    console.log("\n--- TEST GROUP 4: MATCHES DISCOVERY BATCH INTEGRATION ---");

    // Test 20: Matches endpoint for User A returns isFavourited: true for B, and false for C
    const aMatches = await matchesService.getDiscoveryMatches(userA.id, { pageSize: 50 });
    const bInMatches = aMatches.profiles.find((p) => p.id === userB.profile.id);
    const cInMatches = aMatches.profiles.find((p) => p.id === userC.profile.id);

    assert(
      bInMatches?.isFavourited === true,
      "Test 20: Matches response for User A correctly flags Profile B with isFavourited: true",
      bInMatches
    );
    assert(
      cInMatches?.isFavourited === false,
      "Test 21: Matches response for User A correctly flags Profile C with isFavourited: false",
      cInMatches
    );

    // Test 22: Matches endpoint for User B: neither A nor C is favourited by B
    const bMatches = await matchesService.getDiscoveryMatches(userB.id, { pageSize: 50 });
    const aInBMatches = bMatches.profiles.find((p) => p.id === userA.profile.id);
    assert(
      aInBMatches?.isFavourited === false,
      "Test 22: Matches response for User B correctly shows Profile A as isFavourited: false",
      aInBMatches
    );

    console.log("\n--- TEST GROUP 5: CONCURRENCY & DECREMENT ---");

    // Test 23: Concurrent duplicate creation safely handled by unique constraint
    const concurrentPromises = [
      favouriteService.addFavourite(userA.id, userC.profile.id),
      favouriteService.addFavourite(userA.id, userC.profile.id),
      favouriteService.addFavourite(userA.id, userC.profile.id),
      favouriteService.addFavourite(userA.id, userC.profile.id),
    ];
    const concurrentResults = await Promise.all(concurrentPromises);
    const allConcurrentSuccess = concurrentResults.every((r) => r.success === true);
    assert(
      allConcurrentSuccess,
      "Test 23: Concurrent duplicate favourites all resolve successfully without throwing unhandled exceptions",
      concurrentResults
    );

    const concurrentDbCount = await prisma.profileFavourite.count({
      where: { userId: userA.id, targetProfileId: userC.profile.id },
    });
    assert(
      concurrentDbCount === 1,
      "Test 24: Exactly 1 row in PostgreSQL after concurrent creation requests",
      concurrentDbCount
    );

    // Test 25: Decrement incoming count when favouriter removes favourite
    await favouriteService.removeFavourite(userC.id, userB.profile.id);
    const bLikesCountDecremented = await favouriteService.getReceivedLikesCount(userB.id);
    assert(
      bLikesCountDecremented.data?.count === 1,
      "Test 25: B's incoming likes count accurately decrements from 2 to 1 when C removes favourite",
      bLikesCountDecremented
    );

    await favouriteService.removeFavourite(userA.id, userB.profile.id);
    const bLikesCountZero = await favouriteService.getReceivedLikesCount(userB.id);
    assert(
      bLikesCountZero.data?.count === 0,
      "Test 26: B's incoming likes count accurately returns to 0 when A removes favourite",
      bLikesCountZero
    );

  } finally {
    // Clean up test data
    console.log("\nCleaning up test entities...");
    const userIds = [userA?.id, userB?.id, userC?.id, userD?.id].filter(Boolean);
    if (userIds.length > 0) {
      await prisma.profileFavourite.deleteMany({
        where: {
          OR: [
            { userId: { in: userIds } },
            { targetProfile: { userId: { in: userIds } } },
          ],
        },
      });
      await prisma.user.deleteMany({
        where: { id: { in: userIds } },
      });
    }
    await prisma.$disconnect();
  }

  console.log("\n==================================================");
  console.log(`FAVOURITES & LIKES TEST SUMMARY: ${passed} PASSED | ${failed} FAILED`);
  console.log("==================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error("Test execution fatal error:", err);
  process.exit(1);
});
