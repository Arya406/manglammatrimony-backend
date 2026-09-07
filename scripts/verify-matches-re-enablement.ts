import { prisma } from "../src/config/database";
import jwt from "jsonwebtoken";
import { config } from "../src/config/env";
import { ProfileStatus, UserStatus } from "@prisma/client";

const BACKEND_URL = "http://localhost:5000";

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

async function runVerification() {
  console.log("==================================================================");
  console.log("MANGLAM MATRIMONY — MATCHES FOR ALL AUTHENTICATED USERS SUITE");
  console.log("==================================================================");

  // 1. ACTIVE USER
  const activeUser = await prisma.user.findFirst({
    where: {
      status: UserStatus.ACTIVE,
      profile: {
        profileStatus: ProfileStatus.ACTIVE,
      },
    },
    include: {
      profile: {
        include: {
          personalDetails: true,
        },
      },
    },
  });

  if (!activeUser) {
    throw new Error("No ACTIVE user found in database.");
  }

  const activeToken = jwt.sign(
    { userId: activeUser.id, email: activeUser.email, status: activeUser.status },
    config.jwtSecret,
    { expiresIn: "1h" }
  );

  const activeHeaders = {
    Authorization: `Bearer ${activeToken}`,
    "Content-Type": "application/json",
  };

  console.log("\n--- [1. ACTIVE USER CHECKS] ---");
  const activeRes = await fetch(`${BACKEND_URL}/api/matches`, { headers: activeHeaders });
  assert(activeRes.status === 200, "1. ACTIVE user GET /api/matches returns HTTP 200 OK");

  const activeData: any = await activeRes.json();
  assert(activeData.success === true, "2. ACTIVE user response has success: true");
  const activeProfiles: any[] = activeData.data?.profiles || [];
  assert(activeProfiles.length > 0, `3. Discovery returned ${activeProfiles.length} real profiles`);

  // Self-exclusion
  const selfFoundInActive = activeProfiles.some((p) => p.id === activeUser.profile?.id);
  assert(!selfFoundInActive, "4. Current user's own profile strictly EXCLUDED from matches");

  // Profile data integrity
  const candidate = activeProfiles[0];
  assert(typeof candidate.id === "string" && candidate.id.length > 0, `5. Candidate has valid ID: ${candidate.id}`);
  assert(typeof candidate.name === "string" && candidate.name.length > 0, `6. Candidate has real name: "${candidate.name}"`);
  assert(typeof candidate.age === "number" && candidate.age >= 18, `7. Candidate has valid age: ${candidate.age}`);
  assert(Array.isArray(candidate.photos), `8. Candidate has photos array (length: ${candidate.photos.length})`);

  // Existing actions still work for ACTIVE user
  const favAddRes = await fetch(`${BACKEND_URL}/api/profile/favourites/${candidate.id}`, {
    method: "POST",
    headers: activeHeaders,
  });
  const favAddJson: any = await favAddRes.json();
  assert(favAddJson.success === true, `9. Active user can favourite candidate (${candidate.name})`);

  const favRemoveRes = await fetch(`${BACKEND_URL}/api/profile/favourites/${candidate.id}`, {
    method: "DELETE",
    headers: activeHeaders,
  });
  const favRemoveJson: any = await favRemoveRes.json();
  assert(favRemoveJson.success === true, `10. Active user can remove favourite (${candidate.name})`);

  // 2. IN_REVIEW USER
  console.log("\n--- [2. IN_REVIEW USER CHECKS] ---");
  const inReviewUser = await prisma.user.findFirst({
    where: {
      status: UserStatus.ACTIVE,
      profile: {
        profileStatus: ProfileStatus.IN_REVIEW,
      },
    },
    include: { profile: true },
  });

  if (inReviewUser) {
    const inReviewToken = jwt.sign(
      { userId: inReviewUser.id, email: inReviewUser.email, status: inReviewUser.status },
      config.jwtSecret,
      { expiresIn: "1h" }
    );
    const inReviewHeaders = {
      Authorization: `Bearer ${inReviewToken}`,
      "Content-Type": "application/json",
    };

    const inReviewMatchesRes = await fetch(`${BACKEND_URL}/api/matches`, { headers: inReviewHeaders });
    assert(
      inReviewMatchesRes.status === 200,
      `11. IN_REVIEW user GET /api/matches returns HTTP 200 OK under temporary rule (got: ${inReviewMatchesRes.status})`
    );

    const inReviewData: any = await inReviewMatchesRes.json();
    assert(inReviewData.success === true, "12. IN_REVIEW user response has success: true");
    const inReviewProfiles: any[] = inReviewData.data?.profiles || [];
    assert(inReviewProfiles.length > 0, `13. IN_REVIEW user received ${inReviewProfiles.length} candidate profiles`);

    // Self-exclusion for IN_REVIEW user
    if (inReviewUser.profile) {
      const selfFoundInReview = inReviewProfiles.some((p) => p.id === inReviewUser.profile?.id);
      assert(!selfFoundInReview, "14. IN_REVIEW user's own profile strictly EXCLUDED from matches");
    }

    // Lifecycle restriction OUTSIDE matches: messaging still blocked
    const inReviewMsgRes = await fetch(`${BACKEND_URL}/api/messages/conversations`, { headers: inReviewHeaders });
    assert(
      inReviewMsgRes.status === 403,
      `15. IN_REVIEW user messaging remains authoritatively BLOCKED with HTTP 403 (got: ${inReviewMsgRes.status})`
    );
  } else {
    console.log("  [WARN] No IN_REVIEW user found in database");
  }

  // 3. INCOMPLETE USER
  console.log("\n--- [3. INCOMPLETE USER CHECKS] ---");
  const incompleteUser = await prisma.user.findFirst({
    where: {
      status: UserStatus.ACTIVE,
      profile: {
        profileStatus: ProfileStatus.INCOMPLETE,
      },
    },
    include: { profile: true },
  });

  if (incompleteUser) {
    const incToken = jwt.sign(
      { userId: incompleteUser.id, email: incompleteUser.email, status: incompleteUser.status },
      config.jwtSecret,
      { expiresIn: "1h" }
    );
    const incHeaders = {
      Authorization: `Bearer ${incToken}`,
      "Content-Type": "application/json",
    };

    const incMatchesRes = await fetch(`${BACKEND_URL}/api/matches`, { headers: incHeaders });
    assert(
      incMatchesRes.status === 200,
      `16. INCOMPLETE user GET /api/matches returns HTTP 200 OK under temporary rule (got: ${incMatchesRes.status})`
    );

    const incData: any = await incMatchesRes.json();
    assert(incData.success === true, "17. INCOMPLETE user response has success: true");
    const incProfiles: any[] = incData.data?.profiles || [];
    assert(incProfiles.length > 0, `18. INCOMPLETE user received ${incProfiles.length} candidate profiles`);

    // Self-exclusion for INCOMPLETE user
    if (incompleteUser.profile) {
      const selfFoundInInc = incProfiles.some((p) => p.id === incompleteUser.profile?.id);
      assert(!selfFoundInInc, "19. INCOMPLETE user's own profile strictly EXCLUDED from matches");
    }

    // Lifecycle restriction OUTSIDE matches: messaging still blocked
    const incMsgRes = await fetch(`${BACKEND_URL}/api/messages/conversations`, { headers: incHeaders });
    assert(
      incMsgRes.status === 403,
      `20. INCOMPLETE user messaging remains authoritatively BLOCKED with HTTP 403 (got: ${incMsgRes.status})`
    );
  } else {
    console.log("  [WARN] No INCOMPLETE user found in database");
  }

  // 4. SUSPENDED USER
  console.log("\n--- [4. SUSPENDED USER CHECKS] ---");
  let suspendedUser = await prisma.user.findFirst({
    where: {
      status: UserStatus.SUSPENDED,
    },
    include: { profile: true },
  });

  if (!suspendedUser) {
    suspendedUser = await prisma.user.create({
      data: {
        email: `suspended.review.${Date.now()}@example.com`,
        status: UserStatus.SUSPENDED,
      },
      include: { profile: true },
    });
  }

  const suspendedToken = jwt.sign(
    { userId: suspendedUser.id, email: suspendedUser.email, status: suspendedUser.status },
    config.jwtSecret,
    { expiresIn: "1h" }
  );
  const suspendedHeaders = {
    Authorization: `Bearer ${suspendedToken}`,
    "Content-Type": "application/json",
  };

  const suspMatchesRes = await fetch(`${BACKEND_URL}/api/matches`, { headers: suspendedHeaders });
  assert(
    suspMatchesRes.status === 200,
    `21. SUSPENDED user GET /api/matches returns HTTP 200 OK under temporary rule (got: ${suspMatchesRes.status})`
  );

  const suspData: any = await suspMatchesRes.json();
  assert(suspData.success === true, "22. SUSPENDED user response has success: true");
  const suspProfiles: any[] = suspData.data?.profiles || [];
  assert(suspProfiles.length > 0, `23. SUSPENDED user received ${suspProfiles.length} candidate profiles`);

  // Suspension restriction OUTSIDE matches: messaging still blocked
  const suspMsgRes = await fetch(`${BACKEND_URL}/api/messages/conversations`, { headers: suspendedHeaders });
  assert(
    suspMsgRes.status === 403,
    `24. SUSPENDED user messaging remains authoritatively BLOCKED with HTTP 403 ACCOUNT_SUSPENDED (got: ${suspMsgRes.status})`
  );

  // 5. UNAUTHENTICATED REQUEST CHECK
  console.log("\n--- [5. UNAUTHENTICATED REQUEST CHECKS] ---");
  const unauthRes = await fetch(`${BACKEND_URL}/api/matches`);
  assert(
    unauthRes.status === 401,
    `25. Unauthenticated request to /api/matches is REJECTED with HTTP 401 (got: ${unauthRes.status})`
  );
  const unauthJson: any = await unauthRes.json();
  assert(unauthJson.code === "UNAUTHORIZED", `26. Error code is UNAUTHORIZED (got: ${unauthJson.code})`);

  // 6. REAL DATA VALIDATION
  console.log("\n--- [6. REAL DATA VALIDATION IN POSTGRESQL] ---");
  for (let i = 0; i < Math.min(5, activeProfiles.length); i++) {
    const cand = activeProfiles[i];
    const dbRecord = await prisma.profile.findUnique({
      where: { id: cand.id },
      include: { user: true, personalDetails: true },
    });
    assert(dbRecord !== null, `27.${i + 1} Profile ${cand.id} verified as real DB record (${cand.name})`);
    assert(dbRecord?.profileStatus === ProfileStatus.ACTIVE, `27.${i + 1} Profile ${cand.id} has profileStatus ACTIVE`);
    assert(dbRecord?.user.status === UserStatus.ACTIVE, `27.${i + 1} Profile ${cand.id} has user.status ACTIVE`);
  }

  console.log("\n==================================================================");
  console.log(`VERIFICATION SUMMARY: ${passed} PASSED | ${failed} FAILED`);
  console.log("==================================================================");
}

runVerification()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
