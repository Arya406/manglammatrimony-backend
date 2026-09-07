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

type ClassificationType =
  | "EXISTING_MATCH"
  | "NEW_COMMUNITY_CANDIDATE"
  | "ALIAS"
  | "DEFERRED_TO_SUBCOMMUNITY"
  | "DEFERRED_TO_CASTE"
  | "DEFERRED_TO_SUBCASTE"
  | "REJECTED"
  | "HANDLED_BY_EXISTING_FLEXIBLE_VALUE";

type TargetTableType = "Community" | "SubCommunity" | "Caste" | "SubCaste" | "REJECT";
type ConfidenceType = "HIGH" | "MEDIUM" | "LOW";

function normalizeString(str: string): string {
  if (!str) return "";
  return str
    .normalize("NFC")
    .replace(/\s+/g, " ")
    .trim();
}

function generateSlug(str: string): string {
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function runBatch1_1() {
  console.log("==================================================");
  console.log("MASTER DATA BATCH 1.1 — CLASSIFICATION & SAFETY PASS");
  console.log("==================================================");

  // 1. Fetch DB
  const dbReligions = await prisma.religion.findMany({ orderBy: { sortOrder: "asc" } });
  const dbCommunities = await prisma.community.findMany({
    include: { religion: true },
    orderBy: { sortOrder: "asc" },
  });

  const profilesWithRelCom = await prisma.profileReligion.findMany({
    select: {
      profileId: true,
      religionId: true,
      communityId: true,
      religion: { select: { name: true, slug: true } },
      community: { select: { name: true, slug: true } },
    },
  });

  console.log(`[DB] Fetched ${dbReligions.length} religions, ${dbCommunities.length} communities, and ${profilesWithRelCom.length} profile religion records.`);

  // Load Source
  const sourcePath = path.join(__dirname, "../master-data/source/religion_community_caste_master_data.json");
  const sourceData: SourceData = JSON.parse(fs.readFileSync(sourcePath, "utf-8"));

  const hinduRel = dbReligions.find((r) => r.slug === "hindu")!;
  const muslimRel = dbReligions.find((r) => r.slug === "muslim")!;
  const christianRel = dbReligions.find((r) => r.slug === "christian")!;
  const sikhRel = dbReligions.find((r) => r.slug === "sikh")!;
  const jainRel = dbReligions.find((r) => r.slug === "jain")!;
  const buddhistRel = dbReligions.find((r) => r.slug === "buddhist")!;
  const parsiRel = dbReligions.find((r) => r.slug === "parsi")!;
  const jewishRel = dbReligions.find((r) => r.slug === "jewish")!;

  // 2. CRITICAL PROFILE SAFETY CHECK ON EXISTING 20 COMMUNITIES
  interface ExistingCommunityAudit {
    id: string;
    name: string;
    slug: string;
    currentReligionId: string | null;
    currentReligion: string | null;
    proposedReligionId: string | null;
    proposedReligion: string | null;
    affectedProfileCount: number;
    profileSafetyVerified: boolean;
    mismatchCount: number;
    mismatchedProfiles: Array<{ profileId: string; profileReligionId: string; profileReligionName?: string }>;
    action: string;
    confidence: ConfidenceType;
    reason: string;
  }

  const existingCommunityAuditList: ExistingCommunityAudit[] = [];

  for (const c of dbCommunities) {
    const referencingProfiles = profilesWithRelCom.filter((p) => p.communityId === c.id);
    let proposedRelId: string | null = null;
    let proposedRelName: string | null = null;
    let conf: ConfidenceType = "HIGH";
    let action = "";
    let reason = "";

    if (c.slug === "other" || c.slug === "prefer-not-to-say") {
      proposedRelId = null;
      proposedRelName = "Universal (Cross-Religion)";
      action = "RETAIN_RELIGION_ID_NULL";
      reason = "Universal fallback / opt-out selector accessible across all religions.";
    } else {
      proposedRelId = hinduRel.id;
      proposedRelName = hinduRel.name;
      action = "LINK_TO_HINDU_RELIGION";
      reason = "Traditional Indian cultural community established in initial platform Hindu dataset.";
    }

    // Verify all profiles referencing this community
    const mismatches: Array<{ profileId: string; profileReligionId: string; profileReligionName?: string }> = [];
    for (const prof of referencingProfiles) {
      if (proposedRelId !== null && prof.religionId !== proposedRelId) {
        mismatches.push({
          profileId: prof.profileId,
          profileReligionId: prof.religionId || "NULL",
          profileReligionName: prof.religion?.name || "None",
        });
      }
    }

    existingCommunityAuditList.push({
      id: c.id,
      name: c.name,
      slug: c.slug,
      currentReligionId: c.religionId,
      currentReligion: c.religion?.name || null,
      proposedReligionId: proposedRelId,
      proposedReligion: proposedRelName,
      affectedProfileCount: referencingProfiles.length,
      profileSafetyVerified: mismatches.length === 0,
      mismatchCount: mismatches.length,
      mismatchedProfiles: mismatches,
      action,
      confidence: conf,
      reason,
    });
  }

  // 3. CLASSIFICATION PASS FOR ALL 637 SOURCE CANDIDATES
  interface CandidateAuditItem {
    recordIndex: number;
    sourceReligion: string;
    sourceValue: string;
    normalizedName: string;
    existingMatch: string | null;
    existingId: string | null;
    proposedTargetTable: TargetTableType;
    proposedParent: string;
    proposedParentId: string | null;
    proposedSlug: string;
    confidence: ConfidenceType;
    classification: ClassificationType;
    normalizationType: string;
    reason: string;
    slugCollision: boolean;
    isCrossReligion: boolean;
  }

  const candidateAuditList: CandidateAuditItem[] = [];
  let recordCounter = 0;

  // Track canonical primary communities registered in Batch 1 to identify ALIAS/DUPLICATES
  // Key: `<TargetReligion>:<CleanName>`
  const primaryCommunityMap = new Map<string, { slug: string; recordIndex: number; sourceReligion: string }>();

  // Global slug map to detect collisions across all proposed community records
  const globalSlugMap = new Map<string, { recordIndex: number; name: string; religion: string }>();

  // Register existing 20 DB communities in global slug map
  for (const c of dbCommunities) {
    globalSlugMap.set(c.slug, { recordIndex: -1, name: c.name, religion: c.religion?.name || "Existing DB" });
  }

  // Set of names that exist legitimately across multiple religious traditions
  const crossReligionBaseNames = new Set([
    "jat",
    "rajput",
    "agarwal",
    "khatri",
    "arora",
    "bhatia",
    "ghumar",
    "kamboj",
    "kshatriya",
    "lubana",
    "majabi",
    "nai",
    "ramdasia",
    "saini",
    "ravidasia",
    "tonk kshatriya",
    "bania",
    "vaishya",
    "jaiswal",
    "khandelwal",
    "kutchi",
    "oswal",
    "porwal",
    "irani",
    "parsi",
  ]);

  for (const sr of sourceData.religions) {
    const sRelName = sr.name;

    for (const opt of sr.options) {
      recordCounter++;
      const norm = normalizeString(opt);
      const lower = norm.toLowerCase();

      let proposedTargetTable: TargetTableType = "Community";
      let proposedParent = "";
      let proposedParentId: string | null = null;
      let classification: ClassificationType = "NEW_COMMUNITY_CANDIDATE";
      let confidence: ConfidenceType = "HIGH";
      let reason = "";
      let normalizationType = "EXACT";
      let existingMatch: string | null = null;
      let existingId: string | null = null;
      let cleanDisplayName = norm;
      let isCrossReligion = false;

      // 1. Check Generic / Non-community tokens
      if (
        lower === "others" ||
        lower === "other" ||
        lower === "muslim - unspecified" ||
        lower === "christian - unspecified" ||
        lower === "sikh - unspecified" ||
        lower === "jain - unspecified" ||
        lower === "unspecified"
      ) {
        candidateAuditList.push({
          recordIndex: recordCounter,
          sourceReligion: sRelName,
          sourceValue: opt,
          normalizedName: norm,
          existingMatch: "Other / Prefer not to say",
          existingId: null,
          proposedTargetTable: "REJECT",
          proposedParent: "Universal / None",
          proposedParentId: null,
          proposedSlug: `none-generic-${recordCounter}`,
          confidence: "HIGH",
          classification: "HANDLED_BY_EXISTING_FLEXIBLE_VALUE",
          normalizationType: "GENERIC_TOKEN",
          reason: "Generic placeholder handled natively by existing flexible architecture ('Other' / 'Prefer not to say' / custom text).",
          slugCollision: false,
          isCrossReligion: false,
        });
        continue;
      }

      if (lower === "intercaste" || lower === "sikh - intercaste" || lower === "jain - intercaste") {
        candidateAuditList.push({
          recordIndex: recordCounter,
          sourceReligion: sRelName,
          sourceValue: opt,
          normalizedName: norm,
          existingMatch: null,
          existingId: null,
          proposedTargetTable: "REJECT",
          proposedParent: "None",
          proposedParentId: null,
          proposedSlug: `none-intercaste-${recordCounter}`,
          confidence: "HIGH",
          classification: "REJECTED",
          normalizationType: "PREFERENCE_CONDITION",
          reason: "Marital preference condition, not a socio-cultural community.",
          slugCollision: false,
          isCrossReligion: false,
        });
        continue;
      }

      if (lower === "sikh - no bar" || lower === "jain - no bar" || lower === "no bar") {
        candidateAuditList.push({
          recordIndex: recordCounter,
          sourceReligion: sRelName,
          sourceValue: opt,
          normalizedName: norm,
          existingMatch: null,
          existingId: null,
          proposedTargetTable: "REJECT",
          proposedParent: "None",
          proposedParentId: null,
          proposedSlug: `none-nobar-${recordCounter}`,
          confidence: "HIGH",
          classification: "REJECTED",
          normalizationType: "PREFERENCE_CONDITION",
          reason: "Partner preference filter ('Caste No Bar'), not a socio-cultural community.",
          slugCollision: false,
          isCrossReligion: false,
        });
        continue;
      }

      if (lower === "sc" || lower === "st") {
        candidateAuditList.push({
          recordIndex: recordCounter,
          sourceReligion: sRelName,
          sourceValue: opt,
          normalizedName: norm,
          existingMatch: null,
          existingId: null,
          proposedTargetTable: "REJECT",
          proposedParent: "None",
          proposedParentId: null,
          proposedSlug: `none-legal-${recordCounter}`,
          confidence: "HIGH",
          classification: "REJECTED",
          normalizationType: "CONSTITUTIONAL_CATEGORY",
          reason: "Broad constitutional administrative category, not an individual matrimonial community.",
          slugCollision: false,
          isCrossReligion: false,
        });
        continue;
      }

      // 2. Exact match against existing 20 DB communities (under Hindu)
      const exactDbCom = dbCommunities.find(
        (c) => c.name.toLowerCase() === norm.toLowerCase() || c.slug.toLowerCase() === generateSlug(norm)
      );

      if (exactDbCom && sRelName === "Hindu") {
        candidateAuditList.push({
          recordIndex: recordCounter,
          sourceReligion: sRelName,
          sourceValue: opt,
          normalizedName: exactDbCom.name,
          existingMatch: exactDbCom.name,
          existingId: exactDbCom.id,
          proposedTargetTable: "Community",
          proposedParent: "Hindu",
          proposedParentId: hinduRel.id,
          proposedSlug: exactDbCom.slug,
          confidence: "HIGH",
          classification: "EXISTING_MATCH",
          normalizationType: "EXACT_EXISTING_DB_MATCH",
          reason: `Direct 1:1 match with existing database community '${exactDbCom.name}' (slug: '${exactDbCom.slug}').`,
          slugCollision: false,
          isCrossReligion: false,
        });
        // Register in primary map so duplicates know
        primaryCommunityMap.set(`Hindu:${exactDbCom.name.toLowerCase()}`, { slug: exactDbCom.slug, recordIndex: recordCounter, sourceReligion: sRelName });
        continue;
      }

      // 3. HINDU RELIGION
      if (sRelName === "Hindu") {
        proposedParent = "Hindu";
        proposedParentId = hinduRel.id;

        // Check Brahmin subdivisions -> DEFERRED_TO_CASTE
        if (norm.startsWith("Brahmin -") || norm.endsWith(" Brahmin") || norm === "Devrukhe Brahmin" || norm === "Malviya Brahmin" || norm === "Jangra - Brahmin") {
          cleanDisplayName = norm.replace(/^Brahmin\s*-\s*/i, "").replace(/\s*-\s*Brahmin$/i, "").replace(/\s+Brahmin$/i, "").trim();
          proposedTargetTable = "Caste";
          proposedParent = "Brahmin (Community)";
          classification = "DEFERRED_TO_CASTE";
          confidence = "HIGH";
          normalizationType = "STRIP_COMPOUND_PREFIX";
          reason = `Brahmin sub-caste/lineage ('${norm}'). Under existing hierarchy, parent is Community 'Brahmin'. Defer to Batch 2.`;
        }
        // Check Sindhi subdivisions -> DEFERRED_TO_CASTE
        else if (norm.startsWith("Sindhi-") || (norm.startsWith("Sindhi -") && norm !== "Sindhi")) {
          cleanDisplayName = norm.replace(/^Sindhi\s*-\s*/i, "").replace(/^Sindhi-/i, "").trim();
          proposedTargetTable = "Caste";
          proposedParent = "Sindhi (Community)";
          classification = "DEFERRED_TO_CASTE";
          confidence = "HIGH";
          normalizationType = "STRIP_COMPOUND_PREFIX";
          reason = `Sindhi sub-caste/lineage ('${norm}'). Under existing hierarchy, parent is candidate Community 'Sindhi'. Defer to Batch 2.`;
        }
        // Check Baniya subdivisions -> DEFERRED_TO_CASTE
        else if (norm.startsWith("Baniya -") || norm.startsWith("Baniya-")) {
          cleanDisplayName = norm.replace(/^Baniya\s*-\s*/i, "").trim();
          proposedTargetTable = "Caste";
          proposedParent = "Baniya / Vaishya (Community)";
          classification = "DEFERRED_TO_CASTE";
          confidence = "HIGH";
          normalizationType = "STRIP_COMPOUND_PREFIX";
          reason = `Baniya sub-caste/lineage ('${norm}'). Under existing hierarchy, parent is Community 'Baniya / Vaishya'. Defer to Batch 2.`;
        }
        // Check Patel subdivisions -> DEFERRED_TO_CASTE
        else if (norm === "Kadava Patel" || norm === "Leva patel" || norm === "Leva patil" || norm === "Koli Patel") {
          proposedTargetTable = "Caste";
          proposedParent = norm.includes("Koli") ? "Koli (Community)" : "Patel (Community)";
          classification = "DEFERRED_TO_CASTE";
          confidence = "HIGH";
          normalizationType = "SUBDIVISION_EVALUATION";
          reason = `Subdivision of Patel/Koli community. Defer to Batch 2.`;
        }
        // Check Maratha subdivisions -> DEFERRED_TO_CASTE
        else if (norm === "Kokanastha Maratha") {
          proposedTargetTable = "Caste";
          proposedParent = "Maratha (Community)";
          classification = "DEFERRED_TO_CASTE";
          confidence = "HIGH";
          normalizationType = "SUBDIVISION_EVALUATION";
          reason = `Subdivision of Maratha community. Defer to Batch 2.`;
        }
        // Check Nair subdivisions -> DEFERRED_TO_CASTE
        else if (norm === "Veluthedathu Nair" || norm === "Vilakkithala Nair") {
          proposedTargetTable = "Caste";
          proposedParent = "Nair (Community)";
          classification = "DEFERRED_TO_CASTE";
          confidence = "HIGH";
          normalizationType = "SUBDIVISION_EVALUATION";
          reason = `Subdivision of Nair community. Defer to Batch 2.`;
        }
        // Duplicate source: "Brajastha Maithil"
        else if (norm === "Brajastha Maithil") {
          cleanDisplayName = "Brajastha Maithil";
          proposedTargetTable = "Caste";
          proposedParent = "Brahmin (Community)";
          classification = "DEFERRED_TO_CASTE";
          confidence = "HIGH";
          normalizationType = "DEDUPLICATED_SOURCE_VARIANT";
          reason = "Maithil Brahmin sub-caste variant repeated twice in source. Defer to Batch 2.";
        }
        // Slashes / Parentheticals
        else if (norm.includes("/") || norm.includes("(")) {
          normalizationType = norm.includes("/") ? "SLASH_SYNONYM" : "PARENTHETICAL_TITLE";
          classification = "NEW_COMMUNITY_CANDIDATE";
          confidence = "HIGH";
          reason = `Recognized Hindu cultural community with synonym/title qualifier in source.`;
        }
        // Broad Hindu Community candidate
        else {
          proposedTargetTable = "Community";
          classification = "NEW_COMMUNITY_CANDIDATE";
          confidence = "HIGH";
          reason = "Distinct Hindu socio-cultural community from source dataset.";
        }
      }

      // 4. MUSLIM / SHIA / SUNNI
      else if (sRelName.startsWith("Muslim")) {
        proposedParent = "Muslim";
        proposedParentId = muslimRel.id;

        cleanDisplayName = norm.replace(/^Muslim\s*-\s*/i, "").trim();
        normalizationType = norm.startsWith("Muslim -") ? "STRIP_RELIGION_PREFIX" : "EXACT";

        if (
          cleanDisplayName === "Shia Isma'ilis (Seveners)" ||
          cleanDisplayName === "Shia Ithna Asharis (Twelvers)" ||
          cleanDisplayName === "Shia Zaidis (Fivers)"
        ) {
          proposedTargetTable = "SubCommunity";
          proposedParent = "Shia (Community/Sect)";
          classification = "DEFERRED_TO_SUBCOMMUNITY";
          confidence = "HIGH";
          reason = `Theological branch of Shia Islam. Maps as SubCommunity under Community 'Shia'. Defer to Batch 2.`;
        } else if (
          cleanDisplayName.startsWith("Sunni Hanabali") ||
          cleanDisplayName.startsWith("Sunni Hanafi") ||
          cleanDisplayName.startsWith("Sunni Maliki") ||
          cleanDisplayName.startsWith("Sunni Shafii")
        ) {
          proposedTargetTable = "SubCommunity";
          proposedParent = "Sunni (Community/Sect)";
          classification = "DEFERRED_TO_SUBCOMMUNITY";
          confidence = "HIGH";
          reason = `Madhhab / school of jurisprudence of Sunni Islam. Maps as SubCommunity under Community 'Sunni'. Defer to Batch 2.`;
        } else {
          // Check if this community under Muslim was ALREADY registered from a previous Muslim section
          const existingPrimary = primaryCommunityMap.get(`Muslim:${cleanDisplayName.toLowerCase()}`);
          if (existingPrimary) {
            classification = "ALIAS";
            confidence = "HIGH";
            proposedTargetTable = "Community";
            reason = `Duplicate option in source repeated across '${sRelName}'. Preserves canonical candidate (Record #${existingPrimary.recordIndex}).`;
          } else {
            proposedTargetTable = "Community";
            classification = "NEW_COMMUNITY_CANDIDATE";
            confidence = "HIGH";
            reason = `Muslim socio-cultural community / biradari under parent Religion 'Muslim'.`;
          }

          if (crossReligionBaseNames.has(cleanDisplayName.toLowerCase())) {
            isCrossReligion = true;
          }
        }
      }

      // 5. CHRISTIAN
      else if (sRelName === "Christian") {
        proposedParent = "Christian";
        proposedParentId = christianRel.id;

        cleanDisplayName = norm.replace(/^Christian\s*-\s*/i, "").trim();
        normalizationType = norm.startsWith("Christian -") ? "STRIP_RELIGION_PREFIX" : "EXACT";

        if (cleanDisplayName === "Knanaya Catholic" || cleanDisplayName === "Knanaya Jacobite") {
          // Check if already registered
          const existingPrimary = primaryCommunityMap.get(`Christian:${cleanDisplayName.toLowerCase()}`);
          if (existingPrimary) {
            classification = "ALIAS";
            confidence = "HIGH";
            proposedTargetTable = "SubCommunity";
            proposedParent = "Knanaya (Community)";
            reason = `Duplicate entry in source repeated with and without prefix. Alias of Record #${existingPrimary.recordIndex}.`;
          } else {
            proposedTargetTable = "SubCommunity";
            proposedParent = "Knanaya (Community)";
            classification = "DEFERRED_TO_SUBCOMMUNITY";
            confidence = "HIGH";
            reason = `Sub-branch of the endogamous Knanaya Christian community. In existing hierarchy, parent is Community 'Knanaya'. Defer to Batch 2.`;
          }
        } else {
          // Check if canonical Christian denomination was already registered
          const existingPrimary = primaryCommunityMap.get(`Christian:${cleanDisplayName.toLowerCase()}`);
          if (existingPrimary) {
            classification = "ALIAS";
            confidence = "HIGH";
            proposedTargetTable = "Community";
            reason = `Duplicate denomination repeated in source with/without 'Christian -' prefix. Alias of Record #${existingPrimary.recordIndex}.`;
          } else {
            proposedTargetTable = "Community";
            classification = "NEW_COMMUNITY_CANDIDATE";
            confidence = "HIGH";
            reason = "Christian denomination mapped to Community level under parent Religion 'Christian'.";
          }
        }
      }

      // 6. SIKH
      else if (sRelName === "Sikh") {
        proposedParent = "Sikh";
        proposedParentId = sikhRel.id;

        cleanDisplayName = norm.replace(/^Sikh\s*-\s*/i, "").trim();
        normalizationType = norm.startsWith("Sikh -") ? "STRIP_RELIGION_PREFIX" : "EXACT";

        if (crossReligionBaseNames.has(cleanDisplayName.toLowerCase())) {
          isCrossReligion = true;
        }

        proposedTargetTable = "Community";
        classification = "NEW_COMMUNITY_CANDIDATE";
        confidence = "HIGH";
        reason = `Sikh cultural community under parent Religion 'Sikh'.`;
      }

      // 7. JAIN
      else if (sRelName.startsWith("Jain")) {
        proposedParent = "Jain";
        proposedParentId = jainRel.id;

        cleanDisplayName = norm.replace(/^Jain\s*-\s*/i, "").trim();
        normalizationType = norm.startsWith("Jain -") ? "STRIP_RELIGION_PREFIX" : "EXACT";

        if (cleanDisplayName.startsWith("Digambar-") || cleanDisplayName.startsWith("Shvetambar-")) {
          proposedTargetTable = "SubCommunity";
          proposedParent = cleanDisplayName.startsWith("Digambar-") ? "Digambar (Community/Sect)" : "Shwetambar (Community/Sect)";
          classification = "DEFERRED_TO_SUBCOMMUNITY";
          confidence = "HIGH";
          reason = `Sub-sect / Panth under Jain tradition. Defer to Batch 2.`;
        } else {
          const existingPrimary = primaryCommunityMap.get(`Jain:${cleanDisplayName.toLowerCase()}`);
          if (existingPrimary) {
            classification = "ALIAS";
            confidence = "HIGH";
            proposedTargetTable = "Community";
            reason = `Duplicate option in source repeated across '${sRelName}'. Preserves canonical candidate (Record #${existingPrimary.recordIndex}).`;
          } else {
            proposedTargetTable = "Community";
            classification = "NEW_COMMUNITY_CANDIDATE";
            confidence = "HIGH";
            reason = `Jain mercantile/regional community under parent Religion 'Jain'.`;
          }

          if (crossReligionBaseNames.has(cleanDisplayName.toLowerCase())) {
            isCrossReligion = true;
          }
        }
      }

      // 8. BUDDHIST
      else if (sRelName === "Buddhist") {
        proposedParent = "Buddhist";
        proposedParentId = buddhistRel.id;
        cleanDisplayName = norm;
        proposedTargetTable = "Community";
        classification = "NEW_COMMUNITY_CANDIDATE";
        confidence = "HIGH";
        reason = `Buddhist branch/tradition mapped to Community level under parent Religion 'Buddhist'.`;
      }

      // 9. PARSI
      else if (sRelName === "Parsi") {
        proposedParent = "Parsi";
        proposedParentId = parsiRel.id;
        cleanDisplayName = norm;

        if (crossReligionBaseNames.has(cleanDisplayName.toLowerCase())) {
          isCrossReligion = true;
        }

        proposedTargetTable = "Community";
        classification = "NEW_COMMUNITY_CANDIDATE";
        confidence = "HIGH";
        reason = `Parsi community under parent Religion 'Parsi'.`;
      }

      // Determine proposed slug
      let proposedSlug = generateSlug(cleanDisplayName);

      // Qualify cross-religion slugs
      if (isCrossReligion) {
        if (sRelName.startsWith("Muslim")) proposedSlug = `muslim-${proposedSlug}`;
        else if (sRelName === "Sikh") proposedSlug = `sikh-${proposedSlug}`;
        else if (sRelName.startsWith("Jain")) proposedSlug = `jain-${proposedSlug}`;
        else if (sRelName === "Parsi") proposedSlug = `parsi-${proposedSlug}`;
      }

      // Truncate slug if > 50 chars (Prisma schema VarChar(50))
      if (proposedSlug.length > 50) {
        proposedSlug = proposedSlug.substring(0, 50).replace(/-+$/, "");
      }

      // Check slug collision
      let slugCollision = false;
      if (proposedTargetTable === "Community" && classification === "NEW_COMMUNITY_CANDIDATE") {
        const existingHolder = globalSlugMap.get(proposedSlug);
        if (existingHolder) {
          slugCollision = true;
          console.warn(`[COLLISION] Slug '${proposedSlug}' collided! New: ${sRelName} -> ${cleanDisplayName}, Existing: ${existingHolder.religion} -> ${existingHolder.name}`);
        } else {
          globalSlugMap.set(proposedSlug, { recordIndex: recordCounter, name: cleanDisplayName, religion: sRelName });
        }

        // Register in primary map so identical subsequent records in source are recognized as ALIAS
        const relKey = sRelName.startsWith("Muslim") ? "Muslim" : sRelName.startsWith("Jain") ? "Jain" : sRelName;
        primaryCommunityMap.set(`${relKey}:${cleanDisplayName.toLowerCase()}`, { slug: proposedSlug, recordIndex: recordCounter, sourceReligion: sRelName });
      }

      candidateAuditList.push({
        recordIndex: recordCounter,
        sourceReligion: sRelName,
        sourceValue: opt,
        normalizedName: cleanDisplayName,
        existingMatch,
        existingId,
        proposedTargetTable,
        proposedParent,
        proposedParentId,
        proposedSlug,
        confidence,
        classification,
        normalizationType,
        reason,
        slugCollision,
        isCrossReligion,
      });
    }
  }

  // 4. Summarize Metrics
  const totalSourceRecords = candidateAuditList.length;
  const existingMatches = candidateAuditList.filter((c) => c.classification === "EXISTING_MATCH").length;
  const newCommunityCandidates = candidateAuditList.filter((c) => c.classification === "NEW_COMMUNITY_CANDIDATE").length;
  const deferredSubCommunity = candidateAuditList.filter((c) => c.classification === "DEFERRED_TO_SUBCOMMUNITY").length;
  const deferredCaste = candidateAuditList.filter((c) => c.classification === "DEFERRED_TO_CASTE").length;
  const deferredSubCaste = candidateAuditList.filter((c) => c.classification === "DEFERRED_TO_SUBCASTE").length;
  const aliases = candidateAuditList.filter((c) => c.classification === "ALIAS").length;
  const rejected = candidateAuditList.filter((c) => c.classification === "REJECTED").length;
  const handledByFlexible = candidateAuditList.filter((c) => c.classification === "HANDLED_BY_EXISTING_FLEXIBLE_VALUE").length;

  const highConfidence = candidateAuditList.filter((c) => c.confidence === "HIGH").length;
  const mediumConfidence = candidateAuditList.filter((c) => c.confidence === "MEDIUM").length;
  const lowConfidence = candidateAuditList.filter((c) => c.confidence === "LOW").length;

  const slugCollisions = candidateAuditList.filter((c) => c.slugCollision).length;

  console.log("\n==================================================");
  console.log("ACCURATE BATCH 1.1 SUMMARY METRICS");
  console.log("==================================================");
  console.log(`Source records evaluated:          ${totalSourceRecords}`);
  console.log(`Existing DB matches:               ${existingMatches}`);
  console.log(`New Community candidates:          ${newCommunityCandidates}`);
  console.log(`Deferred to SubCommunity:          ${deferredSubCommunity}`);
  console.log(`Deferred to Caste:                 ${deferredCaste}`);
  console.log(`Deferred to SubCaste:              ${deferredSubCaste}`);
  console.log(`Aliases:                           ${aliases}`);
  console.log(`Rejected:                          ${rejected}`);
  console.log(`Handled by Flexible Values:        ${handledByFlexible}`);
  console.log(`High Confidence:                   ${highConfidence}`);
  console.log(`Medium Confidence:                 ${mediumConfidence}`);
  console.log(`Low Confidence:                    ${lowConfidence}`);
  console.log(`Slug Collisions:                   ${slugCollisions}`);
  console.log("==================================================\n");

  // 5. Generate JSON Report
  const reportPayload = {
    reportTitle: "Manglam Matrimony — Master Data Batch 1.1 Classification Report",
    generatedAt: new Date().toISOString(),
    auditMode: "READ_ONLY",
    authoritativeDatabase: "manglammatrimony_dev",
    summaryTotals: {
      totalSourceRecordsAccountedFor: totalSourceRecords,
      existingMatches,
      newCommunityCandidates,
      deferredSubCommunity,
      deferredCaste,
      deferredSubCaste,
      aliases,
      rejected,
      handledByFlexibleValues: handledByFlexible,
      highConfidence,
      mediumConfidence,
      lowConfidence,
      slugCollisions,
    },
    section1_existingDatabaseState: {
      religions: dbReligions,
      communities: existingCommunityAuditList,
    },
    section2_existingCommunityRemapping: existingCommunityAuditList,
    section3_slugCollisionReport: candidateAuditList.filter((c) => c.slugCollision),
    section4_allSourceCandidates: candidateAuditList,
  };

  const jsonOutPath = path.join(__dirname, "../master-data/reports/batch-1.1-religion-community-classification.json");
  fs.writeFileSync(jsonOutPath, JSON.stringify(reportPayload, null, 2));
  console.log(`[OUTPUT] JSON report saved to ${jsonOutPath}`);

  // 6. Generate CSV Report
  const csvOutPath = path.join(__dirname, "../master-data/reports/batch-1.1-religion-community-classification.csv");
  const csvHeaders = [
    "RecordIndex",
    "SourceReligion",
    "SourceValue",
    "NormalizedName",
    "ExistingMatch",
    "ProposedTargetTable",
    "ProposedParent",
    "ProposedSlug",
    "Classification",
    "Confidence",
    "NormalizationType",
    "SlugCollision",
    "Reason",
  ].join(",");

  const csvRows = candidateAuditList.map((c) => {
    const esc = (val: any) => `"${String(val ?? "").replace(/"/g, '""')}"`;
    return [
      c.recordIndex,
      esc(c.sourceReligion),
      esc(c.sourceValue),
      esc(c.normalizedName),
      esc(c.existingMatch),
      esc(c.proposedTargetTable),
      esc(c.proposedParent),
      esc(c.proposedSlug),
      esc(c.classification),
      esc(c.confidence),
      esc(c.normalizationType),
      c.slugCollision,
      esc(c.reason),
    ].join(",");
  });

  fs.writeFileSync(csvOutPath, csvHeaders + "\n" + csvRows.join("\n"));
  console.log(`[OUTPUT] CSV report saved to ${csvOutPath}`);

  console.log("\n==================================================");
  console.log("MASTER DATA BATCH 1.1 — SCRIPT EXECUTION FINISHED");
  console.log("==================================================");
}

runBatch1_1()
  .catch((err) => {
    console.error("[BATCH 1.1 SCRIPT ERROR]:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
