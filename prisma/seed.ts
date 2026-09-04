import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// ==============================================================================
// 1. RELIGIONS MASTER DATA
// ==============================================================================
const RELIGIONS = [
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
// 2. COMMUNITIES MASTER DATA (Initial product specification seed)
// Note: religionId is left unmapped/null where not explicitly specified by product
// ==============================================================================
const COMMUNITIES = [
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
// 3. EDUCATIONS MASTER DATA
// ==============================================================================
const EDUCATIONS = [
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
// 4. EMPLOYMENT STATUS MASTER DATA
// ==============================================================================
const EMPLOYMENT_STATUSES = [
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
// 5. LANGUAGES MASTER DATA (Mother tongue and spoken languages)
// ==============================================================================
const LANGUAGES = [
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

export async function main() {
  console.log("==================================================");
  console.log("MANGLAM MATRIMONY — DATABASE MASTER DATA SEED");
  console.log("==================================================");

  // 1. Seed Religions
  console.log("[SEEDING] Religions...");
  for (const rel of RELIGIONS) {
    await prisma.religion.upsert({
      where: { slug: rel.slug },
      update: { name: rel.name, sortOrder: rel.sortOrder, isActive: true },
      create: { name: rel.name, slug: rel.slug, sortOrder: rel.sortOrder, isActive: true },
    });
  }
  console.log(`✓ Seeded ${RELIGIONS.length} religions`);

  // 2. Seed Communities
  console.log("[SEEDING] Communities...");
  for (const com of COMMUNITIES) {
    await prisma.community.upsert({
      where: { slug: com.slug },
      update: { name: com.name, sortOrder: com.sortOrder, isActive: true },
      create: { name: com.name, slug: com.slug, sortOrder: com.sortOrder, isActive: true },
    });
  }
  console.log(`✓ Seeded ${COMMUNITIES.length} communities`);

  // 3. Seed Educations
  console.log("[SEEDING] Educations...");
  for (const edu of EDUCATIONS) {
    await prisma.education.upsert({
      where: { slug: edu.slug },
      update: { name: edu.name, sortOrder: edu.sortOrder, isActive: true },
      create: { name: edu.name, slug: edu.slug, sortOrder: edu.sortOrder, isActive: true },
    });
  }
  console.log(`✓ Seeded ${EDUCATIONS.length} educations`);

  // 4. Seed Employment Statuses
  console.log("[SEEDING] Employment Statuses...");
  for (const emp of EMPLOYMENT_STATUSES) {
    await prisma.employmentStatus.upsert({
      where: { slug: emp.slug },
      update: { name: emp.name, sortOrder: emp.sortOrder, isActive: true },
      create: { name: emp.name, slug: emp.slug, sortOrder: emp.sortOrder, isActive: true },
    });
  }
  console.log(`✓ Seeded ${EMPLOYMENT_STATUSES.length} employment statuses`);

  // 5. Seed Languages
  console.log("[SEEDING] Languages...");
  for (const lang of LANGUAGES) {
    await prisma.language.upsert({
      where: { code: lang.code },
      update: { name: lang.name, sortOrder: lang.sortOrder, isActive: true },
      create: { name: lang.name, code: lang.code, sortOrder: lang.sortOrder, isActive: true },
    });
  }
  console.log(`✓ Seeded ${LANGUAGES.length} languages`);

  // 6. Seed Discovery Candidates (Priya, Ananya, Neha, Riya, Kavya, Meera)
  console.log("[SEEDING] Sample Discovery Candidates in PostgreSQL...");
  const hindu = await prisma.religion.findFirst({ where: { slug: "hindu" } });
  const brahmin = await prisma.community.findFirst({ where: { slug: "brahmin" } });
  const hindi = await prisma.language.findFirst({ where: { code: "hi" } });

  const CANDIDATES = [
    {
      profileId: "profile-sample-priya-01",
      phone: "+919999000001",
      email: "priya.sharma@example.com",
      firstName: "Priya",
      lastName: "Sharma",
      gender: "FEMALE" as const,
      dob: new Date("1998-05-15"),
      heightCm: 165,
      city: "Jaipur",
      state: "Rajasthan",
      income: "TEN_TO_FIFTEEN_LAKH" as const,
    },
    {
      profileId: "profile-sample-ananya-02",
      phone: "+919999000002",
      email: "ananya.agarwal@example.com",
      firstName: "Ananya",
      lastName: "Agarwal",
      gender: "FEMALE" as const,
      dob: new Date("1999-03-20"),
      heightCm: 162,
      city: "Delhi",
      state: "Delhi",
      income: "FIFTEEN_TO_TWENTY_LAKH" as const,
    },
    {
      profileId: "profile-sample-neha-03",
      phone: "+919999000003",
      email: "neha.rathore@example.com",
      firstName: "Neha",
      lastName: "Rathore",
      gender: "FEMALE" as const,
      dob: new Date("1997-08-10"),
      heightCm: 168,
      city: "Udaipur",
      state: "Rajasthan",
      income: "TWENTY_TO_THIRTY_LAKH" as const,
    },
    {
      profileId: "profile-sample-riya-04",
      phone: "+919999000004",
      email: "riya.saxena@example.com",
      firstName: "Riya",
      lastName: "Saxena",
      gender: "FEMALE" as const,
      dob: new Date("2000-01-25"),
      heightCm: 160,
      city: "Indore",
      state: "Madhya Pradesh",
      income: "FIVE_TO_TEN_LAKH" as const,
    },
    {
      profileId: "profile-sample-kavya-05",
      phone: "+919999000005",
      email: "kavya.maheshwari@example.com",
      firstName: "Kavya",
      lastName: "Maheshwari",
      gender: "FEMALE" as const,
      dob: new Date("1996-11-12"),
      heightCm: 164,
      city: "Mumbai",
      state: "Maharashtra",
      income: "FIFTEEN_TO_TWENTY_LAKH" as const,
    },
    {
      profileId: "profile-sample-meera-06",
      phone: "+919999000006",
      email: "meera.iyer@example.com",
      firstName: "Meera",
      lastName: "Iyer",
      gender: "FEMALE" as const,
      dob: new Date("1998-09-05"),
      heightCm: 167,
      city: "Bengaluru",
      state: "Karnataka",
      income: "PREFER_NOT_TO_SAY" as const,
    },
  ];

  for (const c of CANDIDATES) {
    // 1. Upsert user
    const user = await prisma.user.upsert({
      where: { phone: c.phone },
      update: {
        status: "ACTIVE",
        email: c.email,
        emailVerifiedAt: new Date(),
      },
      create: {
        phone: c.phone,
        email: c.email,
        status: "ACTIVE",
        phoneVerifiedAt: new Date(),
        emailVerifiedAt: new Date(),
      },
    });

    // 2. Upsert profile
    const profile = await prisma.profile.upsert({
      where: { id: c.profileId },
      update: {
        profileStatus: "ACTIVE",
        completionPercentage: 100,
      },
      create: {
        id: c.profileId,
        userId: user.id,
        profileCreatedFor: "MYSELF",
        profileStatus: "ACTIVE",
        completionPercentage: 100,
        submittedAt: new Date(),
      },
    });

    // 3. Upsert personal details including city & state
    await prisma.profilePersonalDetails.upsert({
      where: { profileId: profile.id },
      update: {
        firstName: c.firstName,
        lastName: c.lastName,
        gender: c.gender,
        maritalStatus: "NEVER_MARRIED",
        dateOfBirth: c.dob,
        heightCm: c.heightCm,
        motherTongueId: hindi?.id || "",
        city: c.city,
        state: c.state,
      },
      create: {
        profileId: profile.id,
        firstName: c.firstName,
        lastName: c.lastName,
        gender: c.gender,
        maritalStatus: "NEVER_MARRIED",
        dateOfBirth: c.dob,
        heightCm: c.heightCm,
        motherTongueId: hindi?.id || "",
        city: c.city,
        state: c.state,
      },
    });

    // 4. Upsert religion
    if (hindu) {
      await prisma.profileReligion.upsert({
        where: { profileId: profile.id },
        update: {
          religionId: hindu.id,
          communityId: brahmin?.id,
          manglik: "NO",
        },
        create: {
          profileId: profile.id,
          religionId: hindu.id,
          communityId: brahmin?.id,
          manglik: "NO",
        },
      });
    }

    // 5. Upsert career
    const empStatus = await prisma.employmentStatus.findFirst();
    if (empStatus) {
      await prisma.profileCareer.upsert({
        where: { profileId: profile.id },
        update: {
          employmentStatusId: empStatus.id,
          annualIncomeRange: c.income,
        },
        create: {
          profileId: profile.id,
          employmentStatusId: empStatus.id,
          annualIncomeRange: c.income,
        },
      });
    }
  }
  console.log(`✓ Seeded ${CANDIDATES.length} discovery candidates into PostgreSQL`);

  // Seed Arya Sharma (Test ACTIVE Male User)
  const aryaUser = await prisma.user.upsert({
    where: { phone: "+919888111111" },
    update: {
      status: "ACTIVE",
      email: "arya.sharma@example.com",
      emailVerifiedAt: new Date(),
    },
    create: {
      phone: "+919888111111",
      email: "arya.sharma@example.com",
      status: "ACTIVE",
      phoneVerifiedAt: new Date(),
      emailVerifiedAt: new Date(),
    },
  });

  const aryaProfile = await prisma.profile.upsert({
    where: { userId: aryaUser.id },
    update: { profileStatus: "ACTIVE", completionPercentage: 100 },
    create: {
      userId: aryaUser.id,
      profileCreatedFor: "MYSELF",
      profileStatus: "ACTIVE",
      completionPercentage: 100,
      submittedAt: new Date(),
    },
  });

  await prisma.profilePersonalDetails.upsert({
    where: { profileId: aryaProfile.id },
    update: {
      firstName: "Arya",
      lastName: "Sharma",
      gender: "MALE",
      maritalStatus: "NEVER_MARRIED",
      dateOfBirth: new Date("1995-06-15"),
      heightCm: 178,
      motherTongueId: hindi?.id || "",
      city: "Jaipur",
      state: "Rajasthan",
    },
    create: {
      profileId: aryaProfile.id,
      firstName: "Arya",
      lastName: "Sharma",
      gender: "MALE",
      maritalStatus: "NEVER_MARRIED",
      dateOfBirth: new Date("1995-06-15"),
      heightCm: 178,
      motherTongueId: hindi?.id || "",
      city: "Jaipur",
      state: "Rajasthan",
    },
  });

  console.log("✓ Seeded Arya Sharma (arya.sharma@example.com)");

  console.log("==================================================");
  console.log("DATABASE MASTER DATA SEED COMPLETED SUCCESSFULLY!");
  console.log("==================================================");
}

if (require.main === module) {
  main()
    .catch((e) => {
      console.error("[SEED ERROR]:", e);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
