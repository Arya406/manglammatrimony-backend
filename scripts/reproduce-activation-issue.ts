import { prisma } from "../src/config/database";
import { adminUsersService } from "../src/services/admin-users.service";
import { EmailService } from "../src/services/email.service";

async function reproduce() {
  console.log("=== SIMULATING EXACT USER SCENARIO ===");

  const admin = await prisma.user.findFirst({
    where: { role: "ADMIN" },
  });
  if (!admin) throw new Error("No admin user found");

  const user = await prisma.user.findUnique({
    where: { email: "arya@gmail.com" },
  });
  if (!user || !user.email) throw new Error("User arya@gmail.com not found or has no email");

  console.log("1. Calling adminUsersService.resendActivationEmail...");
  EmailService.clearTestInbox();
  
  const resendResult = await adminUsersService.resendActivationEmail(admin.id, user.id);
  console.log("Resend Result:", resendResult);

  // Check DB record
  const latestOtp = await prisma.verificationOtp.findFirst({
    where: { email: user.email, consumedAt: null },
    orderBy: { createdAt: "desc" },
  });
  console.log("Latest OTP in DB:", {
    id: latestOtp?.id,
    email: latestOtp?.email,
    attempts: latestOtp?.attempts,
    expiresAt: latestOtp?.expiresAt,
    consumedAt: latestOtp?.consumedAt,
    createdAt: latestOtp?.createdAt,
  });

  // Check dispatched email
  const inbox = EmailService.getTestInbox(user.email);
  console.log("Emails dispatched to user:", inbox.length);
  if (inbox.length === 0) {
    console.log("WARNING: No email was dispatched to EmailService.testInbox!");
  } else {
    const lastEmail = inbox[inbox.length - 1];
    console.log("Last dispatched email type:", lastEmail.type);
    console.log("Last dispatched OTP length:", lastEmail.otp?.length);
    
    console.log("2. Calling adminUsersService.verifyAdminActivationOtp with the dispatched OTP...");
    const verifyResult = await adminUsersService.verifyAdminActivationOtp(
      admin.id,
      user.id,
      lastEmail.otp
    );
    console.log("Verification Result:", verifyResult);
  }
}

reproduce()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
