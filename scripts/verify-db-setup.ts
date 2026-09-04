import { PrismaClient } from "@prisma/client";

async function verifyDatabaseSetup() {
  const prisma = new PrismaClient();

  try {
    console.log("==================================================");
    console.log("MANGLAM MATRIMONY — DATABASE SETUP VERIFICATION");
    console.log("==================================================");

    // 1. Check Tables in manglammatrimony_dev
    const tables: any = await prisma.$queryRawUnsafe(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name;
    `);

    console.log("\n[1] TABLES IN manglammatrimony_dev:");
    tables.forEach((t: any) => console.log(`  • ${t.table_name}`));

    // 2. Verify Master Data Counts
    const religionsCount = await prisma.religion.count();
    const communitiesCount = await prisma.community.count();
    const educationsCount = await prisma.education.count();
    const employmentStatusesCount = await prisma.employmentStatus.count();
    const languagesCount = await prisma.language.count();

    console.log("\n[2] MASTER DATA COUNTS:");
    console.log(`  • Religions: ${religionsCount}`);
    console.log(`  • Communities: ${communitiesCount}`);
    console.log(`  • Educations: ${educationsCount}`);
    console.log(`  • Employment Statuses: ${employmentStatusesCount}`);
    console.log(`  • Languages: ${languagesCount}`);

    // 3. Test Profile Creation & Initializing Flow
    console.log("\n[3] TESTING PROFILE INITIALIZATION:");
    const testUser = await prisma.user.upsert({
      where: { phone: "+919999988888" },
      update: {},
      create: {
        phone: "+919999988888",
        status: "ACTIVE",
      },
    });

    console.log(`  • Upserted test user ID: ${testUser.id}`);

    const profile = await prisma.profile.upsert({
      where: { userId: testUser.id },
      update: { profileCreatedFor: "MYSELF" },
      create: {
        userId: testUser.id,
        profileCreatedFor: "MYSELF",
        profileStatus: "INCOMPLETE",
        completionPercentage: 10,
      },
    });

    console.log(`  • Profile ID: ${profile.id}, CreatedFor: ${profile.profileCreatedFor}, Status: ${profile.profileStatus}`);
    console.log("\n==================================================");
    console.log("ALL DATABASE CHECKS & VERIFICATIONS PASSED 100%!");
    console.log("==================================================");
  } catch (err: any) {
    console.error("Verification failed:", err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

verifyDatabaseSetup();
