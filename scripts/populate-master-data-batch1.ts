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

async function main() {
  console.log("==================================================");
  console.log("MANGALAM MATRIMONY — MASTER DATA BATCH 1 POPULATION");
  console.log("EXECUTION MODE: DATABASE MUTATION (TRANSACTIONAL)");
  console.log("==================================================");

  // 1. Fetch Authoritative Religions from DB
  const religions = await prisma.religion.findMany();
  const relMap = new Map<string, string>(); // slug -> id
  religions.forEach((r) => relMap.set(r.slug, r.id));

  const hinduRelId = relMap.get("hindu");
  const muslimRelId = relMap.get("muslim");
  const christianRelId = relMap.get("christian");
  const sikhRelId = relMap.get("sikh");
  const jainRelId = relMap.get("jain");
  const buddhistRelId = relMap.get("buddhist");
  const parsiRelId = relMap.get("parsi");

  if (!hinduRelId || !muslimRelId || !christianRelId || !sikhRelId || !jainRelId || !buddhistRelId || !parsiRelId) {
    throw new Error("Missing essential core religions in database!");
  }

  // Load Batch 1.2 Final Validation Report
  const reportPath = path.join(__dirname, "../master-data/reports/batch-1.2-final-semantic-validation.json");
  if (!fs.existsSync(reportPath)) {
    throw new Error("Batch 1.2 report not found at " + reportPath);
  }
  const report = JSON.parse(fs.readFileSync(reportPath, "utf-8"));

  // Transactional Execution
  await prisma.$transaction(
    async (tx) => {
      console.log("\n[STEP 1] Remediating 3 development/test profiles with cross-religion mismatches...");
      const mismatchedProfileIds = [
        "2582cc84-7355-4737-84dc-e04b3c11af5c",
        "f4efeee9-6e89-4045-aa93-0ebec568dc47",
        "1d8af08a-1aa9-4e1a-9f43-642d3dfdcbca",
      ];

      const updateMismatchResult = await tx.profileReligion.updateMany({
        where: {
          profileId: { in: mismatchedProfileIds },
        },
        data: {
          communityId: null,
          customCommunity: "Remediated from invalid pre-link test assignment",
        },
      });
      console.log(`[STEP 1] Cleared invalid communityId on ${updateMismatchResult.count} test profiles.`);

      // Verify no remaining cross-religion mismatches
      const remainingProfiles = await tx.profileReligion.findMany({
        where: { communityId: { not: null } },
        include: { community: true, religion: true },
      });
      for (const p of remainingProfiles) {
        if (p.community && p.religion) {
          // Brahmin/Maratha are currently null, but will become Hindu
          if (p.community.slug === "brahmin" && p.religion.slug !== "hindu") {
            throw new Error(`Profile ${p.profileId} still has non-Hindu Brahmin assignment!`);
          }
          if (p.community.slug === "maratha" && p.religion.slug !== "hindu") {
            throw new Error(`Profile ${p.profileId} still has non-Hindu Maratha assignment!`);
          }
        }
      }
      console.log("[STEP 1 PASS] All active profile community assignments verified safe for remapping.");

      console.log("\n[STEP 2] Linking existing valid 18 communities to Religion 'Hindu'...");
      const linkExistingResult = await tx.community.updateMany({
        where: {
          slug: { notIn: ["other", "prefer-not-to-say"] },
        },
        data: {
          religionId: hinduRelId,
        },
      });
      console.log(`[STEP 2] Linked ${linkExistingResult.count} existing communities to Hindu religion.`);

      // Confirm 'other' and 'prefer-not-to-say' remain universal null
      const universalComms = await tx.community.findMany({
        where: { slug: { in: ["other", "prefer-not-to-say"] } },
      });
      for (const u of universalComms) {
        if (u.religionId !== null) {
          throw new Error(`Universal community '${u.slug}' must have religionId: null!`);
        }
      }
      console.log("[STEP 2 PASS] Universal communities ('other', 'prefer-not-to-say') confirmed with religionId = null.");

      console.log("\n[STEP 3] Importing new Community records from Batch 1 validated dataset...");

      // Essential umbrella communities needed as parents for sub-communities
      const umbrellaCommunities = [
        { name: "Shia", slug: "shia", religionId: muslimRelId, sortOrder: 10 },
        { name: "Sunni", slug: "sunni", religionId: muslimRelId, sortOrder: 11 },
        { name: "Digambar", slug: "digambar", religionId: jainRelId, sortOrder: 10 },
        { name: "Shwetambar", slug: "shwetambar", religionId: jainRelId, sortOrder: 11 },
      ];

      for (const uc of umbrellaCommunities) {
        await tx.community.upsert({
          where: { slug: uc.slug },
          update: {
            name: uc.name,
            religionId: uc.religionId,
            isActive: true,
          },
          create: {
            name: uc.name,
            slug: uc.slug,
            religionId: uc.religionId,
            isActive: true,
            sortOrder: uc.sortOrder,
          },
        });
      }
      console.log(`[STEP 3] Upserted ${umbrellaCommunities.length} umbrella parent communities (Shia, Sunni, Digambar, Shwetambar).`);

      // Extract all unique Community candidates from Batch 1.2 report
      const candidateRecords = report.allSourceRecords.filter(
        (r: any) =>
          r.targetTable === "Community" &&
          (r.classification === "HIGH_CONFIDENCE_COMMUNITY" || r.classification === "MEDIUM_CONFIDENCE_COMMUNITY")
      );

      // Deduplicate by proposedSlug
      const uniqueCandidates = new Map<string, any>();
      for (const cr of candidateRecords) {
        if (!uniqueCandidates.has(cr.proposedSlug)) {
          uniqueCandidates.set(cr.proposedSlug, cr);
        }
      }

      console.log(`[STEP 3] Found ${uniqueCandidates.size} unique community candidates to upsert.`);

      let newCommunitiesInserted = 0;
      let existingCommunitiesUpdated = 0;

      for (const [slug, item] of uniqueCandidates.entries()) {
        let relId: string | null = null;
        switch (item.targetReligion) {
          case "Hindu":
            relId = hinduRelId;
            break;
          case "Muslim":
            relId = muslimRelId;
            break;
          case "Christian":
            relId = christianRelId;
            break;
          case "Sikh":
            relId = sikhRelId;
            break;
          case "Jain":
            relId = jainRelId;
            break;
          case "Buddhist":
            relId = buddhistRelId;
            break;
          case "Parsi":
            relId = parsiRelId;
            break;
          default:
            relId = null;
        }

        const existing = await tx.community.findUnique({ where: { slug } });
        if (existing) {
          await tx.community.update({
            where: { slug },
            data: {
              name: item.normalizedName,
              religionId: relId,
              isActive: true,
            },
          });
          existingCommunitiesUpdated++;
        } else {
          await tx.community.create({
            data: {
              name: item.normalizedName,
              slug,
              religionId: relId,
              isActive: true,
              sortOrder: 100,
            },
          });
          newCommunitiesInserted++;
        }
      }

      console.log(`[STEP 3 PASS] Community upsert complete: ${newCommunitiesInserted} created, ${existingCommunitiesUpdated} updated.`);

      console.log("\n[STEP 4] Importing approved SubCommunity records where applicable...");
      // Map parent communities
      const shiaCom = await tx.community.findUnique({ where: { slug: "shia" } });
      const sunniCom = await tx.community.findUnique({ where: { slug: "sunni" } });
      const knanayaCom = await tx.community.findUnique({ where: { slug: "knanaya" } });
      const digambarCom = await tx.community.findUnique({ where: { slug: "digambar" } });
      const shwetambarCom = await tx.community.findUnique({ where: { slug: "shwetambar" } });

      if (!shiaCom || !sunniCom || !knanayaCom || !digambarCom || !shwetambarCom) {
        throw new Error("Missing one or more required parent communities for sub-community insertion!");
      }

      const subCommunityDefinitions = [
        // Shia Sub-sects
        { communityId: shiaCom.id, name: "Shia Isma'ilis (Seveners)", slug: "shia-ismailis-seveners" },
        { communityId: shiaCom.id, name: "Shia Ithna Asharis (Twelvers)", slug: "shia-ithna-asharis-twelvers" },
        { communityId: shiaCom.id, name: "Shia Zaidis (Fivers)", slug: "shia-zaidis-fivers" },

        // Sunni Madhhabs
        { communityId: sunniCom.id, name: "Sunni Hanabali", slug: "sunni-hanabali" },
        { communityId: sunniCom.id, name: "Sunni Hanafi", slug: "sunni-hanafi" },
        { communityId: sunniCom.id, name: "Sunni Maliki", slug: "sunni-maliki" },
        { communityId: sunniCom.id, name: "Sunni Shafii", slug: "sunni-shafii" },

        // Knanaya Sub-branches
        { communityId: knanayaCom.id, name: "Knanaya Catholic", slug: "knanaya-catholic" },
        { communityId: knanayaCom.id, name: "Knanaya Jacobite", slug: "knanaya-jacobite" },

        // Digambar Panths
        { communityId: digambarCom.id, name: "Bisapanthi", slug: "bisapanthi" },
        { communityId: digambarCom.id, name: "Gumanapanthi", slug: "gumanapanthi" },
        { communityId: digambarCom.id, name: "Taranapanthi", slug: "taranapanthi" },
        { communityId: digambarCom.id, name: "Terapanthi", slug: "terapanthi-digambar" },
        { communityId: digambarCom.id, name: "Totapanthi", slug: "totapanthi" },

        // Shwetambar Gacchas / Traditions
        { communityId: shwetambarCom.id, name: "Murtipujaka", slug: "murtipujaka" },
        { communityId: shwetambarCom.id, name: "Sthanakvasi", slug: "sthanakvasi" },
        { communityId: shwetambarCom.id, name: "Terapanthi", slug: "terapanthi-shwetambar" },
      ];

      let subCommunitiesInserted = 0;
      for (const sc of subCommunityDefinitions) {
        await tx.subCommunity.upsert({
          where: {
            communityId_slug: {
              communityId: sc.communityId,
              slug: sc.slug,
            },
          },
          update: {
            name: sc.name,
            isActive: true,
          },
          create: {
            communityId: sc.communityId,
            name: sc.name,
            slug: sc.slug,
            isActive: true,
            sortOrder: 10,
          },
        });
        subCommunitiesInserted++;
      }

      console.log(`[STEP 4 PASS] SubCommunity upsert complete: ${subCommunitiesInserted} sub-communities created/verified.`);
    },
    {
      timeout: 60000,
    }
  );

  console.log("\n==================================================");
  console.log("TRANSACTION COMMITTED SUCCESSFULLY!");
  console.log("==================================================");
}

main()
  .catch((err) => {
    console.error("FATAL ERROR DURING POPULATION:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
