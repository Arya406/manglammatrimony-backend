import { PrismaClient } from "@prisma/client";
import http from "http";
import * as fs from "fs";
import * as path from "path";

const prisma = new PrismaClient();

function fetchJson(url: string): Promise<any> {
  return new Promise((resolve, reject) => {
    http
      .get(url, (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try {
            resolve({ statusCode: res.statusCode, body: JSON.parse(data) });
          } catch (e) {
            resolve({ statusCode: res.statusCode, raw: data });
          }
        });
      })
      .on("error", (err) => reject(err));
  });
}

async function verify() {
  console.log("==================================================");
  console.log("MANGALAM MATRIMONY — BATCH 3 VERIFICATION SUITE");
  console.log("==================================================");

  // 1. Gotra Count Before/After
  const gotraCount = await prisma.gotra.count();
  console.log(`\n[CHECK 1] Gotra count in DB: ${gotraCount}`);
  if (gotraCount !== 60) {
    throw new Error(`Expected exactly 60 gotras, but found ${gotraCount}`);
  }
  console.log("✓ CHECK 1 PASSED: 60 Gotras confirmed in database.");

  // 2. Confirm Expected Source Records Were Populated
  const sourcePath = path.join(__dirname, "../master-data/source/hindu_gotra_reference_list.json");
  const source = JSON.parse(fs.readFileSync(sourcePath, "utf-8"));
  const expectedNames = [...source.foundational_gotras, ...source.commonly_used_derivative_gotras];

  const dbGotras = await prisma.gotra.findMany({ orderBy: { sortOrder: "asc" } });
  const dbNames = new Set(dbGotras.map((g) => g.name));

  for (const name of expectedNames) {
    if (!dbNames.has(name)) {
      throw new Error(`Expected gotra '${name}' not found in DB!`);
    }
  }
  console.log(`\n[CHECK 2] Verified all ${expectedNames.length} expected source names are present in DB.`);
  console.log("✓ CHECK 2 PASSED: All source records successfully populated.");

  // 3. Duplicate Slug Check
  const dbSlugs = new Set<string>();
  const duplicateSlugs: string[] = [];
  for (const g of dbGotras) {
    if (dbSlugs.has(g.slug)) {
      duplicateSlugs.push(g.slug);
    }
    dbSlugs.add(g.slug);
  }
  console.log(`\n[CHECK 3] Duplicate slugs in DB: ${duplicateSlugs.length}`);
  if (duplicateSlugs.length > 0) {
    throw new Error(`Duplicate slugs found: ${duplicateSlugs.join(", ")}`);
  }
  console.log("✓ CHECK 3 PASSED: Zero duplicate slugs found.");

  // 4. FK Integrity Check if Gotra has communityId
  const gotrasWithComId = dbGotras.filter((g) => g.communityId !== null);
  console.log(`\n[CHECK 4] Gotras with non-null communityId: ${gotrasWithComId.length}`);
  for (const g of gotrasWithComId) {
    const com = await prisma.community.findUnique({ where: { id: g.communityId! } });
    if (!com) {
      throw new Error(`Gotra '${g.name}' references non-existent communityId '${g.communityId}'`);
    }
  }
  console.log("✓ CHECK 4 PASSED: Foreign key integrity confirmed (0 broken references).");

  // 5. GET /api/profile/gotras (Public API endpoint)
  console.log("\n[CHECK 5 & 6] Testing Express API Endpoints:");
  const { app } = await import("../src/app");
  const server = app.listen(0);
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 5001;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // 5. GET /api/profile/gotras (unfiltered)
    const gotrasRes = await fetchJson(`${baseUrl}/api/profile/gotras`);
    console.log(`- GET /api/profile/gotras -> Status: ${gotrasRes.statusCode}, Gotras: ${gotrasRes.body?.data?.length}`);
    if (gotrasRes.statusCode !== 200 || !gotrasRes.body?.success || gotrasRes.body?.data?.length !== 60) {
      throw new Error("Failed GET /api/profile/gotras check!");
    }
    console.log("✓ CHECK 5 PASSED: GET /api/profile/gotras returns 200 OK with 60 gotras.");

    // 6. Verify Onboarding Gotra Dropdown Loads (when selecting community)
    const brahmin = await prisma.community.findFirst({ where: { slug: "brahmin" } });
    const rajput = await prisma.community.findFirst({ where: { slug: "rajput" } });
    const agarwal = await prisma.community.findFirst({ where: { slug: "agarwal" } });

    if (brahmin) {
      const res = await fetchJson(`${baseUrl}/api/profile/gotras?communityId=${brahmin.id}`);
      console.log(`- GET /api/profile/gotras?communityId=Brahmin -> Status: ${res.statusCode}, Count: ${res.body?.data?.length}`);
      if (res.statusCode !== 200 || !res.body?.success || res.body?.data?.length !== 60) {
        throw new Error("Dropdown failed to load gotras for Brahmin community!");
      }
    }

    if (rajput) {
      const res = await fetchJson(`${baseUrl}/api/profile/gotras?communityId=${rajput.id}`);
      console.log(`- GET /api/profile/gotras?communityId=Rajput -> Status: ${res.statusCode}, Count: ${res.body?.data?.length}`);
      if (res.statusCode !== 200 || !res.body?.success || res.body?.data?.length !== 60) {
        throw new Error("Dropdown failed to load gotras for Rajput community!");
      }
    }

    if (agarwal) {
      const res = await fetchJson(`${baseUrl}/api/profile/gotras?communityId=${agarwal.id}`);
      console.log(`- GET /api/profile/gotras?communityId=Agarwal -> Status: ${res.statusCode}, Count: ${res.body?.data?.length}`);
      if (res.statusCode !== 200 || !res.body?.success || res.body?.data?.length !== 60) {
        throw new Error("Dropdown failed to load gotras for Agarwal community!");
      }
    }
    console.log("✓ CHECK 6 PASSED: Onboarding Gotra dropdown loads seamlessly across communities.");

  } finally {
    server.close();
  }

  // 7. Verify existing profile data remains unchanged
  const totalProfileReligions = await prisma.profileReligion.count();
  console.log(`\n[CHECK 7] Existing ProfileReligion records count: ${totalProfileReligions}`);
  if (totalProfileReligions !== 27) {
    throw new Error(`ProfileReligion count changed! Expected 27, found ${totalProfileReligions}`);
  }
  console.log("✓ CHECK 7 PASSED: Existing profile data strictly unchanged (27 records).");

  console.log("\n==================================================");
  console.log("ALL BATCH 3 VERIFICATIONS PASSED SUCCESSFULLY!");
  console.log("==================================================");
}

verify()
  .then(() => {
    process.exit(0);
  })
  .catch((e) => {
    console.error("\n[VERIFICATION FAILED]:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
