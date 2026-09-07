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

// Helper: normalize whitespace & punctuation
function normalizeString(str: string): string {
  if (!str) return "";
  return str
    .normalize("NFC")
    .replace(/\s+/g, " ")
    .trim();
}

function toSlug(str: string): string {
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip diacritics for slug
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function runBatch1Analysis() {
  // 1. Fetch DB
  const dbReligions = await prisma.religion.findMany({ orderBy: { sortOrder: "asc" } });
  const dbCommunities = await prisma.community.findMany({
    include: { religion: true },
    orderBy: { sortOrder: "asc" },
  });

  const profileReligionGroups = await prisma.profileReligion.groupBy({
    by: ["religionId"],
    _count: { _all: true },
  });
  const profileCommunityGroups = await prisma.profileReligion.groupBy({
    by: ["communityId"],
    _count: { _all: true },
  });

  const relProfileCount = new Map<string, number>();
  profileReligionGroups.forEach((g) => {
    if (g.religionId) relProfileCount.set(g.religionId, g._count._all);
  });

  const comProfileCount = new Map<string, number>();
  profileCommunityGroups.forEach((g) => {
    if (g.communityId) comProfileCount.set(g.communityId, g._count._all);
  });

  // 2. Load Source Data
  const sourcePath = path.join(__dirname, "../master-data/source/religion_community_caste_master_data.json");
  const sourceData: SourceData = JSON.parse(fs.readFileSync(sourcePath, "utf-8"));

  // 3. Section 2: Religion Classification
  interface ReligionClassification {
    sourceName: string;
    normalizedName: string;
    existingMatch: string | null;
    existingId: string | null;
    classification: "EXISTING_MATCH" | "NEW_VALID_CANDIDATE" | "DUPLICATE" | "ALIAS" | "AMBIGUOUS" | "NOT_TO_IMPORT";
    proposedAction: string;
    confidence: "HIGH" | "MEDIUM" | "LOW" | "UNMAPPED";
    reason: string;
  }

  const religionClassifications: ReligionClassification[] = [];

  for (const sr of sourceData.religions) {
    const norm = normalizeString(sr.name);
    let classification: ReligionClassification["classification"] = "AMBIGUOUS";
    let existingMatch: string | null = null;
    let existingId: string | null = null;
    let proposedAction = "";
    let confidence: "HIGH" | "MEDIUM" | "LOW" | "UNMAPPED" = "HIGH";
    let reason = "";

    const exactDb = dbReligions.find((r) => r.name.toLowerCase() === norm.toLowerCase());

    if (exactDb) {
      classification = "EXISTING_MATCH";
      existingMatch = exactDb.name;
      existingId = exactDb.id;
      proposedAction = "RETAIN_EXISTING";
      reason = `Direct 1:1 match with existing database religion record (slug: '${exactDb.slug}').`;
    } else if (norm === "Muslim - Shia" || norm === "Muslim - Sunni") {
      classification = "ALIAS";
      existingMatch = "Muslim";
      existingId = dbReligions.find((r) => r.slug === "muslim")?.id || null;
      proposedAction = "MAP_OPTIONS_TO_PARENT_COMMUNITIES";
      reason = `In Manglam Matrimony architecture, Shia and Sunni are sects/communities under parent religion 'Muslim', not separate religions.`;
    } else if (norm === "Jain - All" || norm === "Jain - Digambar" || norm === "Jain - Shwetambar") {
      classification = "ALIAS";
      existingMatch = "Jain";
      existingId = dbReligions.find((r) => r.slug === "jain")?.id || null;
      proposedAction = "MAP_OPTIONS_TO_PARENT_COMMUNITIES";
      reason = `In Manglam Matrimony architecture, Digambar and Shwetambar are sects/communities under parent religion 'Jain', not separate religions.`;
    } else if (norm === "Inter-Religion" || norm === "No Religious Belief") {
      classification = "NOT_TO_IMPORT";
      existingMatch = null;
      proposedAction = "USE_EXISTING_OTHER_OR_PREFER_NOT_TO_SAY";
      reason = `Architecture handles non-religious/inter-religious profiles via 'Other' (custom text) or 'Prefer not to say' options in the existing Religion model.`;
    } else {
      classification = "NEW_VALID_CANDIDATE";
      proposedAction = "REVIEW_CANDIDATE";
      confidence = "MEDIUM";
      reason = "Candidate religion not in existing database.";
    }

    religionClassifications.push({
      sourceName: sr.name,
      normalizedName: norm,
      existingMatch,
      existingId,
      classification,
      proposedAction,
      confidence,
      reason,
    });
  }

  // 4. Section 4: Existing Community Remapping (The 20 DB communities)
  interface ExistingCommunityRemapping {
    existingId: string;
    existingName: string;
    existingSlug: string;
    currentReligionId: string | null;
    currentReligionName: string | null;
    proposedReligionId: string | null;
    proposedReligionName: string | null;
    confidence: "HIGH" | "MEDIUM" | "LOW" | "UNMAPPED";
    reason: string;
    affectedProfilesCount: number;
  }

  const existingCommunityRemappings: ExistingCommunityRemapping[] = [];

  const hinduRel = dbReligions.find((r) => r.slug === "hindu")!;
  const jainRel = dbReligions.find((r) => r.slug === "jain")!;

  for (const c of dbCommunities) {
    const profCount = comProfileCount.get(c.id) || 0;
    let proposedRelId: string | null = null;
    let proposedRelName: string | null = null;
    let conf: "HIGH" | "MEDIUM" | "LOW" | "UNMAPPED" = "HIGH";
    let reason = "";

    switch (c.slug) {
      case "brahmin":
      case "rajput":
      case "jat":
      case "gujjar":
      case "kayastha":
      case "baniya-vaishya":
      case "kshatriya":
      case "yadav":
      case "kurmi":
      case "maratha":
      case "patel":
      case "reddy":
      case "kamma":
      case "nair":
      case "ezhava":
      case "lingayat":
      case "vokkaliga":
        proposedRelId = hinduRel.id;
        proposedRelName = hinduRel.name;
        conf = "HIGH";
        reason = `Major Hindu cultural community specified in initial platform seed. All ${profCount} active profiles using this community are Hindu.`;
        break;

      case "agarwal":
        proposedRelId = hinduRel.id;
        proposedRelName = hinduRel.name;
        conf = "HIGH";
        reason = `Agarwal is primarily a Hindu Vaishya community (also recognized in Jainism; can have a dedicated Jain Agarwal community or multi-religion reference). Currently mapping to Hindu parent.`;
        break;

      case "other":
        proposedRelId = null; // Stays null so it's visible across all religions!
        proposedRelName = "Universal / Cross-Religion";
        conf = "HIGH";
        reason = `Special fallback community record. Retaining religionId = NULL allows it to appear under all religions per repository OR logic.`;
        break;

      case "prefer-not-to-say":
        proposedRelId = null; // Stays null so it's visible across all religions!
        proposedRelName = "Universal / Cross-Religion";
        conf = "HIGH";
        reason = `Special opt-out community record. Retaining religionId = NULL allows it to appear under all religions per repository OR logic.`;
        break;

      default:
        conf = "UNMAPPED";
        reason = "Unrecognized community slug in database.";
        break;
    }

    existingCommunityRemappings.push({
      existingId: c.id,
      existingName: c.name,
      existingSlug: c.slug,
      currentReligionId: c.religionId,
      currentReligionName: c.religion?.name || null,
      proposedReligionId: proposedRelId,
      proposedReligionName: proposedRelName,
      confidence: conf,
      reason,
      affectedProfilesCount: profCount,
    });
  }

  // 5. Section 3 & 5 & 6: Source Options Processing
  interface ProcessedSourceOption {
    sourceReligion: string;
    sourceValue: string;
    normalizedValue: string;
    targetHierarchyLevel: "COMMUNITY" | "CASTE_OR_SUBCASTE" | "SECT_COMMUNITY" | "DENOMINATION_COMMUNITY" | "GENERIC_TOKEN" | "UNMAPPED";
    existingCommunityMatch: string | null;
    existingCommunityId: string | null;
    proposedParentReligion: string | null;
    proposedParentReligionId: string | null;
    classification: "EXACT_EXISTING_COMMUNITY" | "CANDIDATE_COMMUNITY" | "SUB_COMMUNITY_OR_CASTE" | "GENERIC_TOKEN_REJECT" | "AMBIGUOUS";
    confidence: "HIGH" | "MEDIUM" | "LOW" | "UNMAPPED";
    reason: string;
    action: "MAP_TO_EXISTING_COMMUNITY" | "STAGE_FOR_BATCH_1_COMMUNITY" | "DEFER_TO_BATCH_2_CASTE" | "DO_NOT_IMPORT" | "FLAG_FOR_REVIEW";
  }

  const processedOptions: ProcessedSourceOption[] = [];

  const genericTokens = new Set([
    "others",
    "intercaste",
    "muslim - unspecified",
    "christian - unspecified",
    "sikh - unspecified",
    "jain - unspecified",
    "sikh - no bar",
    "jain - no bar",
    "sc",
    "st",
  ]);

  for (const sr of sourceData.religions) {
    const parentRelNorm = normalizeString(sr.name);

    // Determine target DB religion
    let targetDbRelName = parentRelNorm;
    if (parentRelNorm.startsWith("Muslim")) targetDbRelName = "Muslim";
    else if (parentRelNorm.startsWith("Jain")) targetDbRelName = "Jain";
    else if (parentRelNorm === "Inter-Religion" || parentRelNorm === "No Religious Belief") {
      targetDbRelName = "Other";
    }

    const targetDbRel = dbReligions.find((r) => r.name.toLowerCase() === targetDbRelName.toLowerCase());

    for (const opt of sr.options) {
      const norm = normalizeString(opt);
      const lower = norm.toLowerCase();

      // Check generic tokens first
      if (genericTokens.has(lower) || lower === "others" || lower === "other") {
        processedOptions.push({
          sourceReligion: sr.name,
          sourceValue: opt,
          normalizedValue: norm,
          targetHierarchyLevel: "GENERIC_TOKEN",
          existingCommunityMatch: lower.includes("unspecified") || lower === "others" ? "Other" : null,
          existingCommunityId: null,
          proposedParentReligion: targetDbRel?.name || null,
          proposedParentReligionId: targetDbRel?.id || null,
          classification: "GENERIC_TOKEN_REJECT",
          confidence: "HIGH",
          reason: `Generic placeholder ('${opt}') handled natively by existing flexible architecture ('Other' / 'Prefer not to say' / custom text). Do not duplicate.`,
          action: "DO_NOT_IMPORT",
        });
        continue;
      }

      // Check if matches existing community exactly
      const matchedCommunity = dbCommunities.find(
        (c) => c.name.toLowerCase() === norm.toLowerCase() ||
               c.slug.toLowerCase() === toSlug(norm)
      );

      if (matchedCommunity) {
        processedOptions.push({
          sourceReligion: sr.name,
          sourceValue: opt,
          normalizedValue: norm,
          targetHierarchyLevel: "COMMUNITY",
          existingCommunityMatch: matchedCommunity.name,
          existingCommunityId: matchedCommunity.id,
          proposedParentReligion: targetDbRel?.name || null,
          proposedParentReligionId: targetDbRel?.id || null,
          classification: "EXACT_EXISTING_COMMUNITY",
          confidence: "HIGH",
          reason: `Matches existing database community '${matchedCommunity.name}'. Will be linked to parent religion '${targetDbRel?.name}'.`,
          action: "MAP_TO_EXISTING_COMMUNITY",
        });
        continue;
      }

      // Check if it is a compound caste/sub-caste under Hindu: e.g. "Brahmin - Gaur", "Sindhi - Amil", "Baniya - Bania"
      if (sr.name === "Hindu") {
        if (norm.includes(" - ") || norm.includes("Brahmin -") || norm.startsWith("Sindhi-") || norm.startsWith("Baniya -")) {
          processedOptions.push({
            sourceReligion: sr.name,
            sourceValue: opt,
            normalizedValue: norm,
            targetHierarchyLevel: "CASTE_OR_SUBCASTE",
            existingCommunityMatch: null,
            existingCommunityId: null,
            proposedParentReligion: "Hindu",
            proposedParentReligionId: targetDbRel?.id || null,
            classification: "SUB_COMMUNITY_OR_CASTE",
            confidence: "HIGH",
            reason: `Compound cultural title indicating sub-caste/lineage under parent community (e.g. Brahmin, Sindhi, Baniya). Defer to Batch 2 (Caste/Sub-Caste).`,
            action: "DEFER_TO_BATCH_2_CASTE",
          });
          continue;
        }

        // Check if it is a known broad Hindu community candidate
        processedOptions.push({
          sourceReligion: sr.name,
          sourceValue: opt,
          normalizedValue: norm,
          targetHierarchyLevel: "COMMUNITY",
          existingCommunityMatch: null,
          existingCommunityId: null,
          proposedParentReligion: "Hindu",
          proposedParentReligionId: targetDbRel?.id || null,
          classification: "CANDIDATE_COMMUNITY",
          confidence: "HIGH",
          reason: `Candidate Hindu community from source dataset.`,
          action: "STAGE_FOR_BATCH_1_COMMUNITY",
        });
        continue;
      }

      // Muslim / Muslim - Shia / Muslim - Sunni
      if (sr.name.startsWith("Muslim")) {
        // Strip "Muslim - " prefix if present for clean community name: e.g. "Muslim - Ansari" -> "Ansari"
        const cleanName = norm.replace(/^Muslim\s*-\s*/i, "").trim();
        processedOptions.push({
          sourceReligion: sr.name,
          sourceValue: opt,
          normalizedValue: cleanName,
          targetHierarchyLevel: "SECT_COMMUNITY",
          existingCommunityMatch: null,
          existingCommunityId: null,
          proposedParentReligion: "Muslim",
          proposedParentReligionId: targetDbRel?.id || null,
          classification: "CANDIDATE_COMMUNITY",
          confidence: "HIGH",
          reason: `Muslim cultural sect/community. Normalized from '${opt}' to '${cleanName}' under parent Religion 'Muslim'.`,
          action: "STAGE_FOR_BATCH_1_COMMUNITY",
        });
        continue;
      }

      // Christian Denominations
      if (sr.name === "Christian") {
        const cleanName = norm.replace(/^Christian\s*-\s*/i, "").trim();
        processedOptions.push({
          sourceReligion: sr.name,
          sourceValue: opt,
          normalizedValue: cleanName,
          targetHierarchyLevel: "DENOMINATION_COMMUNITY",
          existingCommunityMatch: null,
          existingCommunityId: null,
          proposedParentReligion: "Christian",
          proposedParentReligionId: targetDbRel?.id || null,
          classification: "CANDIDATE_COMMUNITY",
          confidence: "HIGH",
          reason: `Christian denomination mapped to Community level under parent Religion 'Christian'.`,
          action: "STAGE_FOR_BATCH_1_COMMUNITY",
        });
        continue;
      }

      // Sikh Communities
      if (sr.name === "Sikh") {
        const cleanName = norm.replace(/^Sikh\s*-\s*/i, "").trim();
        processedOptions.push({
          sourceReligion: sr.name,
          sourceValue: opt,
          normalizedValue: cleanName,
          targetHierarchyLevel: "COMMUNITY",
          existingCommunityMatch: null,
          existingCommunityId: null,
          proposedParentReligion: "Sikh",
          proposedParentReligionId: targetDbRel?.id || null,
          classification: "CANDIDATE_COMMUNITY",
          confidence: "HIGH",
          reason: `Sikh community. Normalized from '${opt}' to '${cleanName}' under parent Religion 'Sikh'.`,
          action: "STAGE_FOR_BATCH_1_COMMUNITY",
        });
        continue;
      }

      // Jain Communities / Sects
      if (sr.name.startsWith("Jain")) {
        const cleanName = norm.replace(/^Jain\s*-\s*/i, "").trim();
        // If it starts with Digambar- or Shvetambar-, it's a sect sub-branch
        if (cleanName.startsWith("Digambar-") || cleanName.startsWith("Shvetambar-")) {
          processedOptions.push({
            sourceReligion: sr.name,
            sourceValue: opt,
            normalizedValue: cleanName,
            targetHierarchyLevel: "CASTE_OR_SUBCASTE",
            existingCommunityMatch: null,
            existingCommunityId: null,
            proposedParentReligion: "Jain",
            proposedParentReligionId: targetDbRel?.id || null,
            classification: "SUB_COMMUNITY_OR_CASTE",
            confidence: "HIGH",
            reason: `Specific sub-sect/gaccha under Jain Digambar/Shwetambar. Defer to Batch 2.`,
            action: "DEFER_TO_BATCH_2_CASTE",
          });
          continue;
        }

        processedOptions.push({
          sourceReligion: sr.name,
          sourceValue: opt,
          normalizedValue: cleanName,
          targetHierarchyLevel: "COMMUNITY",
          existingCommunityMatch: null,
          existingCommunityId: null,
          proposedParentReligion: "Jain",
          proposedParentReligionId: targetDbRel?.id || null,
          classification: "CANDIDATE_COMMUNITY",
          confidence: "HIGH",
          reason: `Jain community/caste under parent Religion 'Jain'.`,
          action: "STAGE_FOR_BATCH_1_COMMUNITY",
        });
        continue;
      }

      // Buddhist Branches
      if (sr.name === "Buddhist") {
        processedOptions.push({
          sourceReligion: sr.name,
          sourceValue: opt,
          normalizedValue: norm,
          targetHierarchyLevel: "COMMUNITY",
          existingCommunityMatch: null,
          existingCommunityId: null,
          proposedParentReligion: "Buddhist",
          proposedParentReligionId: targetDbRel?.id || null,
          classification: "CANDIDATE_COMMUNITY",
          confidence: "HIGH",
          reason: `Buddhist tradition/branch mapped to Community level under parent Religion 'Buddhist'.`,
          action: "STAGE_FOR_BATCH_1_COMMUNITY",
        });
        continue;
      }

      // Parsi
      if (sr.name === "Parsi") {
        processedOptions.push({
          sourceReligion: sr.name,
          sourceValue: opt,
          normalizedValue: norm,
          targetHierarchyLevel: "COMMUNITY",
          existingCommunityMatch: null,
          existingCommunityId: null,
          proposedParentReligion: "Parsi",
          proposedParentReligionId: targetDbRel?.id || null,
          classification: "CANDIDATE_COMMUNITY",
          confidence: "HIGH",
          reason: `Parsi community (e.g. Irani) under parent Religion 'Parsi'.`,
          action: "STAGE_FOR_BATCH_1_COMMUNITY",
        });
        continue;
      }

      // Fallback
      processedOptions.push({
        sourceReligion: sr.name,
        sourceValue: opt,
        normalizedValue: norm,
        targetHierarchyLevel: "UNMAPPED",
        existingCommunityMatch: null,
        existingCommunityId: null,
        proposedParentReligion: null,
        proposedParentReligionId: null,
        classification: "AMBIGUOUS",
        confidence: "UNMAPPED",
        reason: `Unrecognized source option.`,
        action: "FLAG_FOR_REVIEW",
      });
    }
  }

  // 6. Section 5: Duplicates Analysis
  // Find duplicates across options within same proposed religion or across source
  interface DuplicateGroup {
    type: "DETERMINISTIC_DUPLICATES" | "POSSIBLE_DUPLICATES" | "CULTURALLY_AMBIGUOUS";
    canonicalName: string;
    instances: Array<{ sourceReligion: string; sourceValue: string; normalizedValue: string }>;
    rationale: string;
  }

  const duplicates: DuplicateGroup[] = [];

  // Group by normalized value
  const normMap = new Map<string, Array<{ sourceReligion: string; sourceValue: string; normalizedValue: string }>>();
  for (const opt of processedOptions) {
    if (opt.action === "DO_NOT_IMPORT") continue;
    const key = opt.normalizedValue.toLowerCase();
    if (!normMap.has(key)) normMap.set(key, []);
    normMap.get(key)!.push({
      sourceReligion: opt.sourceReligion,
      sourceValue: opt.sourceValue,
      normalizedValue: opt.normalizedValue,
    });
  }

  for (const [key, items] of normMap.entries()) {
    if (items.length > 1) {
      // Check if all instances have the same sourceReligion or different
      const distinctReligions = new Set(items.map((i) => i.sourceReligion));
      if (distinctReligions.size === 1) {
        duplicates.push({
          type: "DETERMINISTIC_DUPLICATES",
          canonicalName: items[0].normalizedValue,
          instances: items,
          rationale: `Exact normalized name repeated ${items.length} times within ${Array.from(distinctReligions)[0]}. Can be safely deduplicated.`,
        });
      } else {
        // Cross-religion community (e.g. Jat in Hindu/Muslim/Sikh, Rajput in Hindu/Muslim/Sikh, Agarwal in Hindu/Jain)
        duplicates.push({
          type: "CULTURALLY_AMBIGUOUS",
          canonicalName: items[0].normalizedValue,
          instances: items,
          rationale: `Community name '${items[0].normalizedValue}' appears across multiple religions (${Array.from(distinctReligions).join(", ")}). Because Community.slug is globally unique, must evaluate religion-specific slugs or separate records.`,
        });
      }
    }
  }

  // Obvious spelling variants: e.g. "Kshatriya" vs "Kshatriya", "Kurmi Kshatriya" vs "Kurmi"
  const knownSpellingVariants: Array<{ canonical: string; variants: string[]; rationale: string }> = [
    { canonical: "Bishnoi", variants: ["Bishnoi/Vishnoi"], rationale: "Alternative spelling representation with slash." },
    { canonical: "Jetty", variants: ["Jetty/Malla"], rationale: "Slash-separated alternative name." },
    { canonical: "Kushwaha", variants: ["Kushwaha (Koiri)"], rationale: "Parenthetical alternative community name." },
    { canonical: "Bunt", variants: ["Bunt (Shetty)"], rationale: "Parenthetical caste title." },
    { canonical: "Dhor", variants: ["Dhor / Kakkayya"], rationale: "Slash-separated community synonym." },
    { canonical: "Dusadh", variants: ["Dusadh (Paswan)"], rationale: "Parenthetical caste title." },
    { canonical: "Jogi", variants: ["Jogi (Nath)"], rationale: "Parenthetical sect title." },
    { canonical: "Maurya", variants: ["Maurya / Shakya"], rationale: "Slash-separated historical synonym." },
  ];

  for (const sv of knownSpellingVariants) {
    const matched = processedOptions.filter((o) => sv.variants.includes(o.sourceValue));
    if (matched.length > 0) {
      duplicates.push({
        type: "POSSIBLE_DUPLICATES",
        canonicalName: sv.canonical,
        instances: matched.map((m) => ({ sourceReligion: m.sourceReligion, sourceValue: m.sourceValue, normalizedValue: m.normalizedValue })),
        rationale: sv.rationale,
      });
    }
  }

  // 7. Section 6: Unmapped / Rejected records
  const unmappedRecords = processedOptions.filter(
    (o) => o.action === "DO_NOT_IMPORT" || o.action === "FLAG_FOR_REVIEW" || o.confidence === "UNMAPPED"
  );

  // 8. Section 7: Import Summary Totals
  const exactExistingMatches = processedOptions.filter((o) => o.action === "MAP_TO_EXISTING_COMMUNITY").length;
  const candidateCommunities = processedOptions.filter((o) => o.action === "STAGE_FOR_BATCH_1_COMMUNITY").length;
  const deferredToCaste = processedOptions.filter((o) => o.action === "DEFER_TO_BATCH_2_CASTE").length;
  const doNotImportGeneric = processedOptions.filter((o) => o.action === "DO_NOT_IMPORT").length;
  const flaggedReview = processedOptions.filter((o) => o.action === "FLAG_FOR_REVIEW").length;

  const summary = {
    sourceReligionsCount: sourceData.religions.length,
    sourceOptionsCount: processedOptions.length,
    existingReligionsCount: dbReligions.length,
    existingCommunitiesCount: dbCommunities.length,
    exactMatchesCount: exactExistingMatches,
    candidateCommunitiesCount: candidateCommunities,
    deferredToBatch2CasteCount: deferredToCaste,
    genericTokensRejectedCount: doNotImportGeneric,
    flaggedForReviewCount: flaggedReview,
    highConfidenceMappingsCount: processedOptions.filter((o) => o.confidence === "HIGH").length,
    mediumConfidenceMappingsCount: processedOptions.filter((o) => o.confidence === "MEDIUM").length,
    lowConfidenceMappingsCount: processedOptions.filter((o) => o.confidence === "LOW").length,
    unmappedCount: processedOptions.filter((o) => o.confidence === "UNMAPPED").length,
  };

  // 9. Write JSON Report
  const fullReport = {
    generatedAt: new Date().toISOString(),
    auditMode: "READ_ONLY",
    summary,
    section1_existingDatabase: {
      religions: dbReligions,
      communities: existingCommunityRemappings,
    },
    section2_sourceReligions: religionClassifications,
    section4_existingCommunityRemapping: existingCommunityRemappings,
    section5_duplicates: duplicates,
    section6_unmappedAndRejected: unmappedRecords,
    section3_allSourceOptions: processedOptions,
  };

  const jsonReportPath = path.join(__dirname, "../master-data/reports/batch-1-religion-community-mapping.json");
  fs.writeFileSync(jsonReportPath, JSON.stringify(fullReport, null, 2));
  console.log(`[REPORT] Generated JSON report at ${jsonReportPath}`);

  // 10. Write CSV Report
  const csvReportPath = path.join(__dirname, "../master-data/reports/batch-1-religion-community-mapping.csv");
  const csvHeader = "Source Religion,Source Value,Normalized Value,Target Hierarchy,Existing DB Match,Proposed Parent Religion,Classification,Confidence,Action,Reason\n";
  const csvRows = processedOptions.map((o) => {
    const escapeCsv = (val: string | null) => `"${(val || "").replace(/"/g, '""')}"`;
    return [
      escapeCsv(o.sourceReligion),
      escapeCsv(o.sourceValue),
      escapeCsv(o.normalizedValue),
      escapeCsv(o.targetHierarchyLevel),
      escapeCsv(o.existingCommunityMatch),
      escapeCsv(o.proposedParentReligion),
      escapeCsv(o.classification),
      escapeCsv(o.confidence),
      escapeCsv(o.action),
      escapeCsv(o.reason),
    ].join(",");
  });

  fs.writeFileSync(csvReportPath, csvHeader + csvRows.join("\n"));
  console.log(`[REPORT] Generated CSV report at ${csvReportPath}`);

  console.log("==================================================");
  console.log("BATCH 1 ANALYSIS COMPLETE (READ-ONLY, ZERO MUTATIONS)");
  console.log("==================================================");
}

runBatch1Analysis()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
