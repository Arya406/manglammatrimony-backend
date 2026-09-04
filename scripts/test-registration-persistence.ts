import http from "http";
import jwt from "jsonwebtoken";
import { app } from "../src/app";
import { prisma } from "../src/config/database";
import { otpService } from "../src/services/otp.service";
import { DevOtpProvider } from "../src/providers/otp/DevOtpProvider";

async function runRegistrationPersistenceSuite() {
  const PORT = 5588;
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(PORT, resolve));
  console.log(`[TEST SERVER] Running on port ${PORT}`);

  const BASE_URL = `http://localhost:${PORT}`;
  const createdUserIds: string[] = [];

  try {
    console.log("===============================================================");
    console.log("MANGLAM MATRIMONY — USER REGISTRATION PERSISTENCE TEST SUITE");
    console.log("===============================================================");

    const devProvider = (otpService as any).provider as InstanceType<typeof DevOtpProvider>;
    const uniquePhone = `98${Math.floor(10000000 + Math.random() * 90000000)}`;
    const uniqueEmail = `test.user.${Date.now()}@manglam.com`;

    // -------------------------------------------------------------
    // SCENARIO 1: Phone Registration + OTP Verification -> PostgreSQL
    // -------------------------------------------------------------
    console.log(`\n[SCENARIO 1] Phone Registration: ${uniquePhone}`);
    const reqPhoneRes = await fetch(`${BASE_URL}/api/auth/register/request-otp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ method: "phone", identifier: uniquePhone }),
    });
    const reqPhoneJson = await reqPhoneRes.json();
    console.log(`  1.1 Request OTP Status: ${reqPhoneRes.status} | Success: ${reqPhoneJson.success}`);
    if (!reqPhoneJson.success) throw new Error("Phone OTP request failed");

    const phoneVerificationId = reqPhoneJson.data.verificationId;
    const phoneOtp = devProvider.lastOtp;
    console.log(`  1.2 Dispatched OTP: [ ${phoneOtp} ] for verificationId: ${phoneVerificationId}`);

    const verifyPhoneRes = await fetch(`${BASE_URL}/api/auth/register/verify-otp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ verificationId: phoneVerificationId, otp: phoneOtp }),
    });
    const verifyPhoneJson = await verifyPhoneRes.json();
    console.log(`  1.3 Verify OTP Status: ${verifyPhoneRes.status} | Success: ${verifyPhoneJson.success}`);
    if (!verifyPhoneJson.success) throw new Error("Phone OTP verification failed");

    const phoneUser = verifyPhoneJson.data.user;
    const phoneToken = verifyPhoneJson.data.token;
    createdUserIds.push(phoneUser.id);

    // Direct Database Assertion
    const dbPhoneUser = await prisma.user.findUnique({ where: { id: phoneUser.id } });
    if (!dbPhoneUser) throw new Error("SCENARIO 1 FAILED: User row not found in PostgreSQL 'users' table");
    if (dbPhoneUser.phone !== `+91${uniquePhone}`) throw new Error("SCENARIO 1 FAILED: Phone mismatch in DB");
    if (!dbPhoneUser.phoneVerifiedAt) throw new Error("SCENARIO 1 FAILED: phoneVerifiedAt not populated");
    if (dbPhoneUser.status !== "ACTIVE") throw new Error("SCENARIO 1 FAILED: User status not ACTIVE");

    const decodedPhoneJwt = jwt.verify(phoneToken, process.env.JWT_SECRET || "manglam_matrimony_jwt_secret_dev_key_2026_secure") as any;
    if (decodedPhoneJwt.userId !== dbPhoneUser.id) throw new Error("SCENARIO 1 FAILED: JWT userId != DB user.id");
    console.log(`  ✓ SCENARIO 1 PASSED: Phone user persisted in PostgreSQL with ID: ${dbPhoneUser.id}`);

    // -------------------------------------------------------------
    // SCENARIO 2: Email Registration + OTP Verification -> PostgreSQL
    // -------------------------------------------------------------
    console.log(`\n[SCENARIO 2] Email Registration: ${uniqueEmail}`);
    const reqEmailRes = await fetch(`${BASE_URL}/api/auth/register/request-otp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ method: "email", identifier: uniqueEmail }),
    });
    const reqEmailJson = await reqEmailRes.json();
    console.log(`  2.1 Request OTP Status: ${reqEmailRes.status} | Success: ${reqEmailJson.success}`);
    if (!reqEmailJson.success) throw new Error("Email OTP request failed");

    const emailVerificationId = reqEmailJson.data.verificationId;
    const emailOtp = devProvider.lastOtp;
    console.log(`  2.2 Dispatched OTP: [ ${emailOtp} ] for verificationId: ${emailVerificationId}`);

    const verifyEmailRes = await fetch(`${BASE_URL}/api/auth/register/verify-otp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ verificationId: emailVerificationId, otp: emailOtp }),
    });
    const verifyEmailJson = await verifyEmailRes.json();
    console.log(`  2.3 Verify OTP Status: ${verifyEmailRes.status} | Success: ${verifyEmailJson.success}`);
    if (!verifyEmailJson.success) throw new Error("Email OTP verification failed");

    const emailUser = verifyEmailJson.data.user;
    const emailToken = verifyEmailJson.data.token;
    createdUserIds.push(emailUser.id);

    // Direct Database Assertion
    const dbEmailUser = await prisma.user.findUnique({ where: { id: emailUser.id } });
    if (!dbEmailUser) throw new Error("SCENARIO 2 FAILED: User row not found in PostgreSQL 'users' table");
    if (dbEmailUser.email !== uniqueEmail.toLowerCase()) throw new Error("SCENARIO 2 FAILED: Email mismatch in DB");
    if (!dbEmailUser.emailVerifiedAt) throw new Error("SCENARIO 2 FAILED: emailVerifiedAt not populated");
    if (dbEmailUser.status !== "ACTIVE") throw new Error("SCENARIO 2 FAILED: User status not ACTIVE");

    const decodedEmailJwt = jwt.verify(emailToken, process.env.JWT_SECRET || "manglam_matrimony_jwt_secret_dev_key_2026_secure") as any;
    if (decodedEmailJwt.userId !== dbEmailUser.id) throw new Error("SCENARIO 2 FAILED: JWT userId != DB user.id");
    console.log(`  ✓ SCENARIO 2 PASSED: Email user persisted in PostgreSQL with ID: ${dbEmailUser.id}`);

    // -------------------------------------------------------------
    // SCENARIO 3: Duplicate Registration Rejection (409 Conflict)
    // -------------------------------------------------------------
    console.log(`\n[SCENARIO 3] Duplicate Registration Prevention`);
    const dupPhoneRes = await fetch(`${BASE_URL}/api/auth/register/request-otp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ method: "phone", identifier: uniquePhone }),
    });
    const dupPhoneJson = await dupPhoneRes.json();
    console.log(`  3.1 Duplicate Phone Status: ${dupPhoneRes.status} (Expected 409) | Code: ${dupPhoneJson.code}`);
    if (dupPhoneRes.status !== 409 || dupPhoneJson.code !== "USER_ALREADY_EXISTS") {
      throw new Error("SCENARIO 3 FAILED: Duplicate phone was not rejected with 409");
    }

    const dupEmailRes = await fetch(`${BASE_URL}/api/auth/register/request-otp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ method: "email", identifier: uniqueEmail }),
    });
    const dupEmailJson = await dupEmailRes.json();
    console.log(`  3.2 Duplicate Email Status: ${dupEmailRes.status} (Expected 409) | Code: ${dupEmailJson.code}`);
    if (dupEmailRes.status !== 409 || dupEmailJson.code !== "USER_ALREADY_EXISTS") {
      throw new Error("SCENARIO 3 FAILED: Duplicate email was not rejected with 409");
    }
    console.log(`  ✓ SCENARIO 3 PASSED: Duplicate registrations properly rejected with 409 Conflict.`);

    // -------------------------------------------------------------
    // SCENARIO 4: Profile Creation & Foreign Key Link to Registered User
    // -------------------------------------------------------------
    console.log(`\n[SCENARIO 4] Profile Creation linked to Registered User in PostgreSQL`);
    const createProfileRes = await fetch(`${BASE_URL}/api/profile`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${phoneToken}`,
      },
      body: JSON.stringify({ profileCreatedFor: "MYSELF" }),
    });
    const createProfileJson = await createProfileRes.json();
    console.log(`  4.1 Create Profile Status: ${createProfileRes.status} (Expected 201) | Success: ${createProfileJson.success}`);
    if (createProfileRes.status !== 201 || !createProfileJson.success) {
      throw new Error("SCENARIO 4 FAILED: Could not create profile for registered user");
    }

    const dbProfile = await prisma.profile.findUnique({
      where: { userId: dbPhoneUser.id },
      include: { user: true },
    });
    if (!dbProfile || dbProfile.userId !== dbPhoneUser.id || dbProfile.user.phone !== `+91${uniquePhone}`) {
      throw new Error("SCENARIO 4 FAILED: Profile not linked to user in PostgreSQL");
    }
    console.log(`  ✓ SCENARIO 4 PASSED: Profile ${dbProfile.id} linked to User ${dbProfile.userId} in PostgreSQL`);

    console.log("\n===============================================================");
    console.log("✅ ALL USER REGISTRATION PERSISTENCE SCENARIOS PASSED (100%)!");
    console.log("===============================================================");
  } catch (err) {
    console.error("Test Suite Error:", err);
    process.exit(1);
  } finally {
    // Cleanup test users and their cascading profiles
    if (createdUserIds.length > 0) {
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
      console.log(`\n[CLEANUP] Deleted ${createdUserIds.length} test user(s) from PostgreSQL.`);
    }
    server.close();
    await prisma.$disconnect();
    process.exit(0);
  }
}

runRegistrationPersistenceSuite();
