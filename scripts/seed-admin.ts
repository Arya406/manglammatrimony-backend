import "dotenv/config";
import { prisma } from "../src/config/database";
import { seedAdminAccount } from "../src/seeds/admin.seed";

async function main() {
  console.log("==================================================");
  console.log("MANGLAM MATRIMONY — ADMIN BOOTSTRAP PROCESS");
  console.log("==================================================");

  try {
    const result = await seedAdminAccount();
    console.log(`✓ Completed successfully for admin account.`);
  } catch (error) {
    console.error("✗ Admin bootstrap failed:", error instanceof Error ? error.message : error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
