import { prisma } from "../src/config/database";
import jwt from "jsonwebtoken";
import { config } from "../src/config/env";

const API_BASE_URL = "http://localhost:5000";

async function runIsolationTest() {
  console.log("==================================================");
  console.log("RUNNING TWO-USER PROFILE ISOLATION TEST (TASK 5)");
  console.log("==================================================");

  // 1. Pick two distinct active users in the database with 100% completed profiles
  // User A (MALE) and User B (FEMALE), excluding any sample profiles
  const maleProfile = await prisma.profile.findFirst({
    where: {
      profileStatus: "ACTIVE",
      completionPercentage: 100,
      id: { not: { startsWith: "profile-sample-" } },
      personalDetails: { gender: "MALE" },
    },
    include: {
      user: true,
      personalDetails: { include: { motherTongue: true } },
      religion: { include: { religion: true, community: true, caste: true } },
      education: { include: { education: true } },
      career: { include: { occupation: true } },
      photos: { where: { moderationStatus: "APPROVED" } },
      partnerPreference: true,
    },
  });

  const femaleProfile = await prisma.profile.findFirst({
    where: {
      profileStatus: "ACTIVE",
      completionPercentage: 100,
      id: { not: { startsWith: "profile-sample-" } },
      personalDetails: { gender: "FEMALE" },
    },
    include: {
      user: true,
      personalDetails: { include: { motherTongue: true } },
      religion: { include: { religion: true, community: true, caste: true } },
      education: { include: { education: true } },
      career: { include: { occupation: true } },
      photos: { where: { moderationStatus: "APPROVED" } },
      partnerPreference: true,
    },
  });

  if (!maleProfile || !femaleProfile) {
    throw new Error("Could not find both male and female active profiles in the database.");
  }

  const userA = maleProfile;
  const userB = femaleProfile;

  console.log("Candidate User A (MALE):", {
    profileId: userA.id,
    userId: userA.userId,
    name: `${userA.personalDetails?.firstName} ${userA.personalDetails?.lastName}`,
    city: userA.personalDetails?.city,
    religion: userA.religion?.religion?.name,
    education: userA.education?.education?.name,
    occupation: userA.career?.occupation?.name,
    photosCount: userA.photos.length,
  });

  console.log("Candidate User B (FEMALE):", {
    profileId: userB.id,
    userId: userB.userId,
    name: `${userB.personalDetails?.firstName} ${userB.personalDetails?.lastName}`,
    city: userB.personalDetails?.city,
    religion: userB.religion?.religion?.name,
    education: userB.education?.education?.name,
    occupation: userB.career?.occupation?.name,
    photosCount: userB.photos.length,
  });

  // Generate JWTs
  const tokenA = jwt.sign(
    { userId: userA.userId, phone: userA.user.phone, email: userA.user.email },
    config.jwtSecret,
    { expiresIn: "1h" }
  );

  const tokenB = jwt.sign(
    { userId: userB.userId, phone: userB.user.phone, email: userB.user.email },
    config.jwtSecret,
    { expiresIn: "1h" }
  );

  // ---------------------------------------------------------------
  // Step 1: User A calls GET /api/matches
  // ---------------------------------------------------------------
  console.log("\n[TEST 1] User A opens /matches...");
  const resMatchesA = await fetch(`${API_BASE_URL}/api/matches`, {
    headers: { Authorization: `Bearer ${tokenA}` },
  });
  const dataMatchesA = await resMatchesA.json();

  if (!dataMatchesA.success) {
    throw new Error(`User A matches failed: ${JSON.stringify(dataMatchesA)}`);
  }

  const profilesForA = dataMatchesA.data.profiles;
  console.log(`User A received ${profilesForA.length} candidate match cards.`);

  // Assert User A's own profile is NOT in matches
  const hasSelfA = profilesForA.some((p: any) => p.id === userA.id);
  if (hasSelfA) {
    throw new Error("CRITICAL ISOLATION FAILURE: User A's own profile is present in User A's match cards!");
  }
  console.log("✓ User A's own profile is NOT in matches (proper exclusion verified).");

  // Verify online status is not fabricated
  const anyFabricatedOnline = profilesForA.some((p: any) => p.isOnline === true);
  if (anyFabricatedOnline) {
    throw new Error("DATA RULE FAILURE: Found candidate card with fabricated isOnline=true!");
  }
  console.log("✓ No candidate card has fabricated isOnline badge (all isOnline=false).");

  // Find User B's card in User A's matches
  const cardB = profilesForA.find((p: any) => p.id === userB.id);
  if (!cardB) {
    console.log("Note: User B was not in page 1 of matches for User A, checking direct detail...");
  } else {
    console.log("Found User B's card in User A's matches:");
    console.log({
      id: cardB.id,
      name: cardB.name,
      gender: cardB.gender,
      location: cardB.location,
      religion: cardB.religion,
      education: cardB.education,
      occupation: cardB.occupation,
      isVerified: cardB.isVerified,
    });

    // Check that card data matches User B, NOT User A
    if (cardB.name !== `${userB.personalDetails?.firstName} ${userB.personalDetails?.lastName}`.trim()) {
      throw new Error(`ISOLATION FAILURE: Card name '${cardB.name}' does not match User B!`);
    }
    if (cardB.gender !== "Female") {
      throw new Error(`ISOLATION FAILURE: Card gender '${cardB.gender}' does not match User B's Female!`);
    }
    console.log("✓ Match card contains User B's real database details, zero User A data.");
  }

  // ---------------------------------------------------------------
  // Step 2: User A clicks "View Profile" on User B -> GET /api/profile/:profileId
  // ---------------------------------------------------------------
  console.log("\n[TEST 2] User A clicks View Profile on User B (GET /api/profile/:profileId)...");
  const resDetailB = await fetch(`${API_BASE_URL}/api/profile/${userB.id}`, {
    headers: { Authorization: `Bearer ${tokenA}` },
  });
  const dataDetailB = await resDetailB.json();

  if (!dataDetailB.success) {
    throw new Error(`Failed to fetch User B's public profile as User A: ${JSON.stringify(dataDetailB)}`);
  }

  const profileDetailB = dataDetailB.data;
  console.log("Fetched User B's public profile:", {
    id: profileDetailB.id,
    name: profileDetailB.name,
    age: profileDetailB.age,
    gender: profileDetailB.gender,
    maritalStatus: profileDetailB.maritalStatus,
    height: profileDetailB.heightFormatted,
    motherTongue: profileDetailB.motherTongue,
    religion: profileDetailB.religion,
    caste: profileDetailB.caste,
    education: profileDetailB.education,
    occupation: profileDetailB.occupation,
    incomeRange: profileDetailB.incomeRange,
    isVerified: profileDetailB.isVerified,
    photos: profileDetailB.photos.length,
  });

  // Verify all fields belong to User B
  if (profileDetailB.name !== `${userB.personalDetails?.firstName} ${userB.personalDetails?.lastName}`.trim()) {
    throw new Error(`ISOLATION FAILURE: Profile detail name '${profileDetailB.name}' does not match User B!`);
  }
  if (profileDetailB.gender !== "Female") {
    throw new Error(`ISOLATION FAILURE: Profile detail gender '${profileDetailB.gender}' does not match User B!`);
  }
  if (profileDetailB.id !== userB.id) {
    throw new Error(`ISOLATION FAILURE: Profile detail id '${profileDetailB.id}' does not match User B's id!`);
  }

  // Verify private authentication data is NEVER returned
  if (profileDetailB.email || profileDetailB.phone || profileDetailB.passwordHash || profileDetailB.user) {
    throw new Error("CRITICAL SECURITY FAILURE: Private user auth fields exposed in public profile endpoint!");
  }
  console.log("✓ Zero private credentials/secrets exposed (email, phone, hash excluded).");
  console.log("✓ All profile detail sections match User B's data accurately.");

  // ---------------------------------------------------------------
  // Step 3: User B calls GET /api/matches
  // ---------------------------------------------------------------
  console.log("\n[TEST 3] User B opens /matches...");
  const resMatchesB = await fetch(`${API_BASE_URL}/api/matches`, {
    headers: { Authorization: `Bearer ${tokenB}` },
  });
  const dataMatchesB = await resMatchesB.json();

  if (!dataMatchesB.success) {
    throw new Error(`User B matches failed: ${JSON.stringify(dataMatchesB)}`);
  }

  const profilesForB = dataMatchesB.data.profiles;
  console.log(`User B received ${profilesForB.length} candidate match cards.`);

  // Assert User B's own profile is NOT in matches
  const hasSelfB = profilesForB.some((p: any) => p.id === userB.id);
  if (hasSelfB) {
    throw new Error("CRITICAL ISOLATION FAILURE: User B's own profile is present in User B's match cards!");
  }
  console.log("✓ User B's own profile is NOT in matches (proper exclusion verified).");

  // Find User A's card in User B's matches
  const cardA = profilesForB.find((p: any) => p.id === userA.id);
  if (!cardA) {
    console.log("Note: User A was not in page 1 of matches for User B, checking direct detail...");
  } else {
    console.log("Found User A's card in User B's matches:");
    console.log({
      id: cardA.id,
      name: cardA.name,
      gender: cardA.gender,
      location: cardA.location,
      religion: cardA.religion,
      education: cardA.education,
      occupation: cardA.occupation,
      isVerified: cardA.isVerified,
    });

    if (cardA.name !== `${userA.personalDetails?.firstName} ${userA.personalDetails?.lastName}`.trim()) {
      throw new Error(`ISOLATION FAILURE: Card name '${cardA.name}' does not match User A!`);
    }
    if (cardA.gender !== "Male") {
      throw new Error(`ISOLATION FAILURE: Card gender '${cardA.gender}' does not match User A's Male!`);
    }
    console.log("✓ Match card contains User A's real database details, zero User B data.");
  }

  // ---------------------------------------------------------------
  // Step 4: User B clicks "View Profile" on User A -> GET /api/profile/:profileId
  // ---------------------------------------------------------------
  console.log("\n[TEST 4] User B clicks View Profile on User A (GET /api/profile/:profileId)...");
  const resDetailA = await fetch(`${API_BASE_URL}/api/profile/${userA.id}`, {
    headers: { Authorization: `Bearer ${tokenB}` },
  });
  const dataDetailA = await resDetailA.json();

  if (!dataDetailA.success) {
    throw new Error(`Failed to fetch User A's public profile as User B: ${JSON.stringify(dataDetailA)}`);
  }

  const profileDetailA = dataDetailA.data;
  console.log("Fetched User A's public profile:", {
    id: profileDetailA.id,
    name: profileDetailA.name,
    age: profileDetailA.age,
    gender: profileDetailA.gender,
    maritalStatus: profileDetailA.maritalStatus,
    height: profileDetailA.heightFormatted,
    motherTongue: profileDetailA.motherTongue,
    religion: profileDetailA.religion,
    caste: profileDetailA.caste,
    education: profileDetailA.education,
    occupation: profileDetailA.occupation,
    incomeRange: profileDetailA.incomeRange,
    isVerified: profileDetailA.isVerified,
    photos: profileDetailA.photos.length,
  });

  if (profileDetailA.name !== `${userA.personalDetails?.firstName} ${userA.personalDetails?.lastName}`.trim()) {
    throw new Error(`ISOLATION FAILURE: Profile detail name '${profileDetailA.name}' does not match User A!`);
  }
  if (profileDetailA.gender !== "Male") {
    throw new Error(`ISOLATION FAILURE: Profile detail gender '${profileDetailA.gender}' does not match User A!`);
  }
  if (profileDetailA.id !== userA.id) {
    throw new Error(`ISOLATION FAILURE: Profile detail id '${profileDetailA.id}' does not match User A's id!`);
  }
  console.log("✓ All profile detail sections match User A's data accurately, zero User B data.");

  // ---------------------------------------------------------------
  // Step 5: Security & Validation Tests for GET /api/profile/:profileId
  // ---------------------------------------------------------------
  console.log("\n[TEST 5] Security & Error Handling tests...");

  // 5a. Unauthenticated request -> 401
  const resUnauth = await fetch(`${API_BASE_URL}/api/profile/${userB.id}`);
  if (resUnauth.status !== 401) {
    throw new Error(`Expected 401 for unauthenticated profile request, got ${resUnauth.status}`);
  }
  console.log("✓ Unauthenticated request properly rejected with 401.");

  // 5b. Invalid UUID format -> 400
  const resBadUuid = await fetch(`${API_BASE_URL}/api/profile/invalid-not-uuid`, {
    headers: { Authorization: `Bearer ${tokenA}` },
  });
  if (resBadUuid.status !== 400) {
    throw new Error(`Expected 400 for invalid UUID, got ${resBadUuid.status}`);
  }
  console.log("✓ Invalid UUID format properly rejected with 400.");

  // 5c. Non-existent profile UUID -> 404
  const nonExistentUuid = "00000000-0000-4000-a000-000000000000";
  const resNotFound = await fetch(`${API_BASE_URL}/api/profile/${nonExistentUuid}`, {
    headers: { Authorization: `Bearer ${tokenA}` },
  });
  if (resNotFound.status !== 404) {
    throw new Error(`Expected 404 for non-existent profile, got ${resNotFound.status}`);
  }
  console.log("✓ Non-existent profile UUID properly rejected with 404.");

  // ---------------------------------------------------------------
  // Step 6: Favourite & Relationship Actions verification
  // ---------------------------------------------------------------
  console.log("\n[TEST 6] Favourite and Relationship Actions verification...");

  // 6a. Check relationship status between User A and User B
  const resRelStatus = await fetch(`${API_BASE_URL}/api/message-requests/status/${userB.id}`, {
    headers: { Authorization: `Bearer ${tokenA}` },
  });
  const dataRelStatus = await resRelStatus.json();
  if (!dataRelStatus.success) {
    throw new Error(`Failed to get relationship status: ${JSON.stringify(dataRelStatus)}`);
  }
  console.log(`✓ Relationship status checked successfully: ${dataRelStatus.data.relationshipState}`);

  // 6b. Add User B to favourites as User A
  const resAddFav = await fetch(`${API_BASE_URL}/api/profile/favourites/${userB.id}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${tokenA}` },
  });
  const dataAddFav = await resAddFav.json();
  if (!dataAddFav.success) {
    throw new Error(`Failed to add favourite: ${JSON.stringify(dataAddFav)}`);
  }
  console.log("✓ Added User B to favourites successfully.");

  // 6c. Check favourite status
  const resFavStatus = await fetch(`${API_BASE_URL}/api/profile/favourites/status/${userB.id}`, {
    headers: { Authorization: `Bearer ${tokenA}` },
  });
  const dataFavStatus = await resFavStatus.json();
  if (!dataFavStatus.success || !dataFavStatus.data.isFavourited) {
    throw new Error(`Expected isFavourited=true, got: ${JSON.stringify(dataFavStatus)}`);
  }
  console.log("✓ Verified favourite status is true.");

  // 6d. Remove User B from favourites
  const resDelFav = await fetch(`${API_BASE_URL}/api/profile/favourites/${userB.id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${tokenA}` },
  });
  const dataDelFav = await resDelFav.json();
  if (!dataDelFav.success) {
    throw new Error(`Failed to remove favourite: ${JSON.stringify(dataDelFav)}`);
  }
  console.log("✓ Removed User B from favourites successfully.");

  // 6e. Confirm favourite status is false
  const resFavStatusAfter = await fetch(`${API_BASE_URL}/api/profile/favourites/status/${userB.id}`, {
    headers: { Authorization: `Bearer ${tokenA}` },
  });
  const dataFavStatusAfter = await resFavStatusAfter.json();
  if (!dataFavStatusAfter.success || dataFavStatusAfter.data.isFavourited) {
    throw new Error(`Expected isFavourited=false, got: ${JSON.stringify(dataFavStatusAfter)}`);
  }
  console.log("✓ Verified favourite status is now false.");

  console.log("\n==================================================");
  console.log("ALL TWO-USER PROFILE ISOLATION TESTS PASSED 100%!");
  console.log("==================================================");
}

runIsolationTest()
  .catch((err) => {
    console.error("TEST FAILED:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
