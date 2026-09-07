import { PrismaClient } from "@prisma/client";
import * as fs from "fs";
import * as path from "path";

const prisma = new PrismaClient();

interface SourceReligionCategory {
  name: string;
  sub_category_label: string;
  options: string[];
}

interface SourceData {
  religions: SourceReligionCategory[];
}

async function main() {
  console.log("==================================================");
  console.log("MASTER DATA BATCH 1 — AUDIT & MAPPING SCRIPT");
  console.log("==================================================");

  // 1. Fetch existing database records
  const existingReligions = await prisma.religion.findMany({
    orderBy: { sortOrder: "asc" },
  });
  const existingCommunities = await prisma.community.findMany({
    include: { religion: true },
    orderBy: { sortOrder: "asc" },
  });

  // Profile counts referencing existing records
  const religionProfileCounts = await prisma.profileReligion.groupBy({
    by: ["religionId"],
    _count: { _all: true },
  });
  const communityProfileCounts = await prisma.profileReligion.groupBy({
    by: ["communityId"],
    _count: { _all: true },
  });

  const religionCountMap = new Map<string, number>();
  for (const r of religionProfileCounts) {
    if (r.religionId) religionCountMap.set(r.religionId, r._count._all);
  }

  const communityCountMap = new Map<string, number>();
  for (const c of communityProfileCounts) {
    if (c.communityId) communityCountMap.set(c.communityId, c._count._all);
  }

  // Partner preference counts
  const partnerPrefReligionCounts = await prisma.partnerPreferenceReligion.groupBy({
    by: ["religionId"],
    _count: { _all: true },
  });
  const partnerPrefCommunityCounts = await prisma.partnerPreferenceCommunity.groupBy({
    by: ["communityId"],
    _count: { _all: true },
  });

  const partnerRelCountMap = new Map<string, number>();
  for (const r of partnerPrefReligionCounts) {
    partnerRelCountMap.set(r.religionId, r._count._all);
  }
  const partnerComCountMap = new Map<string, number>();
  for (const c of partnerPrefCommunityCounts) {
    partnerComCountMap.set(c.communityId, c._count._all);
  }

  console.log(`[DB] Found ${existingReligions.length} religions and ${existingCommunities.length} communities in PostgreSQL.`);

  // 2. Load Source Data
  const sourcePath = path.join(__dirname, "../master-data/source/religion_community_caste_master_data.json");
  const rawSource = fs.readFileSync(sourcePath, "utf-8");
  const sourceData: SourceData = JSON.parse(rawSource);

  console.log(`[SOURCE] Loaded ${sourceData.religions.length} source religion categories.`);

  // Write full raw extraction info
  const dbReligionsDump = existingReligions.map((r) => ({
    id: r.id,
    name: r.name,
    slug: r.slug,
    isActive: r.isActive,
    sortOrder: r.sortOrder,
    profileCount: religionCountMap.get(r.id) || 0,
    partnerPrefCount: partnerRelCountMap.get(r.id) || 0,
  }));

  const dbCommunitiesDump = existingCommunities.map((c) => ({
    id: c.id,
    name: c.name,
    slug: c.slug,
    religionId: c.religionId,
    religionName: c.religion?.name || null,
    isActive: c.isActive,
    sortOrder: c.sortOrder,
    profileCount: communityCountMap.get(c.id) || 0,
    partnerPrefCount: partnerComCountMap.get(c.id) || 0,
  }));

  const outData = {
    dbReligions: dbReligionsDump,
    dbCommunities: dbCommunitiesDump,
    sourceReligions: sourceData.religions.map((r) => ({
      name: r.name,
      sub_category_label: r.sub_category_label,
      optionCount: r.options.length,
    })),
  };

  fs.writeFileSync(
    path.join(__dirname, "../master-data/reports/raw-db-source-dump.json"),
    JSON.stringify(outData, null, 2)
  );

  console.log("Dumped raw db and source metadata to master-data/reports/raw-db-source-dump.json");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
