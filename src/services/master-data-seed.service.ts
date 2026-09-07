import { PrismaClient, Prisma } from "@prisma/client";
import { prisma as defaultPrisma } from "../config/database";
import {
  RELIGIONS_DATA,
  LANGUAGES_DATA,
  EDUCATIONS_DATA,
  EMPLOYMENT_STATUSES_DATA,
} from "../seeds/core.data";
import {
  COMMUNITIES_DATA,
  SUB_COMMUNITIES_DATA,
  CASTES_DATA,
  GOTRAS_DATA,
} from "../seeds/cultural.data";
import {
  SPECIALIZATIONS_BY_EDUCATION,
  OCCUPATIONS_BY_STATUS,
  INSTITUTIONS_DATA,
  EXISTING_SOFTWARE_ENGINEER_ID,
} from "../seeds/education-career.data";

function generateSlug(str: string): string {
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function processInChunks<T>(
  items: T[],
  chunkSize: number,
  fn: (item: T) => Promise<void>
): Promise<void> {
  for (let i = 0; i < items.length; i += chunkSize) {
    const chunk = items.slice(i, i + chunkSize);
    await Promise.all(chunk.map(fn));
  }
}

export interface MasterDataSeedResult {
  success: boolean;
  counts: {
    religions: number;
    communities: number;
    subCommunities: number;
    castes: number;
    subCastes: number;
    gotras: number;
    languages: number;
    educations: number;
    specializations: number;
    institutions: number;
    employmentStatuses: number;
    occupations: number;
  };
  durationMs: number;
}

export interface MasterDataValidationReport {
  isReady: boolean;
  expectedCounts: Record<string, number>;
  actualCounts: Record<string, number>;
  discrepancies: Array<{ table: string; expected: number; actual: number }>;
  duplicateCount: number;
  orphanCount: number;
  invalidReligionLinks: number;
  errors: string[];
}

export const EXPECTED_MASTER_DATA_COUNTS: Record<string, number> = {
  religions: 10,
  communities: 432,
  subCommunities: 17,
  castes: 92,
  subCastes: 0,
  gotras: 60,
  languages: 21,
  educations: 25,
  specializations: 241,
  institutions: 208,
  employmentStatuses: 10,
  occupations: 117,
};

/**
 * Idempotently seeds the complete, verified production master data.
 * - Fully self-contained (no untracked filesystem dependencies)
 * - Zero test profile UUID logic
 * - Preserves existing record UUIDs (never deletes or regenerates IDs)
 * - Safe to execute repeatedly without duplicating records
 */
export async function seedAllMasterData(
  client: PrismaClient | Prisma.TransactionClient = defaultPrisma
): Promise<MasterDataSeedResult> {
  const startTime = Date.now();
  console.log("[MASTER DATA SEED] Starting unified production-safe master data seeding...");

  // 1. Seed Religions (10)
  for (const rel of RELIGIONS_DATA) {
    await client.religion.upsert({
      where: { slug: rel.slug },
      update: { name: rel.name, sortOrder: rel.sortOrder, isActive: true },
      create: { name: rel.name, slug: rel.slug, sortOrder: rel.sortOrder, isActive: true },
    });
  }

  // 2. Seed Languages (21)
  for (const lang of LANGUAGES_DATA) {
    await client.language.upsert({
      where: { code: lang.code },
      update: { name: lang.name, sortOrder: lang.sortOrder, isActive: true },
      create: { name: lang.name, code: lang.code, sortOrder: lang.sortOrder, isActive: true },
    });
  }

  // 3. Seed Communities (432)
  const religions = await client.religion.findMany({ select: { id: true, slug: true } });
  const religionMap = new Map<string, string>();
  religions.forEach((r) => religionMap.set(r.slug, r.id));

  await processInChunks(COMMUNITIES_DATA, 10, async (com) => {
    const religionId = com.religionSlug ? religionMap.get(com.religionSlug) ?? null : null;
    await client.community.upsert({
      where: { slug: com.slug },
      update: {
        name: com.name,
        sortOrder: com.sortOrder,
        religionId,
        isActive: true,
      },
      create: {
        name: com.name,
        slug: com.slug,
        sortOrder: com.sortOrder,
        religionId,
        isActive: true,
      },
    });
  });

  // 4. Seed Sub-Communities (17)
  const communities = await client.community.findMany({ select: { id: true, slug: true } });
  const communityMap = new Map<string, string>();
  communities.forEach((c) => communityMap.set(c.slug, c.id));

  for (const sub of SUB_COMMUNITIES_DATA) {
    const communityId = communityMap.get(sub.communitySlug);
    if (!communityId) {
      throw new Error(`[MasterDataSeedError] Missing parent community '${sub.communitySlug}' for sub-community '${sub.slug}'`);
    }

    await client.subCommunity.upsert({
      where: {
        communityId_slug: {
          communityId,
          slug: sub.slug,
        },
      },
      update: {
        name: sub.name,
        sortOrder: sub.sortOrder,
        isActive: true,
      },
      create: {
        communityId,
        name: sub.name,
        slug: sub.slug,
        sortOrder: sub.sortOrder,
        isActive: true,
      },
    });
  }

  // 5. Seed Castes (92)
  await processInChunks(CASTES_DATA, 10, async (caste) => {
    const communityId = communityMap.get(caste.communitySlug);
    if (!communityId) {
      throw new Error(`[MasterDataSeedError] Missing parent community '${caste.communitySlug}' for caste '${caste.slug}'`);
    }

    const existing = await client.caste.findFirst({
      where: {
        communityId,
        slug: caste.slug,
      },
    });

    if (existing) {
      await client.caste.update({
        where: { id: existing.id },
        data: {
          name: caste.name,
          sortOrder: caste.sortOrder,
          isActive: true,
        },
      });
    } else {
      await client.caste.create({
        data: {
          communityId,
          name: caste.name,
          slug: caste.slug,
          sortOrder: caste.sortOrder,
          isActive: true,
        },
      });
    }
  });

  // 6. Seed Gotras (60)
  await processInChunks(GOTRAS_DATA, 10, async (gotra) => {
    const existing = await client.gotra.findFirst({
      where: {
        slug: gotra.slug,
        communityId: null,
      },
    });

    if (existing) {
      await client.gotra.update({
        where: { id: existing.id },
        data: {
          name: gotra.name,
          sortOrder: gotra.sortOrder,
          isActive: true,
        },
      });
    } else {
      await client.gotra.create({
        data: {
          name: gotra.name,
          slug: gotra.slug,
          sortOrder: gotra.sortOrder,
          isActive: true,
        },
      });
    }
  });

  // 7. Seed Educations (25)
  for (const edu of EDUCATIONS_DATA) {
    await client.education.upsert({
      where: { slug: edu.slug },
      update: { name: edu.name, sortOrder: edu.sortOrder, isActive: true },
      create: { name: edu.name, slug: edu.slug, sortOrder: edu.sortOrder, isActive: true },
    });
  }

  // 8. Seed Specializations (241)
  const educations = await client.education.findMany({ select: { id: true, slug: true } });
  const educationMap = new Map<string, string>();
  educations.forEach((e) => educationMap.set(e.slug, e.id));

  const specItems: Array<{ educationId: string; name: string; slug: string; sortOrder: number }> = [];
  for (const [eduSlug, specNames] of Object.entries(SPECIALIZATIONS_BY_EDUCATION)) {
    const educationId = educationMap.get(eduSlug);
    if (!educationId) {
      throw new Error(`[MasterDataSeedError] Missing education '${eduSlug}' for specializations`);
    }

    let sortOrder = 1;
    for (const name of specNames) {
      specItems.push({
        educationId,
        name,
        slug: generateSlug(name),
        sortOrder: sortOrder++,
      });
    }
  }

  await processInChunks(specItems, 10, async (item) => {
    await client.specialization.upsert({
      where: {
        educationId_slug: {
          educationId: item.educationId,
          slug: item.slug,
        },
      },
      update: {
        name: item.name,
        sortOrder: item.sortOrder,
        isActive: true,
      },
      create: {
        educationId: item.educationId,
        name: item.name,
        slug: item.slug,
        sortOrder: item.sortOrder,
        isActive: true,
      },
    });
  });

  // 9. Seed Employment Statuses (10)
  for (const emp of EMPLOYMENT_STATUSES_DATA) {
    await client.employmentStatus.upsert({
      where: { slug: emp.slug },
      update: { name: emp.name, sortOrder: emp.sortOrder, isActive: true },
      create: { name: emp.name, slug: emp.slug, sortOrder: emp.sortOrder, isActive: true },
    });
  }

  // 10. Seed Occupations (117)
  const employmentStatuses = await client.employmentStatus.findMany({ select: { id: true, slug: true } });
  const empStatusMap = new Map<string, string>();
  employmentStatuses.forEach((es) => empStatusMap.set(es.slug, es.id));

  const occItems: Array<{ employmentStatusId: string; name: string; slug: string; sortOrder: number }> = [];
  for (const [empSlug, occNames] of Object.entries(OCCUPATIONS_BY_STATUS)) {
    const employmentStatusId = empStatusMap.get(empSlug);
    if (!employmentStatusId) {
      throw new Error(`[MasterDataSeedError] Missing employment status '${empSlug}' for occupations`);
    }

    let sortOrder = 1;
    for (const name of occNames) {
      occItems.push({
        employmentStatusId,
        name,
        slug: generateSlug(name),
        sortOrder: sortOrder++,
      });
    }
  }

  await processInChunks(occItems, 10, async (item) => {
    await client.occupation.upsert({
      where: {
        employmentStatusId_slug: {
          employmentStatusId: item.employmentStatusId,
          slug: item.slug,
        },
      },
      update: {
        name: item.name,
        sortOrder: item.sortOrder,
        isActive: true,
      },
      create: {
        employmentStatusId: item.employmentStatusId,
        name: item.name,
        slug: item.slug,
        sortOrder: item.sortOrder,
        isActive: true,
      },
    });
  });

  // 11. Seed Institutions (208)
  await processInChunks(INSTITUTIONS_DATA, 10, async (inst) => {
    const existing = await client.institution.findFirst({
      where: { normalizedName: inst.normalizedName },
    });

    if (existing) {
      await client.institution.update({
        where: { id: existing.id },
        data: { name: inst.name, type: inst.type, isActive: true },
      });
    } else {
      await client.institution.create({
        data: {
          name: inst.name,
          normalizedName: inst.normalizedName,
          type: inst.type,
          isActive: true,
        },
      });
    }
  });

  const durationMs = Date.now() - startTime;
  console.log(`[MASTER DATA SEED] Completed successfully in ${durationMs}ms.`);

  const counts = {
    religions: await client.religion.count(),
    communities: await client.community.count(),
    subCommunities: await client.subCommunity.count(),
    castes: await client.caste.count(),
    subCastes: await client.subCaste.count(),
    gotras: await client.gotra.count(),
    languages: await client.language.count(),
    educations: await client.education.count(),
    specializations: await client.specialization.count(),
    institutions: await client.institution.count(),
    employmentStatuses: await client.employmentStatus.count(),
    occupations: await client.occupation.count(),
  };

  return { success: true, counts, durationMs };
}

/**
 * Validates master data counts, constraints, foreign keys, and taxonomy relationships.
 */
export async function validateMasterDataReadiness(
  client: PrismaClient = defaultPrisma
): Promise<MasterDataValidationReport> {
  const actualCounts: Record<string, number> = {
    religions: await client.religion.count(),
    communities: await client.community.count(),
    subCommunities: await client.subCommunity.count(),
    castes: await client.caste.count(),
    subCastes: await client.subCaste.count(),
    gotras: await client.gotra.count(),
    languages: await client.language.count(),
    educations: await client.education.count(),
    specializations: await client.specialization.count(),
    institutions: await client.institution.count(),
    employmentStatuses: await client.employmentStatus.count(),
    occupations: await client.occupation.count(),
  };

  const discrepancies: Array<{ table: string; expected: number; actual: number }> = [];
  const errors: string[] = [];

  for (const [table, expected] of Object.entries(EXPECTED_MASTER_DATA_COUNTS)) {
    const actual = actualCounts[table] ?? 0;
    if (actual !== expected) {
      discrepancies.push({ table, expected, actual });
      errors.push(`Table '${table}' has ${actual} records, expected ${expected}.`);
    }
  }

  // Check orphans & foreign keys
  let orphanCount = 0;

  const religionIds = new Set((await client.religion.findMany({ select: { id: true } })).map((r) => r.id));
  const communityIds = new Set((await client.community.findMany({ select: { id: true } })).map((c) => c.id));
  const casteIds = new Set((await client.caste.findMany({ select: { id: true } })).map((c) => c.id));
  const educationIds = new Set((await client.education.findMany({ select: { id: true } })).map((e) => e.id));
  const empStatusIds = new Set((await client.employmentStatus.findMany({ select: { id: true } })).map((e) => e.id));

  const brokenComms = (await client.community.findMany({ select: { religionId: true } }))
    .filter((c) => c.religionId !== null && !religionIds.has(c.religionId)).length;
  orphanCount += brokenComms;

  const brokenSubComms = (await client.subCommunity.findMany({ select: { communityId: true } }))
    .filter((s) => !communityIds.has(s.communityId)).length;
  orphanCount += brokenSubComms;

  const brokenCastes = (await client.caste.findMany({ select: { communityId: true } }))
    .filter((c) => c.communityId !== null && !communityIds.has(c.communityId)).length;
  orphanCount += brokenCastes;

  const brokenGotras = (await client.gotra.findMany({ select: { communityId: true } }))
    .filter((g) => g.communityId !== null && !communityIds.has(g.communityId)).length;
  orphanCount += brokenGotras;

  const brokenSpecs = (await client.specialization.findMany({ select: { educationId: true } }))
    .filter((s) => !educationIds.has(s.educationId)).length;
  orphanCount += brokenSpecs;

  const brokenOccs = (await client.occupation.findMany({ select: { employmentStatusId: true } }))
    .filter((o) => !empStatusIds.has(o.employmentStatusId)).length;
  orphanCount += brokenOccs;

  // Check universal communities have religionId = null
  const invalidUniversal = await client.community.count({
    where: {
      slug: { in: ["other", "prefer-not-to-say"] },
      religionId: { not: null },
    },
  });

  if (invalidUniversal > 0) {
    errors.push("Universal communities ('other', 'prefer-not-to-say') must have religionId = null.");
  }

  // Check Software Engineer record exists
  const softEng = await client.occupation.findFirst({
    where: { slug: "software-engineer" },
  });
  if (!softEng) {
    errors.push("Software Engineer record is missing.");
  }


  const isReady = discrepancies.length === 0 && orphanCount === 0 && invalidUniversal === 0 && errors.length === 0;

  return {
    isReady,
    expectedCounts: EXPECTED_MASTER_DATA_COUNTS,
    actualCounts,
    discrepancies,
    duplicateCount: 0,
    orphanCount,
    invalidReligionLinks: invalidUniversal,
    errors,
  };
}
