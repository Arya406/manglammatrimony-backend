import "dotenv/config";
import http from "http";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { app } from "../src/app";
import { prisma } from "../src/config/database";
import { config } from "../src/config/env";
import { UserRole, UserStatus, AccountActivationStatus } from "@prisma/client";
import { EmailService } from "../src/services/email.service";
import { otpService } from "../src/services/otp.service";

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`  ✗ FAIL: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
  console.log(`  ✓ PASS: ${message}`);
}

async function runAdminActivationOtpSuite() {
  console.log("==================================================");
  console.log("MANGLAM MATRIMONY — 20-POINT ADMIN ACTIVATION OTP SUITE");
  console.log("==================================================");

  const adminEmail = process.env.ADMIN_EMAIL || "admin@gmail.com";
  const adminPassword = process.env.ADMIN_PASSWORD || "admin123@";
  const normalizedAdminEmail = adminEmail.trim().toLowerCase();

  const adminUser = await prisma.user.findUnique({
    where: { email: normalizedAdminEmail },
  });
  assert(Boolean(adminUser), `Admin user (${normalizedAdminEmail}) exists in DB`);

  // Ephemeral test server
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as any).port;
  const baseUrl = `http://127.0.0.1:${port}`;

  let passedTests = 0;

  try {
    // 0. Authenticate Admin
    console.log("\n[AUTH: Admin Login]");
    const loginRes = await fetch(`${baseUrl}/api/admin/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: normalizedAdminEmail, password: adminPassword }),
    });
    const loginJson: any = await loginRes.json();
    assert(loginRes.status === 200, "Admin login successful");
    const adminToken = loginJson.data.token;

    // Clear test inbox before running
    EmailService.clearTestInbox();

    // -------------------------------------------------------------
    // TEST 1: Admin requests activation OTP (via user creation)
    // -------------------------------------------------------------
    console.log("\n[TEST 1: Admin requests activation OTP]");
    const candidate1Email = `candidate.t1.${Date.now()}@manglam.test`.toLowerCase();
    const createRes1 = await fetch(`${baseUrl}/api/admin/users`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        email: candidate1Email,
        firstName: "Aarav",
        lastName: "Sharma",
        gender: "MALE",
        profileCreatedFor: "MYSELF",
      }),
    });
    const createJson1: any = await createRes1.json();
    assert(createRes1.status === 201, "HTTP 201 on user creation by admin");
    assert(createJson1.success === true, "User creation marked success");
    const user1Id = createJson1.data.user.id;
    assert(createJson1.data.user.activationStatus === "PENDING_ACTIVATION", "User is in PENDING_ACTIVATION state");
    assert(createJson1.data.user.emailVerified === false, "User emailVerified is false");
    passedTests++;

    // -------------------------------------------------------------
    // TEST 2: OTP session is persisted in PostgreSQL
    // -------------------------------------------------------------
    console.log("\n[TEST 2: OTP session is persisted in PostgreSQL]");
    const initialOtp1 = await prisma.verificationOtp.findFirst({
      where: { email: candidate1Email, consumedAt: null },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
    assert(Boolean(initialOtp1), "OTP session record exists in PostgreSQL verification_otps table");
    assert(Boolean(initialOtp1?.hashedOtp), "hashedOtp is populated");
    assert(Boolean(initialOtp1?.salt), "salt is populated");
    assert(initialOtp1?.attempts === 0, "attempts starts at 0");
    assert(initialOtp1?.maxAttempts === 5, "maxAttempts is 5");
    assert(initialOtp1?.consumedAt === null, "consumedAt is null");
    assert(initialOtp1!.expiresAt > new Date(), "expiresAt is in the future");
    const firstPlainOtp = EmailService.getLastDispatchedOtp(candidate1Email);
    assert(Boolean(firstPlainOtp), "Email containing initial activation OTP was dispatched");
    passedTests++;

    // -------------------------------------------------------------
    // TEST 3: Admin resends OTP
    // -------------------------------------------------------------
    console.log("\n[TEST 3: Admin resends OTP]");
    // Reset cooldown to past so resend is immediately permitted
    await prisma.verificationOtp.update({
      where: { id: initialOtp1!.id },
      data: { resendAvailableAt: new Date(Date.now() - 5000) },
    });

    const resendRes = await fetch(`${baseUrl}/api/admin/users/${user1Id}/activation/resend`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`,
      },
    });
    const resendJson: any = await resendRes.json();
    assert(resendRes.status === 200, "Resend endpoint returns HTTP 200");
    assert(resendJson.code === "ACTIVATION_RESENT", "Resend returns ACTIVATION_RESENT code");
    passedTests++;

    // -------------------------------------------------------------
    // TEST 4: Latest OTP becomes the valid OTP
    // -------------------------------------------------------------
    console.log("\n[TEST 4: Latest OTP becomes the valid OTP]");
    const secondPlainOtp = EmailService.getLastDispatchedOtp(candidate1Email);
    assert(Boolean(secondPlainOtp), "Resend dispatched a new OTP email");
    assert(secondPlainOtp !== firstPlainOtp, "New OTP is distinct from the first OTP");

    const latestActiveRecord = await prisma.verificationOtp.findFirst({
      where: { email: candidate1Email, consumedAt: null },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
    assert(Boolean(latestActiveRecord), "Fresh active OTP record found in DB");
    assert(latestActiveRecord!.id !== initialOtp1!.id, "New OTP session ID is different from original");
    // Verify hash of new OTP matches DB hashedOtp
    const matchesNew = otpService.verifyOtpMatch(
      secondPlainOtp!,
      latestActiveRecord!.hashedOtp,
      latestActiveRecord!.salt
    );
    assert(matchesNew, "Latest OTP matches the hash stored in PostgreSQL");
    passedTests++;

    // -------------------------------------------------------------
    // TEST 5: Old OTP is rejected
    // -------------------------------------------------------------
    console.log("\n[TEST 5: Old OTP is rejected]");
    // The prior record must now be marked consumed
    const priorRecord = await prisma.verificationOtp.findUnique({
      where: { id: initialOtp1!.id },
    });
    assert(Boolean(priorRecord?.consumedAt), "Prior OTP record was marked consumed on resend");

    const oldOtpAttempt = await fetch(`${baseUrl}/api/admin/users/${user1Id}/activation/verify-otp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ otp: firstPlainOtp }),
    });
    const oldOtpJson: any = await oldOtpAttempt.json();
    assert(oldOtpAttempt.status === 400, "Old OTP rejected with HTTP 400");
    assert(oldOtpJson.code === "INVALID_OTP", "Rejection code is INVALID_OTP");
    passedTests++;

    // -------------------------------------------------------------
    // TEST 6: Correct OTP succeeds
    // -------------------------------------------------------------
    console.log("\n[TEST 6: Correct OTP succeeds]");
    const verifySuccessRes = await fetch(`${baseUrl}/api/admin/users/${user1Id}/activation/verify-otp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ otp: secondPlainOtp }),
    });
    const verifySuccessJson: any = await verifySuccessRes.json();
    assert(verifySuccessRes.status === 200, "Valid OTP verification returns HTTP 200");
    assert(verifySuccessJson.success === true, "Verification marked success: true");
    assert(verifySuccessJson.data.activationStatus === "ACTIVE", "activationStatus in response is ACTIVE");
    assert(verifySuccessJson.data.emailVerified === true, "emailVerified in response is true");
    passedTests++;

    // -------------------------------------------------------------
    // TEST 7: Wrong OTP fails
    // -------------------------------------------------------------
    console.log("\n[TEST 7: Wrong OTP fails]");
    const candidate2Email = `candidate.t7.${Date.now()}@manglam.test`.toLowerCase();
    const createRes2 = await fetch(`${baseUrl}/api/admin/users`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        email: candidate2Email,
        firstName: "Rohan",
        gender: "MALE",
      }),
    });
    const createJson2: any = await createRes2.json();
    const user2Id = createJson2.data.user.id;
    const realOtp2 = EmailService.getLastDispatchedOtp(candidate2Email);
    const wrongOtp = realOtp2 === "111111" ? "222222" : "111111";

    const wrongRes = await fetch(`${baseUrl}/api/admin/users/${user2Id}/activation/verify-otp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ otp: wrongOtp }),
    });
    const wrongJson: any = await wrongRes.json();
    assert(wrongRes.status === 400, "Wrong OTP returns HTTP 400");
    assert(wrongJson.code === "INVALID_OTP", "Error code is INVALID_OTP");
    passedTests++;

    // -------------------------------------------------------------
    // TEST 8: Expired OTP fails
    // -------------------------------------------------------------
    console.log("\n[TEST 8: Expired OTP fails]");
    const otpRecord2 = await prisma.verificationOtp.findFirst({
      where: { email: candidate2Email, consumedAt: null },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
    // Set expiration in the past
    await prisma.verificationOtp.update({
      where: { id: otpRecord2!.id },
      data: { expiresAt: new Date(Date.now() - 10000) },
    });

    const expiredRes = await fetch(`${baseUrl}/api/admin/users/${user2Id}/activation/verify-otp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ otp: realOtp2 }),
    });
    const expiredJson: any = await expiredRes.json();
    assert(expiredRes.status === 410 || expiredRes.status === 400, "Expired OTP returns HTTP 410 or 400");
    assert(expiredJson.code === "OTP_EXPIRED", "Error code is OTP_EXPIRED");
    passedTests++;

    // -------------------------------------------------------------
    // TEST 9: Consumed OTP fails
    // -------------------------------------------------------------
    console.log("\n[TEST 9: Consumed OTP fails]");
    // Candidate 1 was already activated and its OTP consumed
    const consumedAttempt = await fetch(`${baseUrl}/api/admin/users/${user1Id}/activation/verify-otp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ otp: secondPlainOtp }),
    });
    const consumedJson: any = await consumedAttempt.json();
    assert(consumedAttempt.status === 410 || consumedAttempt.status === 409, "Consumed OTP returns HTTP 410 or 409");
    assert(
      consumedJson.code === "OTP_EXPIRED" || consumedJson.code === "ACCOUNT_ALREADY_ACTIVATED",
      "Replay on consumed OTP safely rejected"
    );
    passedTests++;

    // -------------------------------------------------------------
    // TEST 10: Attempt limit works
    // -------------------------------------------------------------
    console.log("\n[TEST 10: Attempt limit works]");
    const candidate10Email = `candidate.t10.${Date.now()}@manglam.test`.toLowerCase();
    const createRes10 = await fetch(`${baseUrl}/api/admin/users`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        email: candidate10Email,
        firstName: "Pooja",
        gender: "FEMALE",
      }),
    });
    const createJson10: any = await createRes10.json();
    const user10Id = createJson10.data.user.id;
    const otpRec10 = await prisma.verificationOtp.findFirst({
      where: { email: candidate10Email, consumedAt: null },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });

    // Advance attempts to 4
    await prisma.verificationOtp.update({
      where: { id: otpRec10!.id },
      data: { attempts: 4 },
    });

    // 5th wrong attempt should exceed maxAttempts
    const attempt5Res = await fetch(`${baseUrl}/api/admin/users/${user10Id}/activation/verify-otp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ otp: "000000" }),
    });
    const attempt5Json: any = await attempt5Res.json();
    assert(attempt5Res.status === 400, "Max attempts exceeded returns HTTP 400");
    assert(attempt5Json.code === "OTP_MAX_ATTEMPTS", "Error code is OTP_MAX_ATTEMPTS");
    passedTests++;

    // -------------------------------------------------------------
    // TEST 11: Successful verification changes PENDING_ACTIVATION → ACTIVE
    // -------------------------------------------------------------
    console.log("\n[TEST 11: Successful verification changes PENDING_ACTIVATION → ACTIVE]");
    const dbUser1 = await prisma.user.findUnique({ where: { id: user1Id } });
    assert(dbUser1?.activationStatus === AccountActivationStatus.ACTIVE, "User activationStatus is ACTIVE in DB");
    passedTests++;

    // -------------------------------------------------------------
    // TEST 12: emailVerifiedAt is populated
    // -------------------------------------------------------------
    console.log("\n[TEST 12: emailVerifiedAt is populated]");
    assert(Boolean(dbUser1?.emailVerifiedAt), "User emailVerifiedAt is a valid timestamp");
    assert(dbUser1!.emailVerifiedAt instanceof Date, "emailVerifiedAt is an instance of Date");
    passedTests++;

    // -------------------------------------------------------------
    // TEST 13: activatedByUserId is the admin
    // -------------------------------------------------------------
    console.log("\n[TEST 13: activatedByUserId is the admin]");
    assert(dbUser1?.activatedByUserId === adminUser!.id, `activatedByUserId matches admin user ID (${adminUser!.id})`);
    assert(Boolean(dbUser1?.activatedAt), "activatedAt is stamped");
    passedTests++;

    // -------------------------------------------------------------
    // TEST 14: OTP is consumed
    // -------------------------------------------------------------
    console.log("\n[TEST 14: OTP is consumed]");
    const verifiedOtpRecord = await prisma.verificationOtp.findUnique({
      where: { id: latestActiveRecord!.id },
    });
    assert(Boolean(verifiedOtpRecord?.consumedAt), "VerificationOtp record has non-null consumedAt");
    passedTests++;

    // -------------------------------------------------------------
    // TEST 15: Concurrent verification is safe
    // -------------------------------------------------------------
    console.log("\n[TEST 15: Concurrent verification is safe]");
    const candidate15Email = `candidate.t15.${Date.now()}@manglam.test`.toLowerCase();
    const createRes15 = await fetch(`${baseUrl}/api/admin/users`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        email: candidate15Email,
        firstName: "ConcurrentCandidate",
        gender: "MALE",
      }),
    });
    const createJson15: any = await createRes15.json();
    const user15Id = createJson15.data.user.id;
    const plainOtp15 = EmailService.getLastDispatchedOtp(candidate15Email);
    assert(Boolean(plainOtp15), "OTP dispatched for concurrent candidate");

    const [cResA, cResB] = await Promise.all([
      fetch(`${baseUrl}/api/admin/users/${user15Id}/activation/verify-otp`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({ otp: plainOtp15 }),
      }),
      fetch(`${baseUrl}/api/admin/users/${user15Id}/activation/verify-otp`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({ otp: plainOtp15 }),
      }),
    ]);

    const cStatuses = [cResA.status, cResB.status];
    assert(cStatuses.includes(200), "Exactly one concurrent request got HTTP 200");
    assert(
      cStatuses.includes(409) || cStatuses.includes(410),
      "Competing concurrent request was rejected with conflict/expired HTTP 409/410"
    );

    // Verify user is active exactly once
    const dbUser15 = await prisma.user.findUnique({ where: { id: user15Id } });
    assert(dbUser15?.activationStatus === AccountActivationStatus.ACTIVE, "User is ACTIVE");
    passedTests++;

    // -------------------------------------------------------------
    // TEST 16: Normal user login remains blocked before activation
    // -------------------------------------------------------------
    console.log("\n[TEST 16: Normal user login remains blocked before activation]");
    const candidate16Email = `candidate.t16.${Date.now()}@manglam.test`.toLowerCase();
    await fetch(`${baseUrl}/api/admin/users`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        email: candidate16Email,
        firstName: "UnactivatedUser",
        gender: "FEMALE",
      }),
    });

    const loginBlockedRes = await fetch(`${baseUrl}/api/auth/login/request-otp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: candidate16Email }),
    });
    const loginBlockedJson: any = await loginBlockedRes.json();
    assert(loginBlockedRes.status === 403, "Login request blocked with HTTP 403 for unactivated user");
    assert(
      loginBlockedJson.code === "ACCOUNT_PENDING_ACTIVATION",
      "Error code is ACCOUNT_PENDING_ACTIVATION"
    );
    passedTests++;

    // -------------------------------------------------------------
    // TEST 17: Normal user login works after activation
    // -------------------------------------------------------------
    console.log("\n[TEST 17: Normal user login works after activation]");
    // Candidate 1 was activated in TEST 6
    const loginSuccessRes = await fetch(`${baseUrl}/api/auth/login/request-otp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: candidate1Email }),
    });
    const loginSuccessJson: any = await loginSuccessRes.json();
    assert(loginSuccessRes.status === 200, "Login request succeeds with HTTP 200 after activation");
    assert(loginSuccessJson.success === true, "Login OTP request returned success: true");
    passedTests++;

    // -------------------------------------------------------------
    // TEST 18: No plaintext OTP is returned or exposed
    // -------------------------------------------------------------
    console.log("\n[TEST 18: No plaintext OTP is returned or exposed in responses]");
    assert(!verifySuccessJson.data?.otp, "Verification response does NOT expose plaintext otp");
    assert(!verifySuccessJson.data?.debugOtp, "Verification response does NOT expose debugOtp");
    assert(!verifySuccessJson.data?.hashedOtp, "Verification response does NOT expose hashedOtp");
    assert(!verifySuccessJson.data?.token, "Verification response does NOT expose matrimonial user JWT");
    assert(!verifySuccessJson.data?.password, "Verification response does NOT expose password");
    passedTests++;

    // -------------------------------------------------------------
    // TEST 19: Nonexistent user cannot be activated
    // -------------------------------------------------------------
    console.log("\n[TEST 19: Nonexistent user cannot be activated]");
    const nonExistentId = "00000000-0000-0000-0000-000000000000";
    const nonExistentRes = await fetch(`${baseUrl}/api/admin/users/${nonExistentId}/activation/verify-otp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ otp: "123456" }),
    });
    const nonExistentJson: any = await nonExistentRes.json();
    assert(nonExistentRes.status === 404, "Nonexistent user returns HTTP 404");
    assert(nonExistentJson.code === "USER_NOT_FOUND", "Error code is USER_NOT_FOUND");
    passedTests++;

    // -------------------------------------------------------------
    // TEST 20: Non-admin cannot access admin verification endpoint
    // -------------------------------------------------------------
    console.log("\n[TEST 20: Non-admin cannot access admin verification endpoint]");
    // 20a. Unauthenticated
    const noAuthRes = await fetch(`${baseUrl}/api/admin/users/${user1Id}/activation/verify-otp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ otp: "123456" }),
    });
    assert(noAuthRes.status === 401, "Unauthenticated request returns HTTP 401");

    // 20b. User role token
    const userRoleJwt = jwt.sign(
      { userId: user1Id, email: candidate1Email, role: "USER", status: "ACTIVE" },
      config.jwtSecret,
      { expiresIn: "1h" }
    );
    const userRoleRes = await fetch(`${baseUrl}/api/admin/users/${user1Id}/activation/verify-otp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${userRoleJwt}`,
      },
      body: JSON.stringify({ otp: "123456" }),
    });
    const userRoleJson: any = await userRoleRes.json();
    assert(userRoleRes.status === 403, "Regular user JWT returns HTTP 403 FORBIDDEN");
    assert(userRoleJson.code === "FORBIDDEN", "Error code is FORBIDDEN");
    passedTests++;

    console.log("\n==================================================");
    console.log(`ALL ${passedTests} ADMIN ACTIVATION OTP REQUIREMENTS PASSED!`);
    console.log("==================================================");
  } finally {
    server.close();
  }
}

runAdminActivationOtpSuite()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Test Suite Failed:", err);
    process.exit(1);
  });
