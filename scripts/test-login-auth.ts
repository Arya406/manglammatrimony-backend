import express from "express";
import cors from "cors";
import http from "http";
import jwt from "jsonwebtoken";
import { prisma } from "../src/config/database";
import { config } from "../src/config/env";
import { authRouter } from "../src/routes/auth.routes";
import { profileRouter } from "../src/routes/profile.routes";
import { authMiddleware } from "../src/middlewares/auth.middleware";
import { UserStatus } from "@prisma/client";

const PORT = 5544;
const BASE_URL = `http://127.0.0.1:${PORT}`;

async function runLoginTestSuite() {
  console.log("===============================================================");
  console.log("MANGLAM MATRIMONY — LOGIN & AUTHENTICATION TEST BATTERY");
  console.log("===============================================================");

  const app = express();
  app.use(cors());
  app.use(express.json());
  app.use("/api/auth", authRouter);
  app.use("/api/profile", authMiddleware, profileRouter);

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(PORT, resolve));
  console.log(`[TEST SERVER] Running on port ${PORT}`);

  try {
    // 0. Ensure database connection & cleanup previous test data
    await prisma.$connect();
    const testPhone = "+919876500001";
    const testEmail = "existing.user@manglam.com";

    // Clean up if exist
    await prisma.user.deleteMany({
      where: {
        OR: [
          { phone: { in: [testPhone, "+919876500002", "+919876500003", "+919876500004", "+919876500099"] } },
          { email: { in: [testEmail, "suspended@manglam.com", "blocked@manglam.com", "deleted@manglam.com"] } },
        ],
      },
    });

    // 1. Setup Test Users
    // 1a. Active Phone + Email User
    const activeUser = await prisma.user.create({
      data: {
        phone: testPhone,
        email: testEmail,
        status: UserStatus.ACTIVE,
        phoneVerifiedAt: new Date(),
        emailVerifiedAt: new Date(),
      },
    });

    // Create an associated profile for activeUser
    const activeProfile = await prisma.profile.create({
      data: {
        userId: activeUser.id,
        profileCreatedFor: "MYSELF",
        profileStatus: "INCOMPLETE",
        completionPercentage: 10,
      },
    });

    // 1b. Suspended User
    const suspendedUser = await prisma.user.create({
      data: {
        phone: "+919876500002",
        email: "suspended@manglam.com",
        status: UserStatus.SUSPENDED,
        phoneVerifiedAt: new Date(),
      },
    });

    // 1c. Blocked User
    const blockedUser = await prisma.user.create({
      data: {
        phone: "+919876500003",
        email: "blocked@manglam.com",
        status: UserStatus.BLOCKED,
        phoneVerifiedAt: new Date(),
      },
    });

    // 1d. Deleted User
    const deletedUser = await prisma.user.create({
      data: {
        phone: "+919876500004",
        email: "deleted@manglam.com",
        status: UserStatus.DELETED,
        phoneVerifiedAt: new Date(),
      },
    });

    console.log(`[INIT] Created active user ID: ${activeUser.id}`);
    console.log(`[INIT] Created suspended user ID: ${suspendedUser.id}`);
    console.log(`[INIT] Created blocked user ID: ${blockedUser.id}`);
    console.log(`[INIT] Created deleted user ID: ${deletedUser.id}`);

    // Track total users count before any login attempts
    const userCountBefore = await prisma.user.count();

    // -------------------------------------------------------------
    // SCENARIO 1: Request Login OTP with Valid Existing Phone
    // -------------------------------------------------------------
    console.log("\n[SCENARIO 1] Request Login OTP with Valid Existing Phone");
    const phoneReqRes = await fetch(`${BASE_URL}/api/auth/login/request-otp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: testPhone }),
    });
    const phoneReqJson = await phoneReqRes.json();
    console.log(`  ✓ Status: ${phoneReqRes.status} | Success: ${phoneReqJson.success} | VerificationId: ${phoneReqJson.data?.verificationId}`);
    if (phoneReqRes.status !== 200 || !phoneReqJson.data?.verificationId) {
      throw new Error("Scenario 1 Failed: Expected 200 and verificationId");
    }
    const phoneVerificationId = phoneReqJson.data.verificationId;

    // -------------------------------------------------------------
    // SCENARIO 2: Request Login OTP with Valid Existing Email
    // -------------------------------------------------------------
    console.log("\n[SCENARIO 2] Request Login OTP with Valid Existing Email");
    const emailReqRes = await fetch(`${BASE_URL}/api/auth/login/request-otp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: testEmail }),
    });
    const emailReqJson = await emailReqRes.json();
    console.log(`  ✓ Status: ${emailReqRes.status} | Success: ${emailReqJson.success} | VerificationId: ${emailReqJson.data?.verificationId}`);
    if (emailReqRes.status !== 200 || !emailReqJson.data?.verificationId) {
      throw new Error("Scenario 2 Failed: Expected 200 and verificationId");
    }

    // -------------------------------------------------------------
    // SCENARIO 3: Request Login OTP for Unknown Phone (Must return 404 USER_NOT_FOUND)
    // -------------------------------------------------------------
    console.log("\n[SCENARIO 3] Request Login OTP for Unknown Phone");
    const unknownPhoneRes = await fetch(`${BASE_URL}/api/auth/login/request-otp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: "+919999999999" }),
    });
    const unknownPhoneJson = await unknownPhoneRes.json();
    console.log(`  ✓ Status: ${unknownPhoneRes.status} (Expected 404) | Code: ${unknownPhoneJson.code}`);
    if (unknownPhoneRes.status !== 404 || unknownPhoneJson.code !== "USER_NOT_FOUND") {
      throw new Error("Scenario 3 Failed: Expected 404 USER_NOT_FOUND");
    }

    // -------------------------------------------------------------
    // SCENARIO 4: Request Login OTP for Unknown Email (Must return 404 USER_NOT_FOUND)
    // -------------------------------------------------------------
    console.log("\n[SCENARIO 4] Request Login OTP for Unknown Email");
    const unknownEmailRes = await fetch(`${BASE_URL}/api/auth/login/request-otp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "unknown.account@manglam.com" }),
    });
    const unknownEmailJson = await unknownEmailRes.json();
    console.log(`  ✓ Status: ${unknownEmailRes.status} (Expected 404) | Code: ${unknownEmailJson.code}`);
    if (unknownEmailRes.status !== 404 || unknownEmailJson.code !== "USER_NOT_FOUND") {
      throw new Error("Scenario 4 Failed: Expected 404 USER_NOT_FOUND");
    }

    // -------------------------------------------------------------
    // SCENARIO 5: Invalid Phone Format (Must return 400 INVALID_PHONE)
    // -------------------------------------------------------------
    console.log("\n[SCENARIO 5] Invalid Phone Format");
    const invalidPhoneRes = await fetch(`${BASE_URL}/api/auth/login/request-otp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: "123" }),
    });
    const invalidPhoneJson = await invalidPhoneRes.json();
    console.log(`  ✓ Status: ${invalidPhoneRes.status} (Expected 400) | Code: ${invalidPhoneJson.code}`);
    if (invalidPhoneRes.status !== 400 || invalidPhoneJson.code !== "INVALID_PHONE") {
      throw new Error("Scenario 5 Failed: Expected 400 INVALID_PHONE");
    }

    // -------------------------------------------------------------
    // SCENARIO 6: Invalid Email Format (Must return 400 INVALID_EMAIL)
    // -------------------------------------------------------------
    console.log("\n[SCENARIO 6] Invalid Email Format");
    const invalidEmailRes = await fetch(`${BASE_URL}/api/auth/login/request-otp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "invalid-email" }),
    });
    const invalidEmailJson = await invalidEmailRes.json();
    console.log(`  ✓ Status: ${invalidEmailRes.status} (Expected 400) | Code: ${invalidEmailJson.code}`);
    if (invalidEmailRes.status !== 400 || invalidEmailJson.code !== "INVALID_EMAIL") {
      throw new Error("Scenario 6 Failed: Expected 400 INVALID_EMAIL");
    }

    // -------------------------------------------------------------
    // SCENARIO 7: Simultaneous Phone and Email in Same Request (Must return 400 INVALID_INPUT)
    // -------------------------------------------------------------
    console.log("\n[SCENARIO 7] Simultaneous Phone and Email Payload");
    const dualInputRes = await fetch(`${BASE_URL}/api/auth/login/request-otp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: testPhone, email: testEmail }),
    });
    const dualInputJson = await dualInputRes.json();
    console.log(`  ✓ Status: ${dualInputRes.status} (Expected 400) | Code: ${dualInputJson.code}`);
    if (dualInputRes.status !== 400 || dualInputJson.code !== "INVALID_INPUT") {
      throw new Error("Scenario 7 Failed: Expected 400 INVALID_INPUT");
    }

    // -------------------------------------------------------------
    // SCENARIO 8: Suspended User Login Request (Must return 403 ACCOUNT_SUSPENDED)
    // -------------------------------------------------------------
    console.log("\n[SCENARIO 8] Suspended User Login Request");
    const suspendedRes = await fetch(`${BASE_URL}/api/auth/login/request-otp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: "+919876500002" }),
    });
    const suspendedJson = await suspendedRes.json();
    console.log(`  ✓ Status: ${suspendedRes.status} (Expected 403) | Code: ${suspendedJson.code}`);
    if (suspendedRes.status !== 403 || suspendedJson.code !== "ACCOUNT_SUSPENDED") {
      throw new Error("Scenario 8 Failed: Expected 403 ACCOUNT_SUSPENDED");
    }

    // -------------------------------------------------------------
    // SCENARIO 9: Blocked User Login Request (Must return 403 ACCOUNT_BLOCKED)
    // -------------------------------------------------------------
    console.log("\n[SCENARIO 9] Blocked User Login Request");
    const blockedRes = await fetch(`${BASE_URL}/api/auth/login/request-otp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: "+919876500003" }),
    });
    const blockedJson = await blockedRes.json();
    console.log(`  ✓ Status: ${blockedRes.status} (Expected 403) | Code: ${blockedJson.code}`);
    if (blockedRes.status !== 403 || blockedJson.code !== "ACCOUNT_BLOCKED") {
      throw new Error("Scenario 9 Failed: Expected 403 ACCOUNT_BLOCKED");
    }

    // -------------------------------------------------------------
    // SCENARIO 10: Deleted User Login Request (Must return 403 ACCOUNT_DELETED)
    // -------------------------------------------------------------
    console.log("\n[SCENARIO 10] Deleted User Login Request");
    const deletedRes = await fetch(`${BASE_URL}/api/auth/login/request-otp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: "+919876500004" }),
    });
    const deletedJson = await deletedRes.json();
    console.log(`  ✓ Status: ${deletedRes.status} (Expected 403) | Code: ${deletedJson.code}`);
    if (deletedRes.status !== 403 || deletedJson.code !== "ACCOUNT_DELETED") {
      throw new Error("Scenario 10 Failed: Expected 403 ACCOUNT_DELETED");
    }

    // -------------------------------------------------------------
    // SCENARIO 11: Invalid OTP Verification Attempt (Must return 400 INVALID_OTP)
    // -------------------------------------------------------------
    console.log("\n[SCENARIO 11] Invalid OTP Verification Attempt");
    const invalidOtpRes = await fetch(`${BASE_URL}/api/auth/login/verify-otp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ verificationId: phoneVerificationId, otp: "000000" }),
    });
    const invalidOtpJson = await invalidOtpRes.json();
    console.log(`  ✓ Status: ${invalidOtpRes.status} (Expected 400) | Code: ${invalidOtpJson.code}`);
    if (invalidOtpRes.status !== 400 || invalidOtpJson.code !== "INVALID_OTP") {
      throw new Error("Scenario 11 Failed: Expected 400 INVALID_OTP");
    }

    // -------------------------------------------------------------
    // SCENARIO 12: Resend OTP Cooldown Active (Must return 429 COOLDOWN_ACTIVE)
    // -------------------------------------------------------------
    console.log("\n[SCENARIO 12] Resend OTP Cooldown Active");
    const cooldownRes = await fetch(`${BASE_URL}/api/auth/login/resend-otp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ verificationId: phoneVerificationId }),
    });
    const cooldownJson = await cooldownRes.json();
    console.log(`  ✓ Status: ${cooldownRes.status} (Expected 429) | Code: ${cooldownJson.code}`);
    if (cooldownRes.status !== 429 || cooldownJson.code !== "COOLDOWN_ACTIVE") {
      throw new Error("Scenario 12 Failed: Expected 429 COOLDOWN_ACTIVE");
    }

    // -------------------------------------------------------------
    // SCENARIO 13: Valid OTP Verification & Login
    // -------------------------------------------------------------
    console.log("\n[SCENARIO 13] Valid OTP Verification & Login for Active User");
    // Retrieve the session from memory to know the exact test OTP
    const { otpRepository } = await import("../src/repositories/otp.repository");
    const session = await otpRepository.findById(phoneVerificationId);
    if (!session) throw new Error("Could not find in-flight OTP session");

    // In local dev/test environment, the plain OTP is logged or testable via hashing
    // Let's create a fresh request where we capture the OTP from the dev provider
    let capturedOtp = "";
    const originalLog = console.log;
    console.log = (...args: any[]) => {
      originalLog(...args);
      const str = args.join(" ");
      const match = str.match(/Verification OTP: \[\s*(\d{6})\s*\]/);
      if (match) {
        capturedOtp = match[1];
      }
    };

    const freshReqRes = await fetch(`${BASE_URL}/api/auth/login/request-otp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: testPhone }),
    });
    const freshReqJson = await freshReqRes.json();
    console.log = originalLog; // Restore

    const freshVerificationId = freshReqJson.data.verificationId;
    console.log(`  Dispatched OTP: [ ${capturedOtp} ] for verificationId: ${freshVerificationId}`);

    const verifySuccessRes = await fetch(`${BASE_URL}/api/auth/login/verify-otp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ verificationId: freshVerificationId, otp: capturedOtp }),
    });
    const verifySuccessJson = await verifySuccessRes.json();
    console.log(`  ✓ Status: ${verifySuccessRes.status} | Success: ${verifySuccessJson.success}`);
    console.log(`  ✓ Returned User ID: ${verifySuccessJson.data?.user?.id}`);
    console.log(`  ✓ Expected User ID: ${activeUser.id}`);

    if (verifySuccessRes.status !== 200 || verifySuccessJson.data?.user?.id !== activeUser.id) {
      throw new Error("Scenario 13 Failed: Returned user ID does not match PostgreSQL users.id");
    }

    const issuedJwt = verifySuccessJson.data.token;

    // -------------------------------------------------------------
    // SCENARIO 14: Confirm NO DUPLICATE USER was created in PostgreSQL
    // -------------------------------------------------------------
    console.log("\n[SCENARIO 14] Confirm Zero Duplicate Users in PostgreSQL");
    const userCountAfter = await prisma.user.count();
    console.log(`  ✓ User count before: ${userCountBefore} | User count after: ${userCountAfter}`);
    if (userCountAfter !== userCountBefore) {
      throw new Error("Scenario 14 Failed: Login created a duplicate user row!");
    }

    const phoneUsersInDb = await prisma.user.findMany({ where: { phone: testPhone } });
    console.log(`  ✓ Exactly 1 user found with phone ${testPhone}: ID = ${phoneUsersInDb[0].id}`);
    if (phoneUsersInDb.length !== 1 || phoneUsersInDb[0].id !== activeUser.id) {
      throw new Error("Scenario 14 Failed: Duplicate phone user found in DB!");
    }

    // -------------------------------------------------------------
    // SCENARIO 15: JWT Identity Verification
    // -------------------------------------------------------------
    console.log("\n[SCENARIO 15] JWT Identity & Claims Verification");
    const decoded: any = jwt.verify(issuedJwt, config.jwtSecret);
    console.log(`  ✓ Decoded JWT userId: ${decoded.userId}`);
    console.log(`  ✓ PostgreSQL users.id: ${activeUser.id}`);
    console.log(`  ✓ Decoded status: ${decoded.status}`);
    if (decoded.userId !== activeUser.id || decoded.status !== "ACTIVE") {
      throw new Error("Scenario 15 Failed: JWT claims do not match PostgreSQL user row");
    }

    // -------------------------------------------------------------
    // SCENARIO 16: Authenticated GET /api/profile using Login JWT
    // -------------------------------------------------------------
    console.log("\n[SCENARIO 16] Authenticated GET /api/profile using Login JWT");
    const profileRes = await fetch(`${BASE_URL}/api/profile`, {
      headers: { Authorization: `Bearer ${issuedJwt}` },
    });
    const profileJson = await profileRes.json();
    console.log(`  ✓ Status: ${profileRes.status} | Profile ID: ${profileJson.data?.profile?.id} | CreatedFor: ${profileJson.data?.profile?.profileCreatedFor}`);
    if (profileRes.status !== 200 || profileJson.data?.profile?.id !== activeProfile.id) {
      throw new Error("Scenario 16 Failed: Profile returned does not match activeProfile.id");
    }

    // -------------------------------------------------------------
    // SCENARIO 17: Cross-User Profile Isolation
    // -------------------------------------------------------------
    console.log("\n[SCENARIO 17] Cross-User Profile Isolation");
    // Create a second separate user with their own profile
    const user2 = await prisma.user.create({
      data: {
        phone: "+919876500099",
        status: UserStatus.ACTIVE,
      },
    });
    const user2Profile = await prisma.profile.create({
      data: {
        userId: user2.id,
        profileCreatedFor: "MY_DAUGHTER",
        profileStatus: "INCOMPLETE",
        completionPercentage: 10,
      },
    });
    const user2Token = jwt.sign(
      { userId: user2.id, status: user2.status },
      config.jwtSecret,
      { expiresIn: "1h" }
    );

    const user2ProfileRes = await fetch(`${BASE_URL}/api/profile`, {
      headers: { Authorization: `Bearer ${user2Token}` },
    });
    const user2ProfileJson = await user2ProfileRes.json();
    console.log(`  ✓ User 2 Profile ID: ${user2ProfileJson.data?.profile?.id} (Expected ${user2Profile.id})`);
    console.log(`  ✓ User 2 CreatedFor: ${user2ProfileJson.data?.profile?.profileCreatedFor} (Expected MY_DAUGHTER)`);
    if (user2ProfileJson.data?.profile?.id !== user2Profile.id || user2ProfileJson.data?.profile?.id === activeProfile.id) {
      throw new Error("Scenario 17 Failed: User isolation violated");
    }

    // -------------------------------------------------------------
    // SCENARIO 18: Used OTP Session Invalidation
    // -------------------------------------------------------------
    console.log("\n[SCENARIO 18] Reusing Already-Consumed OTP Session");
    const reuseOtpRes = await fetch(`${BASE_URL}/api/auth/login/verify-otp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ verificationId: freshVerificationId, otp: capturedOtp }),
    });
    const reuseOtpJson = await reuseOtpRes.json();
    console.log(`  ✓ Status: ${reuseOtpRes.status} (Expected 410) | Code: ${reuseOtpJson.code}`);
    if (reuseOtpRes.status !== 410 || reuseOtpJson.code !== "OTP_EXPIRED") {
      throw new Error("Scenario 18 Failed: Consumed OTP was not invalidated");
    }

    // Clean up test data
    await prisma.user.deleteMany({
      where: {
        id: { in: [activeUser.id, suspendedUser.id, blockedUser.id, deletedUser.id, user2.id] },
      },
    });
    console.log("\n[CLEANUP] Deleted test users from PostgreSQL.");

    console.log("\n===============================================================");
    console.log("✅ ALL 18 LOGIN & AUTHENTICATION SCENARIOS PASSED (100%)!");
    console.log("===============================================================");
    server.close();
    await prisma.$disconnect();
    process.exit(0);
  } finally {
    server.close();
    await prisma.$disconnect();
  }
}

runLoginTestSuite().catch((err) => {
  console.error("Test Suite Failure:", err);
  process.exit(1);
});
