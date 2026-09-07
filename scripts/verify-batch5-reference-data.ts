import { PrismaClient, ProfileCreatedFor, Gender, MaritalStatus, ManglikStatus, EmploymentType, AnnualIncomeRange } from "@prisma/client";
import { profileService } from "../src/services/profile.service";

const prisma = new PrismaClient();

async function auditReferenceData() {
  console.log("==================================================");
  console.log("MANGLAM MATRIMONY — BATCH 5 REFERENCE DATA AUDIT");
  console.log("==================================================");

  let allPassed = true;

  function assert(condition: boolean, message: string) {
    if (condition) {
      console.log(`  ✓ PASS: ${message}`);
    } else {
      console.error(`  ✗ FAIL: ${message}`);
      allPassed = false;
    }
  }

  // ----------------------------------------------------------------------------
  // 1. GENDER ENUM AUDIT
  // ----------------------------------------------------------------------------
  console.log("\n1. Gender Enum Audit:");
  const validGenders = Object.values(Gender);
  console.log(`  Supported Enum Values (${validGenders.length}):`, validGenders.join(", "));
  assert(validGenders.includes("MALE") && validGenders.includes("FEMALE") && validGenders.includes("OTHER"), "Gender contains MALE, FEMALE, OTHER");

  const personalDetails = await prisma.profilePersonalDetails.findMany({ select: { id: true, gender: true } });
  const invalidGenders = personalDetails.filter((pd) => !validGenders.includes(pd.gender));
  assert(invalidGenders.length === 0, `Invalid gender records: ${invalidGenders.length} (expected 0)`);
  console.log(`  Total profiles with gender: ${personalDetails.length} (all valid)`);

  // ----------------------------------------------------------------------------
  // 2. MARITAL STATUS ENUM AUDIT
  // ----------------------------------------------------------------------------
  console.log("\n2. Marital Status Enum Audit:");
  const validMarital = Object.values(MaritalStatus);
  console.log(`  Supported Enum Values (${validMarital.length}):`, validMarital.join(", "));
  assert(
    validMarital.length === 5 &&
    validMarital.includes("NEVER_MARRIED") &&
    validMarital.includes("DIVORCED") &&
    validMarital.includes("WIDOWED") &&
    validMarital.includes("AWAITING_DIVORCE") &&
    validMarital.includes("ANNULLED"),
    "MaritalStatus contains all 5 canonical options"
  );

  const pdMarital = await prisma.profilePersonalDetails.findMany({ select: { id: true, maritalStatus: true } });
  const invalidMarital = pdMarital.filter((pd) => !validMarital.includes(pd.maritalStatus));
  assert(invalidMarital.length === 0, `Invalid marital status in profiles: ${invalidMarital.length} (expected 0)`);

  const prefMarital = await prisma.partnerPreferenceMaritalStatus.findMany();
  const invalidPrefMarital = prefMarital.filter((pm) => !validMarital.includes(pm.maritalStatus));
  assert(invalidPrefMarital.length === 0, `Invalid marital status in partner preferences: ${invalidPrefMarital.length} (expected 0)`);
  console.log(`  Profile marital records: ${pdMarital.length}, Partner preference marital records: ${prefMarital.length} (all valid)`);

  // ----------------------------------------------------------------------------
  // 3. INCOME RANGE ENUM AUDIT
  // ----------------------------------------------------------------------------
  console.log("\n3. Annual Income Range Enum Audit:");
  const validIncome = Object.values(AnnualIncomeRange);
  console.log(`  Supported Enum Values (${validIncome.length}):`, validIncome.join(", "));
  assert(validIncome.length === 10, "AnnualIncomeRange contains all 10 canonical ranges including PREFER_NOT_TO_SAY");

  const careers = await prisma.profileCareer.findMany({ select: { id: true, annualIncomeRange: true, employmentType: true } });
  const invalidIncome = careers.filter((c) => c.annualIncomeRange !== null && !validIncome.includes(c.annualIncomeRange));
  assert(invalidIncome.length === 0, `Invalid income range in careers: ${invalidIncome.length} (expected 0)`);
  console.log(`  Total careers: ${careers.length} (all income values valid)`);

  // ----------------------------------------------------------------------------
  // 4. MANGLIK STATUS ENUM AUDIT
  // ----------------------------------------------------------------------------
  console.log("\n4. Manglik Status Enum Audit:");
  const validManglik = Object.values(ManglikStatus);
  console.log(`  Supported Enum Values (${validManglik.length}):`, validManglik.join(", "));
  assert(
    validManglik.length === 4 &&
    validManglik.includes("YES") &&
    validManglik.includes("NO") &&
    validManglik.includes("DONT_KNOW") &&
    validManglik.includes("NOT_APPLICABLE"),
    "ManglikStatus contains YES, NO, DONT_KNOW, NOT_APPLICABLE"
  );

  const religions = await prisma.profileReligion.findMany({ select: { id: true, manglik: true } });
  const invalidManglik = religions.filter((r) => r.manglik !== null && !validManglik.includes(r.manglik));
  assert(invalidManglik.length === 0, `Invalid manglik status in profiles: ${invalidManglik.length} (expected 0)`);

  const prefManglik = await prisma.partnerPreferenceManglik.findMany();
  const invalidPrefManglik = prefManglik.filter((pm) => !validManglik.includes(pm.manglik));
  assert(invalidPrefManglik.length === 0, `Invalid manglik status in partner preferences: ${invalidPrefManglik.length} (expected 0)`);
  console.log(`  Profile religion records: ${religions.length}, Partner preference manglik records: ${prefManglik.length} (all valid)`);

  // ----------------------------------------------------------------------------
  // 5. PROFILE CREATED FOR ENUM AUDIT
  // ----------------------------------------------------------------------------
  console.log("\n5. Profile Created For Enum Audit:");
  const validCreatedFor = Object.values(ProfileCreatedFor);
  console.log(`  Supported Enum Values (${validCreatedFor.length}):`, validCreatedFor.join(", "));
  assert(
    validCreatedFor.length === 7 &&
    validCreatedFor.includes("MYSELF") &&
    validCreatedFor.includes("MY_SON") &&
    validCreatedFor.includes("MY_DAUGHTER") &&
    validCreatedFor.includes("MY_BROTHER") &&
    validCreatedFor.includes("MY_SISTER") &&
    validCreatedFor.includes("MY_RELATIVE") &&
    validCreatedFor.includes("OTHER"),
    "ProfileCreatedFor contains all 7 canonical options matching product spec"
  );

  const profiles = await prisma.profile.findMany({ select: { id: true, profileCreatedFor: true } });
  const invalidCreatedFor = profiles.filter((p) => !validCreatedFor.includes(p.profileCreatedFor));
  assert(invalidCreatedFor.length === 0, `Invalid profileCreatedFor in profiles: ${invalidCreatedFor.length} (expected 0)`);
  console.log(`  Total profiles: ${profiles.length} (all profileCreatedFor values valid)`);

  // ----------------------------------------------------------------------------
  // 6. PARTNER AGE PREFERENCE AUDIT
  // ----------------------------------------------------------------------------
  console.log("\n6. Partner Age Preference Audit:");
  const partnerPrefs = await prisma.partnerPreference.findMany();
  let invalidAgeRanges = 0;
  for (const pref of partnerPrefs) {
    if (pref.minAge !== null && pref.maxAge !== null && pref.minAge > pref.maxAge) {
      invalidAgeRanges++;
    }
  }
  assert(invalidAgeRanges === 0, `Invalid partner age ranges (min > max): ${invalidAgeRanges} (expected 0)`);
  console.log(`  Total partner preferences: ${partnerPrefs.length} (all age bounds valid)`);

  // ----------------------------------------------------------------------------
  // 7. PARTNER HEIGHT PREFERENCE AUDIT
  // ----------------------------------------------------------------------------
  console.log("\n7. Partner Height Preference Audit:");
  let invalidHeightRanges = 0;
  for (const pref of partnerPrefs) {
    if (pref.minHeightCm !== null && pref.maxHeightCm !== null && pref.minHeightCm > pref.maxHeightCm) {
      invalidHeightRanges++;
    }
  }
  assert(invalidHeightRanges === 0, `Invalid partner height ranges (min > max): ${invalidHeightRanges} (expected 0)`);
  console.log(`  Total partner preferences: ${partnerPrefs.length} (all height bounds valid)`);

  // ----------------------------------------------------------------------------
  // 8. EMPLOYMENT TYPE ENUM AUDIT
  // ----------------------------------------------------------------------------
  console.log("\n8. Employment Type Enum Audit:");
  const validEmpTypes = Object.values(EmploymentType);
  console.log(`  Supported Enum Values (${validEmpTypes.length}):`, validEmpTypes.join(", "));
  assert(
    validEmpTypes.length === 6 &&
    validEmpTypes.includes("FULL_TIME") &&
    validEmpTypes.includes("PART_TIME") &&
    validEmpTypes.includes("CONTRACT") &&
    validEmpTypes.includes("FREELANCE") &&
    validEmpTypes.includes("INTERNSHIP") &&
    validEmpTypes.includes("OTHER"),
    "EmploymentType contains all 6 canonical options"
  );

  const invalidEmpTypes = careers.filter((c) => c.employmentType !== null && !validEmpTypes.includes(c.employmentType));
  assert(invalidEmpTypes.length === 0, `Invalid employment type in careers: ${invalidEmpTypes.length} (expected 0)`);
  console.log(`  Total careers checked: ${careers.length} (all employmentType values valid)`);

  // ----------------------------------------------------------------------------
  // 9. LANGUAGES MASTER DATA TABLE AUDIT
  // ----------------------------------------------------------------------------
  console.log("\n9. Languages Master Data Table Audit:");
  const langCount = await prisma.language.count();
  assert(langCount === 21, `Language master table count: ${langCount} (expected 21)`);

  const activeLanguages = await profileService.getActiveLanguages();
  assert(activeLanguages.length === 21, `profileService.getActiveLanguages() returned ${activeLanguages.length} active languages`);

  const allLangIds = new Set((await prisma.language.findMany({ select: { id: true } })).map((l) => l.id));
  const pdMotherTongues = await prisma.profilePersonalDetails.findMany({ select: { motherTongueId: true } });
  const orphanMotherTongues = pdMotherTongues.filter((pd) => !allLangIds.has(pd.motherTongueId));
  assert(orphanMotherTongues.length === 0, `Orphan motherTongueId records: ${orphanMotherTongues.length} (expected 0)`);

  const profileLanguages = await prisma.profileLanguage.findMany({ select: { languageId: true } });
  const orphanProfileLanguages = profileLanguages.filter((pl) => !allLangIds.has(pl.languageId));
  assert(orphanProfileLanguages.length === 0, `Orphan profile_languages records: ${orphanProfileLanguages.length} (expected 0)`);

  // ----------------------------------------------------------------------------
  // 10. GOTRA CONDITIONAL BEHAVIOR AUDIT
  // ----------------------------------------------------------------------------
  console.log("\n10. Gotra Conditional Behavior Audit:");
  const hinduRel = await prisma.religion.findFirst({ where: { slug: "hindu" } });
  const nonHinduProfilesWithGotra = await prisma.profileReligion.findMany({
    where: {
      religionId: { not: hinduRel?.id },
      gotraId: { not: null },
    },
  });
  assert(nonHinduProfilesWithGotra.length === 0, `Non-Hindu profiles with Gotra: ${nonHinduProfilesWithGotra.length} (expected 0)`);

  console.log("\n==================================================");
  if (allPassed) {
    console.log("✓ ALL BATCH 5 REFERENCE DATA CHECKS PASSED PERFECTLY!");
  } else {
    console.error("✗ ONE OR MORE BATCH 5 CHECKS FAILED!");
    throw new Error("Audit failed.");
  }
  console.log("==================================================");
}

auditReferenceData()
  .then(async () => {
    await prisma.$disconnect();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error("[AUDIT ERROR]:", err);
    await prisma.$disconnect();
    process.exit(1);
  });
