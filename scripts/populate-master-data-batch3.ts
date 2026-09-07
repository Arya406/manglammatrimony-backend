import { PrismaClient } from "@prisma/client";
import * as fs from "fs";
import * as path from "path";

const prisma = new PrismaClient();

function generateSlug(str: string): string {
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

interface GotraSeedItem {
  name: string;
  slug: string;
  category: "FOUNDATIONAL" | "DERIVATIVE";
  sortOrder: number;
}

export async function populateBatch3() {
  console.log("==================================================");
  console.log("MANGALAM MATRIMONY — MASTER DATA BATCH 3 POPULATION");
  console.log("EXECUTION: GOTRA MASTER DATA (TRANSACTIONAL)");
  console.log("==================================================");

  // 1. Pre-population verification
  const gotraCountBefore = await prisma.gotra.count();
  const profileCountBefore = await prisma.profileReligion.count();
  console.log(`\n[PRE-CHECK] Gotra count before: ${gotraCountBefore}`);
  console.log(`[PRE-CHECK] ProfileReligion count before: ${profileCountBefore}`);

  // 2. Load Source File
  const sourcePath = path.join(__dirname, "../master-data/source/hindu_gotra_reference_list.json");
  if (!fs.existsSync(sourcePath)) {
    throw new Error(`Source file not found at: ${sourcePath}`);
  }

  const sourceContent = JSON.parse(fs.readFileSync(sourcePath, "utf-8"));
  const foundational: string[] = sourceContent.foundational_gotras || [];
  const derivative: string[] = sourceContent.commonly_used_derivative_gotras || [];

  console.log(`[SOURCE] Loaded ${foundational.length} foundational gotras`);
  console.log(`[SOURCE] Loaded ${derivative.length} derivative gotras`);
  console.log(`[SOURCE] Total source items: ${foundational.length + derivative.length}`);

  const itemsToPopulate: GotraSeedItem[] = [];
  let sortOrderCounter = 1;

  for (const name of foundational) {
    itemsToPopulate.push({
      name: name.trim(),
      slug: generateSlug(name.trim()),
      category: "FOUNDATIONAL",
      sortOrder: sortOrderCounter++,
    });
  }

  for (const name of derivative) {
    itemsToPopulate.push({
      name: name.trim(),
      slug: generateSlug(name.trim()),
      category: "DERIVATIVE",
      sortOrder: sortOrderCounter++,
    });
  }

  // Verify Slug Uniqueness in seed dataset
  const slugSet = new Set<string>();
  for (const item of itemsToPopulate) {
    if (slugSet.has(item.slug)) {
      throw new Error(`Duplicate slug detected in source dataset: ${item.slug}`);
    }
    slugSet.add(item.slug);
  }
  console.log(`[VALIDATION PASS] Verified all ${itemsToPopulate.length} slugs are deterministic and unique.`);

  // 3. Transactional Population (Idempotent)
  let addedCount = 0;
  let updatedCount = 0;

  await prisma.$transaction(async (tx) => {
    for (const item of itemsToPopulate) {
      const existing = await tx.gotra.findFirst({
        where: { slug: item.slug },
      });

      if (existing) {
        await tx.gotra.update({
          where: { id: existing.id },
          data: {
            name: item.name,
            sortOrder: item.sortOrder,
            isActive: true,
            communityId: null, // Globally selectable across Hindu communities
          },
        });
        updatedCount++;
      } else {
        await tx.gotra.create({
          data: {
            name: item.name,
            slug: item.slug,
            sortOrder: item.sortOrder,
            isActive: true,
            communityId: null, // Globally selectable across Hindu communities
          },
        });
        addedCount++;
      }
    }
  });

  console.log(`\n[POPULATION RESULT] Added: ${addedCount}, Updated: ${updatedCount}`);

  // 4. Post-Population Verifications
  const gotraCountAfter = await prisma.gotra.count();
  const profileCountAfter = await prisma.profileReligion.count();
  console.log(`[POST-CHECK] Gotra count after: ${gotraCountAfter}`);
  console.log(`[POST-CHECK] ProfileReligion count after: ${profileCountAfter}`);

  if (profileCountBefore !== profileCountAfter) {
    throw new Error("CRITICAL SAFETY VIOLATION: Existing ProfileReligion records were mutated!");
  }

  // FK Integrity Check: ensure any gotra with communityId references a valid community
  const gotrasWithCommunity = await prisma.gotra.findMany({
    where: { communityId: { not: null } },
    select: { id: true, name: true, communityId: true },
  });
  console.log(`[FK INTEGRITY] Gotras with non-null communityId: ${gotrasWithCommunity.length}`);
  for (const g of gotrasWithCommunity) {
    const com = await prisma.community.findUnique({ where: { id: g.communityId! } });
    if (!com) {
      throw new Error(`CRITICAL: Gotra '${g.name}' references non-existent communityId '${g.communityId}'`);
    }
  }
  console.log("[FK INTEGRITY PASS] Foreign key integrity confirmed.");

  // Check duplicate slugs in database
  const allDbGotras = await prisma.gotra.findMany({
    select: { id: true, name: true, slug: true },
  });
  const dbSlugs = new Set<string>();
  for (const g of allDbGotras) {
    if (dbSlugs.has(g.slug)) {
      throw new Error(`CRITICAL: Duplicate slug found in database: '${g.slug}'`);
    }
    dbSlugs.add(g.slug);
  }
  console.log(`[DEDUPLICATION PASS] All ${allDbGotras.length} gotras in DB have unique slugs.`);

  return {
    gotraCountBefore,
    gotraCountAfter,
    addedCount,
    updatedCount,
  };
}

async function main() {
  try {
    const result = await populateBatch3();
    console.log("\n==================================================");
    console.log("BATCH 3 EXECUTION COMPLETED SUCCESSFULLY");
    console.log(`Total Gotras in DB: ${result.gotraCountAfter}`);
    console.log("==================================================");
  } catch (error) {
    console.error("\n[BATCH 3 EXECUTION FAILED]:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main();
}
