import { prisma } from "../src/config/database";
import { config } from "../src/config/env";
import { EmailService } from "../src/services/email.service";

async function inspect() {
  console.log("=== COMPREHENSIVE ACTIVATION OTP INSPECTION ===");
  
  console.log("Environment Config:");
  console.log({
    nodeEnv: config.nodeEnv,
    hasResendApiKey: Boolean(config.resend.apiKey && config.resend.apiKey.trim()),
    fromEmail: config.resend.fromEmail,
    devDummyOtpEnabled: config.devDummyOtpEnabled,
  });

  const user = await prisma.user.findUnique({
    where: { email: "arya@gmail.com" },
    include: {
      profile: {
        include: {
          personalDetails: true,
        },
      },
    },
  });

  console.log("\nUser arya@gmail.com:");
  console.log({
    id: user?.id,
    email: user?.email,
    role: user?.role,
    status: user?.status,
    activationStatus: user?.activationStatus,
    emailVerifiedAt: user?.emailVerifiedAt,
    activatedAt: user?.activatedAt,
    activatedByUserId: user?.activatedByUserId,
    statusChangedAt: user?.statusChangedAt,
    statusChangedByUserId: user?.statusChangedByUserId,
    createdAt: user?.createdAt,
    updatedAt: user?.updatedAt,
  });

  const allOtps = await prisma.verificationOtp.findMany({
    where: { email: "arya@gmail.com" },
    orderBy: { createdAt: "desc" },
  });

  console.log(`\nAll Verification Otps for arya@gmail.com (count: ${allOtps.length}):`);
  for (const otp of allOtps) {
    console.log({
      id: otp.id,
      email: otp.email,
      attempts: otp.attempts,
      maxAttempts: otp.maxAttempts,
      expiresAt: otp.expiresAt,
      resendAvailableAt: otp.resendAvailableAt,
      consumedAt: otp.consumedAt,
      createdAt: otp.createdAt,
      updatedAt: otp.updatedAt,
      isExpired: otp.expiresAt < new Date(),
      isConsumed: Boolean(otp.consumedAt),
    });
  }

  console.log("\nRecent Test Inbox items (last 5):");
  const testInbox = EmailService.getTestInbox("arya@gmail.com");
  console.log(
    testInbox.slice(-5).map((item) => ({
      to: item.to,
      type: item.type,
      dispatchedAt: item.dispatchedAt,
    }))
  );
}

inspect()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
