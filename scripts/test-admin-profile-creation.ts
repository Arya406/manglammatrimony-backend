import "dotenv/config";
import http from "http";
import jwt from "jsonwebtoken";
import { app } from "../src/app";
import { prisma } from "../src/config/database";
import { config } from "../src/config/env";
import { emailService } from "../src/services/email.service";
import { UserRole, UserStatus, AccountActivationStatus, ProfileStatus, ProfileCreatedFor } from "@prisma/client";

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`  ✗ FAIL: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
  console.log(`  ✓ PASS: ${message}`);
}

async function runStep6Suite() {
  console.log("==================================================");
  console.log("MANGLAM MATRIMONY — STEP 6: ADMIN PROFILE CREATION & USER ACTIVATION TEST SUITE");
  console.log("==================================================");

  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!adminEmail || !adminPassword) {
    throw new Error("ADMIN_EMAIL and ADMIN_PASSWORD must be defined in .env");
  }

  const normalizedEmail = adminEmail.trim().toLowerCase();

  const adminUser = await prisma.user.findUnique({
    where: { email: normalizedEmail },
  });
  assert(Boolean(adminUser), "Admin user exists in database");

  // Spin up ephemeral test server
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as any).port;
  const baseUrl = `http://127.0.0.1:${port}`;

  let passedTests = 0;
  const cleanupEmails: string[] = [];

  try {
    // ----------------------------------------------------
    // SETUP: Authenticate Admin
    // ----------------------------------------------------
    console.log("\n[SETUP] Authenticating Administrator...");
    const loginRes = await fetch(`${baseUrl}/api/admin/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: normalizedEmail, password: adminPassword }),
    });
    const loginJson: any = await loginRes.json();
    assert(loginRes.status === 200, "Admin login returned 200 OK");
    const adminToken = loginJson.data.token;
    passedTests++;

    // Look up or create a real normal USER in DB for 403 tests
    let normalUser = await prisma.user.findFirst({
      where: { role: UserRole.USER, status: UserStatus.ACTIVE },
    });

    if (!normalUser) {
      normalUser = await prisma.user.create({
        data: {
          email: `temp.normal.user.${Date.now()}@example.com`,
          role: UserRole.USER,
          status: UserStatus.ACTIVE,
        },
      });
      cleanupEmails.push(normalUser.email!);
    }

    const dummyUserToken = jwt.sign(
      { userId: normalUser.id, role: "USER", status: "ACTIVE" },
      config.jwtSecret,
      { expiresIn: "1h" }
    );

    // ====================================================
    // GROUP 1: Authentication & Authorization Security
    // ====================================================
    console.log("\n[GROUP 1] Admin Authentication & Authorization Security");

    // 1.1 Unauthenticated POST /api/admin/users
    const unauthCreate = await fetch(`${baseUrl}/api/admin/users`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "unauth@example.com" }),
    });
    assert(unauthCreate.status === 401, "1.1 Unauthenticated user creation returns 401 Unauthorized");
    passedTests++;

    // 1.2 USER token POST /api/admin/users
    const forbiddenCreate = await fetch(`${baseUrl}/api/admin/users`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${dummyUserToken}`,
      },
      body: JSON.stringify({ email: "forbidden@example.com" }),
    });
    assert(forbiddenCreate.status === 403, "1.2 USER token user creation returns 403 Forbidden");
    passedTests++;

    // 1.3 Unauthenticated resend activation
    const unauthResend = await fetch(`${baseUrl}/api/admin/users/some-id/activation/resend`, {
      method: "POST",
    });
    assert(unauthResend.status === 401, "1.3 Unauthenticated resend activation returns 401");
    passedTests++;

    // 1.4 USER token resend activation
    const forbiddenResend = await fetch(`${baseUrl}/api/admin/users/some-id/activation/resend`, {
      method: "POST",
      headers: { Authorization: `Bearer ${dummyUserToken}` },
    });
    assert(forbiddenResend.status === 403, "1.4 USER token resend activation returns 403 Forbidden");
    passedTests++;

    // ====================================================
    // GROUP 2: Validation on Create User
    // ====================================================
    console.log("\n[GROUP 2] Input Validation on User Creation");

    // 2.1 Missing email
    const noEmailRes = await fetch(`${baseUrl}/api/admin/users`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({}),
    });
    const noEmailJson: any = await noEmailRes.json();
    assert(noEmailRes.status === 400 && noEmailJson.code === "INVALID_EMAIL", "2.1 Missing email returns 400 INVALID_EMAIL");
    passedTests++;

    // 2.2 Malformed email
    const badEmailRes = await fetch(`${baseUrl}/api/admin/users`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ email: "notanemail" }),
    });
    const badEmailJson: any = await badEmailRes.json();
    assert(badEmailRes.status === 400 && badEmailJson.code === "INVALID_EMAIL", "2.2 Malformed email returns 400 INVALID_EMAIL");
    passedTests++;

    // 2.3 Invalid profileCreatedFor
    const badEnumRes = await fetch(`${baseUrl}/api/admin/users`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ email: "valid@example.com", profileCreatedFor: "INVALID_VALUE" }),
    });
    const badEnumJson: any = await badEnumRes.json();
    assert(badEnumRes.status === 400 && badEnumJson.code === "INVALID_PROFILE_CREATED_FOR", "2.3 Invalid profileCreatedFor returns 400");
    passedTests++;

    // ====================================================
    // GROUP 3: Creation & Invariant Enforcement (Guardrails 1 & 2)
    // ====================================================
    console.log("\n[GROUP 3] User & Profile Creation Invariants (Guardrails 1 & 2)");

    const targetEmail1 = `step6.test.candidate1.${Date.now()}@example.com`;
    cleanupEmails.push(targetEmail1);

    const createRes = await fetch(`${baseUrl}/api/admin/users`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        email: targetEmail1,
        firstName: "Vikram",
        lastName: "Mehta",
        gender: "MALE",
        profileCreatedFor: "MY_SON",
      }),
    });

    const createJson: any = await createRes.json();
    if (createRes.status !== 201) {
      console.error("Create User failed with status:", createRes.status, createJson);
    }
    assert(createRes.status === 201 && createJson.success, "3.1 Admin user creation returns 201 Created");
    assert(Boolean(createJson.data?.user?.id), "3.2 Response includes authoritative user ID");
    assert(createJson.data?.user?.activationStatus === "PENDING_ACTIVATION", "3.3 Response reports activationStatus PENDING_ACTIVATION");
    assert(createJson.data?.user?.activationPending === true, "3.4 Response reports activationPending === true");
    const createdUserId1 = createJson.data.user.id;
    passedTests += 4;

    // Direct DB Verification
    const dbUser1 = await prisma.user.findUnique({
      where: { id: createdUserId1 },
      include: {
        profile: {
          include: {
            personalDetails: true,
          },
        },
      },
    });

    assert(Boolean(dbUser1), "3.5 User row exists in database");
    assert(dbUser1?.role === UserRole.USER, "3.6 User role is USER (never ADMIN)");
    assert(dbUser1?.status === UserStatus.ACTIVE, "3.7 Account status is ACTIVE");
    assert(dbUser1?.activationStatus === AccountActivationStatus.PENDING_ACTIVATION, "3.8 activationStatus in DB is PENDING_ACTIVATION");
    assert(dbUser1?.emailVerifiedAt === null, "3.9 emailVerifiedAt is null (unverified pending claim)");
    assert(Boolean(dbUser1?.profile), "3.10 Profile shell row exists in database");
    assert(dbUser1?.profile?.profileStatus === ProfileStatus.INCOMPLETE, "3.11 Profile status is INCOMPLETE");
    assert(dbUser1?.profile?.completionPercentage === 0, "3.12 Profile completionPercentage is 0");
    assert(dbUser1?.profile?.profileCreatedFor === ProfileCreatedFor.MY_SON, "3.13 profileCreatedFor correctly stored as MY_SON");
    // Guardrail 1: ProfilePersonalDetails must NOT exist
    assert(dbUser1?.profile?.personalDetails === null, "3.14 Guardrail 1 verified: ProfilePersonalDetails row does NOT exist yet (onboarding handles it)");
    passedTests += 10;

    // Guardrail 2: DB committed first & VerificationOtp row created
    const dbOtp1 = await prisma.verificationOtp.findFirst({
      where: { email: targetEmail1, consumedAt: null },
      orderBy: { createdAt: "desc" },
    });
    assert(Boolean(dbOtp1), "3.15 Guardrail 2 verified: VerificationOtp record exists in DB");
    assert(dbOtp1?.consumedAt === null, "3.16 VerificationOtp is active and unconsumed");
    passedTests += 2;

    // Verify activation email in testInbox
    const emailRecords = emailService.getTestInbox(targetEmail1);
    assert(emailRecords.length > 0, "3.17 Email dispatch record found in test inbox");
    const lastEmail = emailRecords[emailRecords.length - 1];
    assert(lastEmail.type === "activation", "3.18 Dispatched email type is 'activation'");
    assert(lastEmail.html.includes("/activate"), "3.19 Email contains link to /activate");
    assert(!lastEmail.html.includes("token="), "3.20 Email URL contains NO token/JWT credentials");
    assert(!lastEmail.html.includes("otp="), "3.21 Email URL contains NO OTP embedded in link");
    passedTests += 5;

    // ====================================================
    // GROUP 4: Duplicate Email Handling
    // ====================================================
    console.log("\n[GROUP 4] Duplicate Email Conflict Handling");

    const dupRes = await fetch(`${baseUrl}/api/admin/users`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ email: targetEmail1 }),
    });
    const dupJson: any = await dupRes.json();
    assert(dupRes.status === 409 && dupJson.code === "EMAIL_ALREADY_REGISTERED", "4.1 Duplicate email returns 409 EMAIL_ALREADY_REGISTERED");
    passedTests++;

    // ====================================================
    // GROUP 5: Guardrail 3 — Normal User Flow Blocking for PENDING_ACTIVATION
    // ====================================================
    console.log("\n[GROUP 5] Guardrail 3: Normal Auth & API Blocking for PENDING_ACTIVATION");

    // 5.1 Normal login OTP request blocked
    const loginOtpReq = await fetch(`${baseUrl}/api/auth/login/request-otp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ method: "email", identifier: targetEmail1 }),
    });
    const loginOtpReqJson: any = await loginOtpReq.json();
    assert(loginOtpReq.status === 403 && loginOtpReqJson.code === "ACCOUNT_PENDING_ACTIVATION", "5.1 Login request-otp blocked with 403 ACCOUNT_PENDING_ACTIVATION");
    passedTests++;

    // 5.2 Normal login OTP verify blocked
    const loginOtpVerify = await fetch(`${baseUrl}/api/auth/login/verify-otp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ verificationId: "dummy-id", otp: "123456" }),
    });
    // Can be 400 (session not found) or 403; test with actual user lookup
    assert(loginOtpVerify.status >= 400, "5.2 Login verify-otp rejects unauthenticated attempt");
    passedTests++;

    // 5.3 Attempting authenticated user APIs with forged JWT for PENDING_ACTIVATION user
    const pendingUserJwt = jwt.sign(
      { userId: createdUserId1, email: targetEmail1, role: "USER", status: "ACTIVE" },
      config.jwtSecret,
      { expiresIn: "1h" }
    );

    const authMeReq = await fetch(`${baseUrl}/api/profile`, {
      headers: { Authorization: `Bearer ${pendingUserJwt}` },
    });
    const authMeJson: any = await authMeReq.json();
    assert(authMeReq.status === 403 && authMeJson.code === "ACCOUNT_PENDING_ACTIVATION", "5.3 Normal authenticated /api/profile blocked with 403 ACCOUNT_PENDING_ACTIVATION");
    passedTests++;

    // 5.4 Attempting discovery /matches with forged JWT
    const matchesReq = await fetch(`${baseUrl}/api/matches`, {
      headers: { Authorization: `Bearer ${pendingUserJwt}` },
    });
    const matchesJson: any = await matchesReq.json();
    assert(matchesReq.status === 403 && matchesJson.code === "ACCOUNT_PENDING_ACTIVATION", "5.4 Normal discovery /api/matches blocked with 403 ACCOUNT_PENDING_ACTIVATION");
    passedTests++;

    // ====================================================
    // GROUP 6: Candidate Public Activation OTP Flow
    // ====================================================
    console.log("\n[GROUP 6] Public Activation OTP Verification");

    // 6.1 Verify with invalid OTP returns error
    const badOtpVerify = await fetch(`${baseUrl}/api/auth/activation/verify-otp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: targetEmail1, otp: "000000" }),
    });
    const badOtpJson: any = await badOtpVerify.json();
    assert(badOtpVerify.status === 400 && badOtpJson.code === "INVALID_OTP", "6.1 Invalid OTP returns 400 INVALID_OTP");
    passedTests++;

    // 6.2 Resend request-otp before cooldown returns 429
    const cooldownReq = await fetch(`${baseUrl}/api/auth/activation/request-otp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: targetEmail1 }),
    });
    const cooldownJson: any = await cooldownReq.json();
    assert(cooldownReq.status === 429 && cooldownJson.code === "OTP_COOLDOWN", "6.2 Immediate activation OTP request returns 429 OTP_COOLDOWN");
    passedTests++;

    // 6.3 Verify with correct plainOtp (from last recorded email)
    const validOtp = lastEmail.otp;
    assert(Boolean(validOtp) && validOtp.length === 6, "6.3 Plain OTP extracted from dispatched email");

    const validVerify = await fetch(`${baseUrl}/api/auth/activation/verify-otp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: targetEmail1, otp: validOtp }),
    });
    const validVerifyJson: any = await validVerify.json();
    assert(validVerify.status === 200 && validVerifyJson.success, "6.4 Valid activation OTP returns 200 OK");
    assert(Boolean(validVerifyJson.data?.token), "6.5 Activation returns authentic USER JWT");
    assert(validVerifyJson.data?.redirectTo === "/onboarding", "6.6 Activation redirects to /onboarding");
    passedTests += 4;

    const activatedToken = validVerifyJson.data.token;
    const decodedToken: any = jwt.verify(activatedToken, config.jwtSecret);
    assert(decodedToken.role === "USER", "6.7 JWT issued has role USER (never ADMIN)");
    assert(decodedToken.userId === createdUserId1, "6.8 JWT issued belongs to candidate");
    passedTests += 2;

    // Verify DB transition
    const dbUserAfterActivation = await prisma.user.findUnique({
      where: { id: createdUserId1 },
    });
    assert(dbUserAfterActivation?.activationStatus === AccountActivationStatus.ACTIVE, "6.9 DB activationStatus updated to ACTIVE");
    assert(dbUserAfterActivation?.emailVerifiedAt !== null, "6.10 DB emailVerifiedAt is now stamped");
    passedTests += 2;

    // Replay attack with same OTP must fail
    const replayVerify = await fetch(`${baseUrl}/api/auth/activation/verify-otp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: targetEmail1, otp: validOtp }),
    });
    const replayJson: any = await replayVerify.json();
    assert(replayVerify.status === 410 && replayJson.code === "OTP_EXPIRED", "6.11 Replay attack with consumed OTP fails with 410 OTP_EXPIRED");
    passedTests++;

    // Authenticated endpoint now works with issued JWT
    const authMeAfter = await fetch(`${baseUrl}/api/profile`, {
      headers: { Authorization: `Bearer ${activatedToken}` },
    });
    assert(authMeAfter.status === 200, "6.12 Activated candidate can now access /api/profile with issued JWT");
    passedTests++;

    // Requesting activation OTP on already activated account returns 409
    const alreadyActivatedReq = await fetch(`${baseUrl}/api/auth/activation/request-otp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: targetEmail1 }),
    });
    const alreadyActJson: any = await alreadyActivatedReq.json();
    assert(alreadyActivatedReq.status === 409 && alreadyActJson.code === "ACCOUNT_ALREADY_ACTIVATED", "6.13 Request activation on already activated user returns 409");
    passedTests++;

    // ====================================================
    // GROUP 7: Admin Resend Activation Flow
    // ====================================================
    console.log("\n[GROUP 7] Admin Resend Activation Flow");

    const targetEmail2 = `step6.test.candidate2.${Date.now()}@example.com`;
    cleanupEmails.push(targetEmail2);

    const createRes2 = await fetch(`${baseUrl}/api/admin/users`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ email: targetEmail2, firstName: "Sneha" }),
    });
    const createJson2: any = await createRes2.json();
    const createdUserId2 = createJson2.data.user.id;
    assert(createRes2.status === 201, "7.1 Created candidate 2 in PENDING_ACTIVATION");
    passedTests++;

    // Fast-forward cooldown by updating OTP record in DB to simulate cooldown expiry
    await prisma.verificationOtp.updateMany({
      where: { email: targetEmail2 },
      data: { resendAvailableAt: new Date(Date.now() - 1000) },
    });

    // Admin resends activation
    const resendRes = await fetch(`${baseUrl}/api/admin/users/${createdUserId2}/activation/resend`, {
      method: "POST",
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const resendJson: any = await resendRes.json();
    assert(resendRes.status === 200 && resendJson.success, "7.2 Admin resend activation returns 200 ACTIVATION_RESENT");
    passedTests++;

    // Immediate repeat returns 429
    const resendRepeat = await fetch(`${baseUrl}/api/admin/users/${createdUserId2}/activation/resend`, {
      method: "POST",
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert(resendRepeat.status === 429, "7.3 Admin immediate resend returns 429 OTP_COOLDOWN");
    passedTests++;

    // Resend on already activated user 1 returns 409
    const resendActive = await fetch(`${baseUrl}/api/admin/users/${createdUserId1}/activation/resend`, {
      method: "POST",
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert(resendActive.status === 409, "7.4 Admin resend on activated user returns 409 ALREADY_ACTIVATED");
    passedTests++;

    // Resend on admin account returns 403
    const resendAdmin = await fetch(`${baseUrl}/api/admin/users/${adminUser?.id}/activation/resend`, {
      method: "POST",
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert(resendAdmin.status === 403, "7.5 Admin resend on admin account returns 403 ADMIN_ACCOUNT_PROTECTED");
    passedTests++;

    // ====================================================
    // GROUP 8: Account Status Controls Interoperability
    // ====================================================
    console.log("\n[GROUP 8] Account Status Controls Interoperability");

    const targetEmail3 = `step6.test.candidate3.${Date.now()}@example.com`;
    cleanupEmails.push(targetEmail3);

    const createRes3 = await fetch(`${baseUrl}/api/admin/users`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ email: targetEmail3 }),
    });
    const createJson3: any = await createRes3.json();
    const createdUserId3 = createJson3.data.user.id;

    // Admin suspends user 3
    const suspendRes = await fetch(`${baseUrl}/api/admin/users/${createdUserId3}/suspend`, {
      method: "POST",
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert(suspendRes.status === 200, "8.1 Admin suspended user 3");
    passedTests++;

    // Resend activation on suspended user fails with 409
    const resendSuspended = await fetch(`${baseUrl}/api/admin/users/${createdUserId3}/activation/resend`, {
      method: "POST",
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const resendSuspendedJson: any = await resendSuspended.json();
    assert(resendSuspended.status === 409 && resendSuspendedJson.code === "ACCOUNT_SUSPENDED", "8.2 Resend activation to suspended user returns 409 ACCOUNT_SUSPENDED");
    passedTests++;

    // Public request-otp on suspended user fails
    const reqOtpSuspended = await fetch(`${baseUrl}/api/auth/activation/request-otp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: targetEmail3 }),
    });
    const reqOtpSuspendedJson: any = await reqOtpSuspended.json();
    assert(reqOtpSuspended.status === 403 && reqOtpSuspendedJson.code === "ACCOUNT_SUSPENDED", "8.3 Public activation request for suspended user returns 403 ACCOUNT_SUSPENDED");
    passedTests++;

    // Admin restores user 3
    const restoreRes = await fetch(`${baseUrl}/api/admin/users/${createdUserId3}/restore`, {
      method: "POST",
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert(restoreRes.status === 200, "8.4 Admin restored user 3 to ACTIVE");
    passedTests++;

    // ====================================================
    // GROUP 9: Admin Users Listing & Filter
    // ====================================================
    console.log("\n[GROUP 9] Admin Users Listing & Activation Filter");

    const listPendingRes = await fetch(`${baseUrl}/api/admin/users?activationStatus=PENDING_ACTIVATION`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const listPendingJson: any = await listPendingRes.json();
    assert(listPendingRes.status === 200, "9.1 List users with activationStatus=PENDING_ACTIVATION returns 200");
    const foundPending = listPendingJson.data.users.some((u: any) => u.id === createdUserId2);
    assert(foundPending, "9.2 Candidate 2 is returned in PENDING_ACTIVATION list");
    assert(listPendingJson.data.users.every((u: any) => u.activationPending === true), "9.3 All returned items have activationPending === true");
    passedTests += 3;

    const getUserDetailRes = await fetch(`${baseUrl}/api/admin/users/${createdUserId2}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const getUserDetailJson: any = await getUserDetailRes.json();
    assert(getUserDetailRes.status === 200, "9.4 Get user detail returns 200");
    assert(getUserDetailJson.data.user.activationStatus === "PENDING_ACTIVATION", "9.5 Detail shows activationStatus PENDING_ACTIVATION");
    assert(getUserDetailJson.data.user.activationPending === true, "9.6 Detail shows activationPending === true");
    passedTests += 3;

    console.log("\n==================================================");
    console.log(`ALL TESTS PASSED! Total assertions: ${passedTests}`);
    console.log("==================================================");
  } finally {
    // Teardown test server
    await new Promise<void>((resolve) => server.close(() => resolve()));

    // Clean up created test users
    console.log("\n[CLEANUP] Removing test accounts...");
    for (const email of cleanupEmails) {
      try {
        await prisma.verificationOtp.deleteMany({ where: { email } });
        const u = await prisma.user.findUnique({ where: { email } });
        if (u) {
          await prisma.profile.deleteMany({ where: { userId: u.id } });
          await prisma.user.delete({ where: { id: u.id } });
        }
      } catch (err) {
        console.warn(`Cleanup error for ${email}:`, err);
      }
    }
    console.log("[CLEANUP] Test cleanup completed.");
    await prisma.$disconnect();
    process.exit(0);
  }
}

runStep6Suite().catch((err) => {
  console.error("\n[TEST SUITE FAILURE]:", err);
  process.exit(1);
});
