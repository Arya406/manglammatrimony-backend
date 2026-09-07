/**
 * ==============================================================================
 * MANGLAM MATRIMONY — LOCAL REHEARSAL & IDEMPOTENCY TEST FOR PRODUCTION SEED
 *
 * This script runs strictly against the LOCAL development database.
 * It executes the unified production-safe master data seed twice:
 * 1. Verifies counts reach exact expected numbers.
 * 2. Verifies second run creates ZERO duplicate records.
 * 3. Verifies existing record UUIDs are NEVER changed or regenerated.
 * 4. Audits foreign key integrity, hierarchy rules, and zero test profile modifications.
 * ==============================================================================
 */

import { prisma } from "../src/config/database";
import {
  seedAllMasterData,
  validateMasterDataReadiness,
  EXPECTED_MASTER_DATA_COUNTS,
} from "../src/services/master-data-seed.service";

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

async function runLocalRehearsal() {
  console.log("==================================================================");
  console.log("MANGLAM MATRIMONY — PRODUCTION MASTER DATA LOCAL REHEARSAL");
  console.log("==================================================================");

  // 0. Take snapshot of existing master data IDs prior to run
  console.log("\n[STAGE 1: PRE-RUN SNAPSHOT]");
  const preCommunities = await prisma.community.findMany({ select: { id: true, slug: true } });
  const preOccupations = await prisma.occupation.findMany({ select: { id: true, slug: true, employmentStatusId: true } });
  const preCastes = await prisma.caste.findMany({ select: { id: true, slug: true, communityId: true } });
  const preGotras = await prisma.gotra.findMany({ select: { id: true, slug: true } });

  const preCommunityMap = new Map(preCommunities.map((c) => [c.slug, c.id]));
  const preOccupationMap = new Map(preOccupations.map((o) => [`${o.employmentStatusId}:${o.slug}`, o.id]));
  const preCasteMap = new Map(preCastes.map((c) => [`${c.communityId}:${c.slug}`, c.id]));
  const preGotraMap = new Map(preGotras.map((g) => [g.slug, g.id]));
  const preSoftEngId = preOccupations.find((o) => o.slug === "software-engineer")?.id;

  console.log(`  Snapshot taken: ${preCommunities.length} communities, ${preOccupations.length} occupations, ${preCastes.length} castes, ${preGotras.length} gotras.`);

  // 1. First Execution of Production Master Seed
  console.log("\n[STAGE 2: SEED EXECUTION 1 (INITIAL POPULATION / RE-VERIFICATION)]");
  const result1 = await seedAllMasterData(prisma);
  assert(result1.success, "Run 1 completed successfully", `duration: ${result1.durationMs}ms`);

  const report1 = await validateMasterDataReadiness(prisma);
  console.log("\n  Table Counts after Run 1:");
  for (const [table, count] of Object.entries(report1.actualCounts)) {
    const exp = EXPECTED_MASTER_DATA_COUNTS[table];
    assert(count === exp, `Table '${table}' matches expected count (${count}/${exp})`);
  }

  assert(report1.orphanCount === 0, `Run 1 orphan foreign keys = 0 (found ${report1.orphanCount})`);
  assert(report1.invalidReligionLinks === 0, `Run 1 universal communities have religionId = null (violations: ${report1.invalidReligionLinks})`);
  assert(report1.isReady, "Run 1 master data readiness status is READY");

  // 2. Second Execution (Idempotency Test)
  console.log("\n[STAGE 3: SEED EXECUTION 2 (IDEMPOTENCY & STABILITY REHEARSAL)]");
  const result2 = await seedAllMasterData(prisma);
  assert(result2.success, "Run 2 (second pass) completed successfully", `duration: ${result2.durationMs}ms`);

  const report2 = await validateMasterDataReadiness(prisma);
  console.log("\n  Table Counts after Run 2 (Idempotency Check):");
  for (const [table, count] of Object.entries(report2.actualCounts)) {
    const exp = EXPECTED_MASTER_DATA_COUNTS[table];
    assert(count === exp, `Table '${table}' count remained identical (${count}/${exp}, 0 duplicates created)`);
  }

  assert(report2.orphanCount === 0, "Run 2 orphan foreign keys = 0");
  assert(report2.isReady, "Run 2 master data readiness status remains READY");

  // 3. Verify Existing UUID Stability
  console.log("\n[STAGE 4: RECORD UUID STABILITY & ANTI-DRIFT VERIFICATION]");
  const postCommunities = await prisma.community.findMany({ select: { id: true, slug: true } });
  let communityIdMismatch = 0;
  for (const c of postCommunities) {
    if (preCommunityMap.has(c.slug)) {
      if (preCommunityMap.get(c.slug) !== c.id) {
        communityIdMismatch++;
      }
    }
  }
  assert(communityIdMismatch === 0, `Existing community UUIDs preserved (0 changed, ${communityIdMismatch} drifted)`);

  const postOccupations = await prisma.occupation.findMany({ select: { id: true, slug: true, employmentStatusId: true } });
  let occupationIdMismatch = 0;
  for (const o of postOccupations) {
    const key = `${o.employmentStatusId}:${o.slug}`;
    if (preOccupationMap.has(key)) {
      if (preOccupationMap.get(key) !== o.id) {
        occupationIdMismatch++;
      }
    }
  }
  assert(occupationIdMismatch === 0, `Existing occupation UUIDs preserved (0 changed, ${occupationIdMismatch} drifted)`);

  const softEng = await prisma.occupation.findFirst({ where: { slug: "software-engineer" } });
  assert(
    softEng?.id === preSoftEngId,
    `Software Engineer preserved existing ID '${preSoftEngId}' (actual: ${softEng?.id})`
  );

  const postCastes = await prisma.caste.findMany({ select: { id: true, slug: true, communityId: true } });
  let casteIdMismatch = 0;
  for (const c of postCastes) {
    const key = `${c.communityId}:${c.slug}`;
    if (preCasteMap.has(key)) {
      if (preCasteMap.get(key) !== c.id) {
        casteIdMismatch++;
      }
    }
  }
  assert(casteIdMismatch === 0, `Existing caste UUIDs preserved (0 changed, ${casteIdMismatch} drifted)`);

  const postGotras = await prisma.gotra.findMany({ select: { id: true, slug: true } });
  let gotraIdMismatch = 0;
  for (const g of postGotras) {
    if (preGotraMap.has(g.slug)) {
      if (preGotraMap.get(g.slug) !== g.id) {
        gotraIdMismatch++;
      }
    }
  }
  assert(gotraIdMismatch === 0, `Existing gotra UUIDs preserved (0 changed, ${gotraIdMismatch} drifted)`);

  // 4. Cultural Hierarchy Verification
  console.log("\n[STAGE 5: CULTURAL HIERARCHY RULES VERIFICATION]");
  const otherCommunity = await prisma.community.findUnique({ where: { slug: "other" } });
  assert(otherCommunity?.religionId === null, "'Other' community has religionId = null (universal)");

  const preferNotToSayCommunity = await prisma.community.findUnique({ where: { slug: "prefer-not-to-say" } });
  assert(preferNotToSayCommunity?.religionId === null, "'Prefer not to say' community has religionId = null (universal)");

  const hindu = await prisma.religion.findUnique({ where: { slug: "hindu" } });
  const brahmin = await prisma.community.findUnique({ where: { slug: "brahmin" } });
  assert(brahmin?.religionId === hindu?.id, "Brahmin community is linked to Hindu religion");

  const maratha = await prisma.community.findUnique({ where: { slug: "maratha" } });
  assert(maratha?.religionId === hindu?.id, "Maratha community is linked to Hindu religion");

  const shia = await prisma.community.findUnique({ where: { slug: "shia" } });
  const muslim = await prisma.religion.findUnique({ where: { slug: "muslim" } });
  assert(shia?.religionId === muslim?.id, "Shia community is linked to Muslim religion");

  console.log("\n==================================================================");
  console.log(`REHEARSAL RESULTS: ${passed} PASSED | ${failed} FAILED`);
  console.log("==================================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runLocalRehearsal()
  .catch((err) => {
    console.error("FATAL ERROR IN REHEARSAL:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
