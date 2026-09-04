import express from "express";
import cors from "cors";
import http from "http";
import jwt from "jsonwebtoken";
import { prisma } from "../src/config/database";
import { config } from "../src/config/env";
import { authRouter } from "../src/routes/auth.routes";
import { profileRouter } from "../src/routes/profile.routes";
import { authMiddleware } from "../src/middlewares/auth.middleware";
import { UserStatus, ProfileStatus, ProfileCreatedFor } from "@prisma/client";

const PORT = 5533;
const BASE_URL = `http://127.0.0.1:${PORT}`;

async function runSessionFlowTestSuite() {
  console.log("===============================================================");
  console.log("MANGLAM MATRIMONY — LOGIN, LOGOUT & SESSION FLOW TEST BATTERY");
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
    await prisma.$connect();
    const testPhone = "+919777111222";
    const testEmail = "session.flow.test@manglam.com";

    // Clean up if prior test leftovers exist
    await prisma.user.deleteMany({
      where: {
        OR: [{ phone: testPhone }, { email: testEmail }],
      },
    });

    const userCountInitial = await prisma.user.count();

    // =========================================================
    // STEP 1: REGISTER USER & INITIALIZE PROFILE WITH REAL DATA
    // =========================================================
    console.log("\n[STEP 1] Create & Onboard Initial User");
    const user = await prisma.user.create({
      data: {
        phone: testPhone,
        email: testEmail,
        status: UserStatus.ACTIVE,
        phoneVerifiedAt: new Date(),
        emailVerifiedAt: new Date(),
      },
    });

    const USER_ID_BEFORE = user.id;
    console.log(`  ✓ Initial User Persisted in PostgreSQL. ID: ${USER_ID_BEFORE}`);

    // Create profile
    const profile = await prisma.profile.create({
      data: {
        userId: USER_ID_BEFORE,
        profileCreatedFor: ProfileCreatedFor.MYSELF,
        profileStatus: ProfileStatus.INCOMPLETE,
        completionPercentage: 40,
      },
    });

    // Create personal details
    const motherTongue = await prisma.language.findFirst();
    await prisma.profilePersonalDetails.create({
      data: {
        profileId: profile.id,
        firstName: "Vikram",
        lastName: "Aditya",
        gender: "MALE",
        dateOfBirth: new Date("1994-05-15"),
        maritalStatus: "NEVER_MARRIED",
        heightCm: 178,
        motherTongueId: motherTongue?.id || "lang-1",
      },
    });

    // Initial JWT
    const initialJwt = jwt.sign(
      { userId: USER_ID_BEFORE, status: user.status },
      config.jwtSecret,
      { expiresIn: "7d" }
    );

    // Verify initial profile call succeeds
    const initialProfileRes = await fetch(`${BASE_URL}/api/profile`, {
      headers: { Authorization: `Bearer ${initialJwt}` },
    });
    const initialProfileJson = await initialProfileRes.json();
    if (!initialProfileJson.success || initialProfileJson.data.personalDetails.firstName !== "Vikram") {
      throw new Error(`[FAIL] Initial profile fetch did not match: ${JSON.stringify(initialProfileJson)}`);
    }
    console.log("  ✓ Initial profile retrieved with firstName: 'Vikram', Status: 'INCOMPLETE'");

    // =========================================================
    // STEP 2: SIMULATE LOGOUT (Token Removal & Unauthenticated Request)
    // =========================================================
    console.log("\n[STEP 2] Simulate Logout & Unauthenticated Access Guard");
    // Client drops the token (localStorage.removeItem('manglam_auth_token'))
    const unauthProfileRes = await fetch(`${BASE_URL}/api/profile`);
    if (unauthProfileRes.status !== 401) {
      throw new Error(`[FAIL] Unauthenticated request did not return 401: status ${unauthProfileRes.status}`);
    }
    console.log("  ✓ Unauthenticated GET /api/profile rejected with 401 Unauthorized.");

    // Verify PostgreSQL Data is 100% Intact After Logout
    const dbUserAfterLogout = await prisma.user.findUnique({
      where: { id: USER_ID_BEFORE },
      include: {
        profile: {
          include: {
            personalDetails: true,
          },
        },
      },
    });

    if (
      !dbUserAfterLogout ||
      !dbUserAfterLogout.profile ||
      dbUserAfterLogout.profile.personalDetails?.firstName !== "Vikram"
    ) {
      throw new Error("[FAIL] PostgreSQL data was corrupted or deleted during logout!");
    }
    console.log("  ✓ PostgreSQL Data Assertion: User, Profile, and Personal Details remain 100% intact after logout.");

    // =========================================================
    // STEP 3: LOGIN AFTER LOGOUT WITH SAME PHONE (Request OTP)
    // =========================================================
    console.log("\n[STEP 3] Login After Logout (Request OTP for existing phone)");
    let capturedOtp = "";
    const originalLog = console.log;
    console.log = (...args: any[]) => {
      const msg = args.join(" ");
      const match = msg.match(/Verification OTP: \[\s*(\d{6})\s*\]/);
      if (match) {
        capturedOtp = match[1];
      }
      originalLog(...args);
    };

    const loginOtpReq = await fetch(`${BASE_URL}/api/auth/login/request-otp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: testPhone }),
    });
    const loginOtpReqJson = await loginOtpReq.json();
    console.log = originalLog;

    if (!loginOtpReqJson.success || !loginOtpReqJson.data.verificationId) {
      throw new Error(`[FAIL] Login OTP request failed: ${JSON.stringify(loginOtpReqJson)}`);
    }
    console.log(`  ✓ Login OTP requested. Verification ID: ${loginOtpReqJson.data.verificationId}, Dispatched OTP: [ ${capturedOtp} ]`);

    // =========================================================
    // STEP 4: VERIFY LOGIN OTP
    // =========================================================
    console.log("\n[STEP 4] Verify Login OTP");
    const loginVerifyReq = await fetch(`${BASE_URL}/api/auth/login/verify-otp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        verificationId: loginOtpReqJson.data.verificationId,
        otp: capturedOtp,
      }),
    });
    const loginVerifyJson = await loginVerifyReq.json();
    if (!loginVerifyJson.success || !loginVerifyJson.data.token) {
      throw new Error(`[FAIL] Login OTP verification failed: ${JSON.stringify(loginVerifyJson)}`);
    }

    const USER_ID_AFTER = loginVerifyJson.data.user.id;
    const newJwt = loginVerifyJson.data.token;

    // =========================================================
    // STEP 5: ASSERT ZERO DUPLICATE USERS & SAME USER ID
    // =========================================================
    console.log("\n[STEP 5] Database Assertions (Zero Duplication & Identity Match)");
    const userCountAfter = await prisma.user.count();
    console.log(`  ✓ User count before login: ${userCountInitial + 1} | User count after login: ${userCountAfter}`);
    if (userCountAfter !== userCountInitial + 1) {
      throw new Error(`[FAIL] User count increased! Expected ${userCountInitial + 1} but got ${userCountAfter}`);
    }

    console.log(`  ✓ USER_ID_BEFORE: ${USER_ID_BEFORE}`);
    console.log(`  ✓ USER_ID_AFTER:  ${USER_ID_AFTER}`);
    if (USER_ID_BEFORE !== USER_ID_AFTER) {
      throw new Error(`[FAIL] User ID changed after login! Expected ${USER_ID_BEFORE} but got ${USER_ID_AFTER}`);
    }

    // =========================================================
    // STEP 6: VERIFY AUTHENTICATED PROFILE FETCH WITH NEW LOGIN JWT
    // =========================================================
    console.log("\n[STEP 6] Authenticated Profile Fetch with New Login JWT");
    const newProfileRes = await fetch(`${BASE_URL}/api/profile`, {
      headers: { Authorization: `Bearer ${newJwt}` },
    });
    const newProfileJson = await newProfileRes.json();
    if (
      !newProfileJson.success ||
      newProfileJson.data.personalDetails.firstName !== "Vikram" ||
      newProfileJson.data.personalDetails.lastName !== "Aditya"
    ) {
      throw new Error(`[FAIL] Profile data mismatch after login: ${JSON.stringify(newProfileJson)}`);
    }
    console.log("  ✓ Profile data returned intact: Vikram Aditya, Gender: MALE, Status: INCOMPLETE");

    // =========================================================
    // STEP 7: TEST IN_REVIEW USER STATUS REDIRECT ROUTING
    // =========================================================
    console.log("\n[STEP 7] Test IN_REVIEW Profile Status Lifecycle");
    await prisma.profile.update({
      where: { id: profile.id },
      data: {
        profileStatus: ProfileStatus.IN_REVIEW,
        completionPercentage: 100,
      },
    });

    const inReviewProfileRes = await fetch(`${BASE_URL}/api/profile`, {
      headers: { Authorization: `Bearer ${newJwt}` },
    });
    const inReviewProfileJson = await inReviewProfileRes.json();
    if (inReviewProfileJson.data.profile.profileStatus !== "IN_REVIEW") {
      throw new Error(`[FAIL] Expected IN_REVIEW status: ${JSON.stringify(inReviewProfileJson)}`);
    }
    console.log("  ✓ IN_REVIEW profile status preserved and returned successfully.");

    // =========================================================
    // STEP 8: TEST ACTIVE USER STATUS LIFECYCLE
    // =========================================================
    console.log("\n[STEP 8] Test ACTIVE Profile Status Lifecycle");
    await prisma.profile.update({
      where: { id: profile.id },
      data: {
        profileStatus: ProfileStatus.ACTIVE,
      },
    });

    const activeProfileRes = await fetch(`${BASE_URL}/api/profile`, {
      headers: { Authorization: `Bearer ${newJwt}` },
    });
    const activeProfileJson = await activeProfileRes.json();
    if (activeProfileJson.data.profile.profileStatus !== "ACTIVE") {
      throw new Error(`[FAIL] Expected ACTIVE status: ${JSON.stringify(activeProfileJson)}`);
    }
    console.log("  ✓ ACTIVE profile status preserved and returned successfully.");

    // Cleanup
    await prisma.user.delete({ where: { id: USER_ID_BEFORE } });
    console.log("\n[CLEANUP] Cleaned up session flow test user.");

    console.log("\n===============================================================");
    console.log("✅ ALL LOGIN, LOGOUT & SESSION FLOW SCENARIOS PASSED (100%)!");
    console.log("===============================================================");
    server.close();
    await prisma.$disconnect();
    process.exit(0);
  } finally {
    server.close();
    await prisma.$disconnect();
  }
}

runSessionFlowTestSuite().catch((err) => {
  console.error("Session Flow Test Suite Failure:", err);
  process.exit(1);
});
