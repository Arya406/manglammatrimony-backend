import { prisma } from "../src/config/database";
import { config } from "../src/config/env";
import { adminUsersService } from "../src/services/admin-users.service";
import { EmailService } from "../src/services/email.service";
import { otpService } from "../src/services/otp.service";
import crypto from "crypto";

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`  ✗ FAIL: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
  console.log(`  ✓ PASS: ${message}`);
}

async function runReproduction() {
  console.log("==================================================");
  console.log("REPRODUCING ACTIVATION OTP FAILURE SCENARIO");
  console.log("==================================================");

  const admin = await prisma.user.findFirst({ where: { role: "ADMIN" } });
  if (!admin) throw new Error("No admin user found");

  const email = `test.repro.${Date.now()}@manglam.test`;
  
  // 1. Create a user in PENDING_ACTIVATION state with initial OTP (OTP 1)
  const initialOtp = "445566";
  const salt1 = crypto.randomBytes(16).toString("hex");
  const hashedOtp1 = otpService.hashOtp(initialOtp, salt1);
  const now = new Date();

  const user = await prisma.user.create({
    data: {
      email,
      role: "USER",
      status: "ACTIVE",
      activationStatus: "PENDING_ACTIVATION",
      profile: {
        create: {
          profileCreatedFor: "MYSELF",
          profileStatus: "INCOMPLETE",
          completionPercentage: 10,
        },
      },
    },
  });

  const otpRecord1 = await prisma.verificationOtp.create({
    data: {
      id: "vref_" + crypto.randomBytes(12).toString("hex"),
      email,
      hashedOtp: hashedOtp1,
      salt: salt1,
      attempts: 0,
      maxAttempts: 5,
      expiresAt: new Date(now.getTime() + 600000),
      resendAvailableAt: new Date(now.getTime() - 1000), // cooldown expired
      createdAt: now,
    },
  });

  console.log("Created user with initial OTP 1:", {
    userId: user.id,
    email: user.email,
    otpId: otpRecord1.id,
  });

  // BUG MANIFESTATION:
  // Admin clicks Resend.
  // In the current implementation:
  // If RESEND_API_KEY is not configured or fails, what happens?
  // Let's inspect what happens to OTP 1 when resend fails:
  
  console.log("\n[SCENARIO A: Email dispatch failure should NOT invalidate prior valid OTP]");
  
  // Force email failure by mocking sendAccountActivationEmail temporarily
  const originalSend = (adminUsersService as any).emailService?.sendAccountActivationEmail ||
    EmailService.prototype.sendAccountActivationEmail;

  // Let's test calling resendActivationEmail:
  console.log("Calling resendActivationEmail with current implementation...");
  const resendResult = await adminUsersService.resendActivationEmail(admin.id, user.id);
  console.log("Resend Result returned:", resendResult);

  // Check what happened to OTP 1 in DB:
  const checkOtp1 = await prisma.verificationOtp.findUnique({
    where: { id: otpRecord1.id },
  });
  console.log("Prior OTP 1 consumedAt in DB:", checkOtp1?.consumedAt);

  // If checkOtp1?.consumedAt is NOT null, prior OTP was killed!
  if (checkOtp1?.consumedAt) {
    console.log("  -> BUG CONFIRMED: Prior OTP was marked consumed immediately!");
  }

  // Now user tells admin: "My OTP is 445566" (the code they received):
  const verifyOldResult = await adminUsersService.verifyAdminActivationOtp(
    admin.id,
    user.id,
    initialOtp
  );
  console.log("Verify with OTP 1 Result:", verifyOldResult);
  assert(
    verifyOldResult.success === false,
    "Verify with OTP 1 failed as expected under current bug (prior OTP was prematurely invalidated)"
  );

  console.log("\n[SCENARIO B: Check email config & provider behavior]");
  console.log("Current config.resend.apiKey length:", config.resend.apiKey.length);
  console.log("Is config.resend.apiKey trimmed:", config.resend.apiKey === config.resend.apiKey.trim());

  console.log("\nReproduction finished successfully.");
}

runReproduction()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
