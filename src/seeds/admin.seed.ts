import bcrypt from "bcryptjs";
import { prisma } from "../config/database";
import { UserRole, UserStatus } from "@prisma/client";

/**
 * Idempotently bootstraps the platform administrator account.
 * Credentials MUST be supplied via environment variables (ADMIN_EMAIL, ADMIN_PASSWORD).
 * Does NOT create a matrimonial Profile for the administrative user.
 */
export async function seedAdminAccount(): Promise<{ success: boolean; email: string }> {
  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!adminEmail || !adminPassword) {
    throw new Error(
      "[ADMIN BOOTSTRAP ERROR] Missing required environment variables: ADMIN_EMAIL and ADMIN_PASSWORD must be defined."
    );
  }

  const normalizedEmail = adminEmail.trim().toLowerCase();
  const passwordHash = await bcrypt.hash(adminPassword, 10);

  const admin = await prisma.user.upsert({
    where: { email: normalizedEmail },
    update: {
      role: UserRole.ADMIN,
      status: UserStatus.ACTIVE,
      passwordHash,
      emailVerifiedAt: new Date(),
    },
    create: {
      email: normalizedEmail,
      role: UserRole.ADMIN,
      status: UserStatus.ACTIVE,
      passwordHash,
      emailVerifiedAt: new Date(),
    },
  });

  console.log(`[ADMIN BOOTSTRAP] Admin account verified and active for: ${admin.email}`);
  return { success: true, email: admin.email || normalizedEmail };
}
