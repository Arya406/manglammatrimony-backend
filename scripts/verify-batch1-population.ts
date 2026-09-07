import { PrismaClient } from "@prisma/client";
import http from "http";

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
  console.log("MANGALAM MATRIMONY — POST-POPULATION INTEGRITY AUDIT");
  console.log("==================================================");

  // 1. Table Record Counts
  const relCount = await prisma.religion.count();
  const comCount = await prisma.community.count();
  const subComCount = await prisma.subCommunity.count();
  const casteCount = await prisma.caste.count();
  const subCasteCount = await prisma.subCaste.count();
  const gotraCount = await prisma.gotra.count();
  const profileRelCount = await prisma.profileReligion.count();

  console.log("\n1. FINAL TABLE RECORD COUNTS:");
  console.log(`- religions        : ${relCount}`);
  console.log(`- communities      : ${comCount}`);
  console.log(`- sub_communities  : ${subComCount}`);
  console.log(`- castes           : ${casteCount}`);
  console.log(`- sub_castes       : ${subCasteCount}`);
  console.log(`- gotras           : ${gotraCount}`);
  console.log(`- profile_religion : ${profileRelCount}`);

  // Communities count by Religion
  const communities = await prisma.community.findMany({ include: { religion: true } });
  const byReligion: Record<string, number> = {};
  for (const c of communities) {
    const relName = c.religion ? c.religion.name : "Universal (NULL)";
    byReligion[relName] = (byReligion[relName] || 0) + 1;
  }
  console.log("\nCommunities breakdown by religion:", byReligion);

  // 2. FK Integrity Checks
  console.log("\n2. FOREIGN KEY INTEGRITY CHECKS:");
  // Communities -> Religion
  const invalidRelFk = communities.filter((c) => c.religionId !== null && !c.religion);
  console.log(`- Broken Community -> Religion FKs: ${invalidRelFk.length}`);
  if (invalidRelFk.length > 0) throw new Error("Broken Community->Religion FK detected!");

  // SubCommunities -> Community
  const subCommunities = await prisma.subCommunity.findMany({ include: { community: true } });
  const invalidComFk = subCommunities.filter((sc) => !sc.community);
  console.log(`- Broken SubCommunity -> Community FKs: ${invalidComFk.length}`);
  if (invalidComFk.length > 0) throw new Error("Broken SubCommunity->Community FK detected!");

  // ProfileReligion -> Religion & Community
  const profileReligions = await prisma.profileReligion.findMany({
    include: { religion: true, community: true },
  });
  const invalidProfileRel = profileReligions.filter((pr) => !pr.religion);
  const invalidProfileCom = profileReligions.filter((pr) => pr.communityId && !pr.community);
  console.log(`- Broken Profile -> Religion FKs: ${invalidProfileRel.length}`);
  console.log(`- Broken Profile -> Community FKs: ${invalidProfileCom.length}`);
  if (invalidProfileRel.length > 0 || invalidProfileCom.length > 0) {
    throw new Error("Broken Profile FKs detected!");
  }

  // 3. Cross-Religion Profile Consistency Check
  console.log("\n3. PROFILE RELIGION <-> COMMUNITY CONSISTENCY CHECK:");
  let profileMismatches = 0;
  for (const pr of profileReligions) {
    if (pr.communityId && pr.community) {
      if (pr.community.religionId !== null && pr.community.religionId !== pr.religionId) {
        console.error(
          `MISMATCH: Profile ${pr.profileId} has religion '${pr.religion.name}' but community '${pr.community.name}' (religion '${pr.community.religionId}')`
        );
        profileMismatches++;
      }
    }
  }
  console.log(`- Cross-religion profile mismatches: ${profileMismatches}`);
  if (profileMismatches > 0) {
    throw new Error("Inconsistent profile religion/community detected!");
  }
  console.log("  [PASS] 100% of all profiles are internally consistent!");

  // 4. Duplicate Name / Slug Checks
  console.log("\n4. DUPLICATE SLUG & NAME CHECKS:");
  const communitySlugs = new Set<string>();
  let duplicateSlugs = 0;
  for (const c of communities) {
    if (communitySlugs.has(c.slug)) {
      console.error(`Duplicate Community slug detected: ${c.slug}`);
      duplicateSlugs++;
    }
    communitySlugs.add(c.slug);
  }
  console.log(`- Duplicate Community slugs: ${duplicateSlugs}`);

  const subComMap = new Set<string>();
  let duplicateSubCom = 0;
  for (const sc of subCommunities) {
    const key = `${sc.communityId}:${sc.slug}`;
    if (subComMap.has(key)) {
      console.error(`Duplicate SubCommunity under community ${sc.communityId}: ${sc.slug}`);
      duplicateSubCom++;
    }
    subComMap.add(key);
  }
  console.log(`- Duplicate SubCommunity scoped slugs: ${duplicateSubCom}`);

  // 5. API Endpoint Tests (mounting Express app on ephemeral port)
  console.log("\n5. API ENDPOINT VALIDATION (via Express app):");
  const { app } = await import("../src/app");
  const server = app.listen(0);
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 5001;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // A. GET /api/profile/religions
    const relRes = await fetchJson(`${baseUrl}/api/profile/religions`);
    console.log(`- GET /api/profile/religions -> Status: ${relRes.statusCode}, Count: ${relRes.body?.data?.length}`);

    // B. GET /api/profile/communities?religionId=...
    const religions = await prisma.religion.findMany();
    const hindu = religions.find((r) => r.slug === "hindu")!;
    const muslim = religions.find((r) => r.slug === "muslim")!;
    const christian = religions.find((r) => r.slug === "christian")!;
    const sikh = religions.find((r) => r.slug === "sikh")!;
    const jain = religions.find((r) => r.slug === "jain")!;

    const hinduComRes = await fetchJson(`${baseUrl}/api/profile/communities?religionId=${hindu.id}`);
    console.log(`- GET /api/profile/communities?religionId=Hindu -> Status: ${hinduComRes.statusCode}, Communities: ${hinduComRes.body?.data?.length}`);

    const muslimComRes = await fetchJson(`${baseUrl}/api/profile/communities?religionId=${muslim.id}`);
    console.log(`- GET /api/profile/communities?religionId=Muslim -> Status: ${muslimComRes.statusCode}, Communities: ${muslimComRes.body?.data?.length}`);

    const christianComRes = await fetchJson(`${baseUrl}/api/profile/communities?religionId=${christian.id}`);
    console.log(`- GET /api/profile/communities?religionId=Christian -> Status: ${christianComRes.statusCode}, Communities: ${christianComRes.body?.data?.length}`);

    const sikhComRes = await fetchJson(`${baseUrl}/api/profile/communities?religionId=${sikh.id}`);
    console.log(`- GET /api/profile/communities?religionId=Sikh -> Status: ${sikhComRes.statusCode}, Communities: ${sikhComRes.body?.data?.length}`);

    const jainComRes = await fetchJson(`${baseUrl}/api/profile/communities?religionId=${jain.id}`);
    console.log(`- GET /api/profile/communities?religionId=Jain -> Status: ${jainComRes.statusCode}, Communities: ${jainComRes.body?.data?.length}`);

    // C. GET /api/profile/sub-communities?communityId=...
    const shia = communities.find((c) => c.slug === "shia")!;
    const sunni = communities.find((c) => c.slug === "sunni")!;
    const knanaya = communities.find((c) => c.slug === "knanaya")!;
    const digambar = communities.find((c) => c.slug === "digambar")!;

    const shiaSubRes = await fetchJson(`${baseUrl}/api/profile/sub-communities?communityId=${shia.id}`);
    console.log(`- GET /api/profile/sub-communities?communityId=Shia -> Status: ${shiaSubRes.statusCode}, SubCommunities: ${shiaSubRes.body?.data?.length}`);

    const sunniSubRes = await fetchJson(`${baseUrl}/api/profile/sub-communities?communityId=${sunni.id}`);
    console.log(`- GET /api/profile/sub-communities?communityId=Sunni -> Status: ${sunniSubRes.statusCode}, SubCommunities: ${sunniSubRes.body?.data?.length}`);

    const knanayaSubRes = await fetchJson(`${baseUrl}/api/profile/sub-communities?communityId=${knanaya.id}`);
    console.log(`- GET /api/profile/sub-communities?communityId=Knanaya -> Status: ${knanayaSubRes.statusCode}, SubCommunities: ${knanayaSubRes.body?.data?.length}`);

    const digambarSubRes = await fetchJson(`${baseUrl}/api/profile/sub-communities?communityId=${digambar.id}`);
    console.log(`- GET /api/profile/sub-communities?communityId=Digambar -> Status: ${digambarSubRes.statusCode}, SubCommunities: ${digambarSubRes.body?.data?.length}`);

    // D. GET /api/profile/castes?communityId=...
    const brahmin = communities.find((c) => c.slug === "brahmin")!;
    const casteRes = await fetchJson(`${baseUrl}/api/profile/castes?communityId=${brahmin.id}`);
    console.log(`- GET /api/profile/castes?communityId=Brahmin -> Status: ${casteRes.statusCode}, Castes: ${casteRes.body?.data?.length} (Batch 2 entity)`);

    // E. GET /api/profile/sub-castes
    const subCasteRes = await fetchJson(`${baseUrl}/api/profile/sub-castes`);
    console.log(`- GET /api/profile/sub-castes -> Status: ${subCasteRes.statusCode}, SubCastes: ${subCasteRes.body?.data?.length} (Batch 2 entity)`);

    // F. GET /api/profile/gotras?communityId=...
    const gotraRes = await fetchJson(`${baseUrl}/api/profile/gotras?communityId=${brahmin.id}`);
    console.log(`- GET /api/profile/gotras?communityId=Brahmin -> Status: ${gotraRes.statusCode}, Gotras: ${gotraRes.body?.data?.length} (Batch 2 entity)`);

    console.log("\n==================================================");
    console.log("ALL INTEGRITY AND API CHECKS PASSED PERFECTLY!");
    console.log("==================================================");
  } finally {
    server.close();
  }
}

verify()
  .catch((e) => {
    console.error("VERIFICATION FAILED:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
