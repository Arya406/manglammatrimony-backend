import { prisma } from "../config/database";

// ==============================================================================
// 1. RELIGIONS MASTER DATA (10 items)
// ==============================================================================
export const RELIGIONS = [
  { name: "Hindu", slug: "hindu", sortOrder: 1 },
  { name: "Muslim", slug: "muslim", sortOrder: 2 },
  { name: "Christian", slug: "christian", sortOrder: 3 },
  { name: "Sikh", slug: "sikh", sortOrder: 4 },
  { name: "Jain", slug: "jain", sortOrder: 5 },
  { name: "Buddhist", slug: "buddhist", sortOrder: 6 },
  { name: "Parsi", slug: "parsi", sortOrder: 7 },
  { name: "Jewish", slug: "jewish", sortOrder: 8 },
  { name: "Other", slug: "other", sortOrder: 9 },
  { name: "Prefer not to say", slug: "prefer-not-to-say", sortOrder: 10 },
];

// ==============================================================================
// 2. COMMUNITIES MASTER DATA (20 items)
// ==============================================================================
export const COMMUNITIES = [
  { name: "Brahmin", slug: "brahmin", sortOrder: 1 },
  { name: "Rajput", slug: "rajput", sortOrder: 2 },
  { name: "Jat", slug: "jat", sortOrder: 3 },
  { name: "Gujjar", slug: "gujjar", sortOrder: 4 },
  { name: "Kayastha", slug: "kayastha", sortOrder: 5 },
  { name: "Baniya / Vaishya", slug: "baniya-vaishya", sortOrder: 6 },
  { name: "Kshatriya", slug: "kshatriya", sortOrder: 7 },
  { name: "Yadav", slug: "yadav", sortOrder: 8 },
  { name: "Kurmi", slug: "kurmi", sortOrder: 9 },
  { name: "Maratha", slug: "maratha", sortOrder: 10 },
  { name: "Patel", slug: "patel", sortOrder: 11 },
  { name: "Reddy", slug: "reddy", sortOrder: 12 },
  { name: "Kamma", slug: "kamma", sortOrder: 13 },
  { name: "Nair", slug: "nair", sortOrder: 14 },
  { name: "Ezhava", slug: "ezhava", sortOrder: 15 },
  { name: "Lingayat", slug: "lingayat", sortOrder: 16 },
  { name: "Vokkaliga", slug: "vokkaliga", sortOrder: 17 },
  { name: "Agarwal", slug: "agarwal", sortOrder: 18 },
  { name: "Other", slug: "other", sortOrder: 19 },
  { name: "Prefer not to say", slug: "prefer-not-to-say", sortOrder: 20 },
];

// ==============================================================================
// 3. EDUCATIONS MASTER DATA (25 items)
// ==============================================================================
export const EDUCATIONS = [
  { name: "10th", slug: "10th", sortOrder: 1 },
  { name: "12th", slug: "12th", sortOrder: 2 },
  { name: "Diploma", slug: "diploma", sortOrder: 3 },
  { name: "B.A.", slug: "ba", sortOrder: 4 },
  { name: "B.Sc.", slug: "bsc", sortOrder: 5 },
  { name: "B.Com.", slug: "bcom", sortOrder: 6 },
  { name: "BBA", slug: "bba", sortOrder: 7 },
  { name: "BCA", slug: "bca", sortOrder: 8 },
  { name: "B.E.", slug: "be", sortOrder: 9 },
  { name: "B.Tech.", slug: "btech", sortOrder: 10 },
  { name: "M.A.", slug: "ma", sortOrder: 11 },
  { name: "M.Sc.", slug: "msc", sortOrder: 12 },
  { name: "M.Com.", slug: "mcom", sortOrder: 13 },
  { name: "MBA", slug: "mba", sortOrder: 14 },
  { name: "MCA", slug: "mca", sortOrder: 15 },
  { name: "M.E.", slug: "me", sortOrder: 16 },
  { name: "M.Tech.", slug: "mtech", sortOrder: 17 },
  { name: "MBBS", slug: "mbbs", sortOrder: 18 },
  { name: "BDS", slug: "bds", sortOrder: 19 },
  { name: "LLB", slug: "llb", sortOrder: 20 },
  { name: "LLM", slug: "llm", sortOrder: 21 },
  { name: "CA", slug: "ca", sortOrder: 22 },
  { name: "CS", slug: "cs", sortOrder: 23 },
  { name: "PhD", slug: "phd", sortOrder: 24 },
  { name: "Other", slug: "other", sortOrder: 25 },
];

// ==============================================================================
// 4. EMPLOYMENT STATUS MASTER DATA (10 items)
// ==============================================================================
export const EMPLOYMENT_STATUSES = [
  { name: "Employed", slug: "employed", sortOrder: 1 },
  { name: "Self Employed", slug: "self-employed", sortOrder: 2 },
  { name: "Business Owner", slug: "business-owner", sortOrder: 3 },
  { name: "Entrepreneur", slug: "entrepreneur", sortOrder: 4 },
  { name: "Government Employee", slug: "government-employee", sortOrder: 5 },
  { name: "Defence", slug: "defence", sortOrder: 6 },
  { name: "Student", slug: "student", sortOrder: 7 },
  { name: "Not Working", slug: "not-working", sortOrder: 8 },
  { name: "Retired", slug: "retired", sortOrder: 9 },
  { name: "Other", slug: "other", sortOrder: 10 },
];

// ==============================================================================
// 5. OCCUPATIONS MASTER DATA (1 item)
// ==============================================================================
export const OCCUPATIONS = [
  {
    name: "Software Engineer",
    slug: "software-engineer",
    employmentStatusSlug: "employed",
    sortOrder: 1,
  },
];

// ==============================================================================
// 6. LANGUAGES MASTER DATA (21 items)
// ==============================================================================
export const LANGUAGES = [
  { name: "Hindi", code: "hi", sortOrder: 1 },
  { name: "English", code: "en", sortOrder: 2 },
  { name: "Bengali", code: "bn", sortOrder: 3 },
  { name: "Telugu", code: "te", sortOrder: 4 },
  { name: "Marathi", code: "mr", sortOrder: 5 },
  { name: "Tamil", code: "ta", sortOrder: 6 },
  { name: "Urdu", code: "ur", sortOrder: 7 },
  { name: "Gujarati", code: "gu", sortOrder: 8 },
  { name: "Kannada", code: "kn", sortOrder: 9 },
  { name: "Odia", code: "or", sortOrder: 10 },
  { name: "Malayalam", code: "ml", sortOrder: 11 },
  { name: "Punjabi", code: "pa", sortOrder: 12 },
  { name: "Assamese", code: "as", sortOrder: 13 },
  { name: "Maithili", code: "mai", sortOrder: 14 },
  { name: "Sanskrit", code: "sa", sortOrder: 15 },
  { name: "Marwari", code: "mwr", sortOrder: 16 },
  { name: "Sindhi", code: "sd", sortOrder: 17 },
  { name: "Konkani", code: "kok", sortOrder: 18 },
  { name: "Kashmiri", code: "ks", sortOrder: 19 },
  { name: "Dogri", code: "doi", sortOrder: 20 },
  { name: "Other", code: "other", sortOrder: 21 },
];

/**
 * Idempotently seeds all master data required by Manglam Matrimony onboarding.
 * - Uses upsert on unique keys (slug, code, [employmentStatusId, slug]).
 * - Safe to run repeatedly without creating duplicates.
 * - Does not touch user or profile tables.
 */
export async function seedMasterData(): Promise<{ totalInsertedOrVerified: number }> {
  console.log("[MASTER DATA SEED] Starting idempotent master data seed...");

  // 1. Seed Religions (10)
  for (const rel of RELIGIONS) {
    await prisma.religion.upsert({
      where: { slug: rel.slug },
      update: { name: rel.name, sortOrder: rel.sortOrder, isActive: true },
      create: { name: rel.name, slug: rel.slug, sortOrder: rel.sortOrder, isActive: true },
    });
  }

  // 2. Seed Communities (20)
  for (const com of COMMUNITIES) {
    await prisma.community.upsert({
      where: { slug: com.slug },
      update: { name: com.name, sortOrder: com.sortOrder, isActive: true },
      create: { name: com.name, slug: com.slug, sortOrder: com.sortOrder, isActive: true },
    });
  }

  // 3. Seed Educations (25)
  for (const edu of EDUCATIONS) {
    await prisma.education.upsert({
      where: { slug: edu.slug },
      update: { name: edu.name, sortOrder: edu.sortOrder, isActive: true },
      create: { name: edu.name, slug: edu.slug, sortOrder: edu.sortOrder, isActive: true },
    });
  }

  // 4. Seed Employment Statuses (10)
  for (const emp of EMPLOYMENT_STATUSES) {
    await prisma.employmentStatus.upsert({
      where: { slug: emp.slug },
      update: { name: emp.name, sortOrder: emp.sortOrder, isActive: true },
      create: { name: emp.name, slug: emp.slug, sortOrder: emp.sortOrder, isActive: true },
    });
  }

  // 5. Seed Occupations (1)
  for (const occ of OCCUPATIONS) {
    const parentStatus = await prisma.employmentStatus.findUnique({
      where: { slug: occ.employmentStatusSlug },
    });
    if (parentStatus) {
      await prisma.occupation.upsert({
        where: {
          employmentStatusId_slug: {
            employmentStatusId: parentStatus.id,
            slug: occ.slug,
          },
        },
        update: { name: occ.name, sortOrder: occ.sortOrder, isActive: true },
        create: {
          name: occ.name,
          slug: occ.slug,
          employmentStatusId: parentStatus.id,
          sortOrder: occ.sortOrder,
          isActive: true,
        },
      });
    }
  }

  // 6. Seed Languages (21)
  for (const lang of LANGUAGES) {
    await prisma.language.upsert({
      where: { code: lang.code },
      update: { name: lang.name, sortOrder: lang.sortOrder, isActive: true },
      create: { name: lang.name, code: lang.code, sortOrder: lang.sortOrder, isActive: true },
    });
  }

  const total =
    RELIGIONS.length +
    COMMUNITIES.length +
    EDUCATIONS.length +
    EMPLOYMENT_STATUSES.length +
    OCCUPATIONS.length +
    LANGUAGES.length;

  console.log(`[MASTER DATA SEED] Successfully verified/seeded ${total} master records.`);
  return { totalInsertedOrVerified: total };
}
