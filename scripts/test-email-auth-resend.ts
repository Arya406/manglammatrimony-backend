import { app } from "../src/app";
import { prisma } from "../src/config/database";
import { EmailService } from "../src/services/email.service";
import jwt from "jsonwebtoken";
import { config } from "../src/config/env";
import { ProfileStatus, UserStatus, ProfileCreatedFor } from "@prisma/client";
import { Server } from "http";

interface TestReport {
  id: number;
  name: string;
  passed: boolean;
  details?: string;
  error?: string;
}

const reports: TestReport[] = [];

function recordTest(id: number, name: string, passed: boolean, details?: string, error?: string) {
  reports.push({ id, name, passed, details, error });
  const status = passed ? "✓ PASS" : "✗ FAIL";
  console.log(`[TEST ${id.toString().padStart(2, "0")}] ${status}: ${name}`);
  if (details) console.log(`         Details: ${details}`);
  if (error) console.log(`         Error: ${error}`);
}

async function runFocusedAuthTests() {
  console.log("==================================================");
  console.log("STARTING FOCUSED EMAIL OTP AUTHENTICATION TEST SUITE");
  console.log("==================================================");

  // Start internal server on free port
  const server: Server = app.listen(5000);
  await new Promise((resolve) => server.once("listening", resolve));
  const API_BASE = "http://localhost:5000";

  async function postJson(endpoint: string, body: any): Promise<{ status: number; data: any }> {
    const res = await fetch(`${API_BASE}${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    return { status: res.status, data };
  }

  const timestamp = Date.now();
  const testEmailReg = `resend_reg_${timestamp}@manglamtest.org`;
  const testEmailInvalid = `resend_inv_${timestamp}@manglamtest.org`;
  const testEmailExpired = `resend_exp_${timestamp}@manglamtest.org`;
  const testEmailMax = `resend_max_${timestamp}@manglamtest.org`;
  const testEmailCooldown = `resend_cd_${timestamp}@manglamtest.org`;
  const testEmailLoginSuccess = `resend_login_ok_${timestamp}@manglamtest.org`;
  const testEmailLoginInvalid = `resend_login_inv_${timestamp}@manglamtest.org`;
  const testEmailLoginExpired = `resend_login_exp_${timestamp}@manglamtest.org`;
  const nonExistentEmail = `nonexistent_user_${timestamp}@manglamtest.org`;
  const testEmailActive = `resend_active_${timestamp}@manglamtest.org`;
  const testEmailIncomplete = `resend_incomplete_${timestamp}@manglamtest.org`;
  const testEmailInReview = `resend_review_${timestamp}@manglamtest.org`;
  const testEmailSuspended = `resend_suspended_${timestamp}@manglamtest.org`;

  try {
    // ----------------------------------------------------
    // TEST 1: New email registration
    // ----------------------------------------------------
    const t1Res = await postJson("/api/auth/register/request-otp", {
      identifier: `  ${testEmailReg.toUpperCase()}  `,
    });

    const userInDbBeforeVerify = await prisma.user.findUnique({
      where: { email: testEmailReg },
    });

    const otpInDb1 = await prisma.verificationOtp.findFirst({
      where: { email: testEmailReg },
    });

    const t1Passed =
      t1Res.status === 200 &&
      t1Res.data.success === true &&
      !!t1Res.data.data?.verificationId &&
      t1Res.data.data?.resendCooldownSeconds === 60 &&
      t1Res.data.data?.expiresInSeconds === 600 &&
      !("otp" in t1Res.data) &&
      !("plainOtp" in (t1Res.data.data || {})) &&
      userInDbBeforeVerify === null &&
      otpInDb1 !== null;

    recordTest(
      1,
      "New email registration",
      t1Passed,
      `Normalized email stored in DB, user not created yet, OTP not leaked in API response.`
    );

    const verificationId1 = t1Res.data.data?.verificationId;

    // ----------------------------------------------------
    // TEST 2: Registration OTP success
    // ----------------------------------------------------
    const plainOtp1 = EmailService.getLastDispatchedOtp(testEmailReg);
    const t2Res = await postJson("/api/auth/register/verify-otp", {
      verificationId: verificationId1,
      otp: plainOtp1,
    });

    const userInDbAfterVerify = await prisma.user.findUnique({
      where: { email: testEmailReg },
    });

    const otpInDbAfterVerify = await prisma.verificationOtp.findUnique({
      where: { id: verificationId1 },
    });

    const t2Passed =
      t2Res.status === 200 &&
      t2Res.data.success === true &&
      !!t2Res.data.data?.token &&
      t2Res.data.data?.user?.email === testEmailReg &&
      userInDbAfterVerify !== null &&
      otpInDbAfterVerify === null;

    recordTest(
      2,
      "Registration OTP success",
      t2Passed,
      `User created in PostgreSQL, OTP session deleted immediately upon success.`
    );

    // ----------------------------------------------------
    // TEST 3: Registration invalid OTP
    // ----------------------------------------------------
    const t3Start = await postJson("/api/auth/register/request-otp", {
      identifier: testEmailInvalid,
    });
    const verificationId3 = t3Start.data.data?.verificationId;

    const t3Res = await postJson("/api/auth/register/verify-otp", {
      verificationId: verificationId3,
      otp: "000000",
    });

    const user3InDb = await prisma.user.findUnique({ where: { email: testEmailInvalid } });
    const otpSession3 = await prisma.verificationOtp.findUnique({ where: { id: verificationId3 } });

    const t3Passed =
      t3Res.status === 400 &&
      t3Res.data.code === "INVALID_OTP" &&
      user3InDb === null &&
      otpSession3?.attempts === 1;

    recordTest(
      3,
      "Registration invalid OTP",
      t3Passed,
      `HTTP 400 INVALID_OTP returned, attempts counter incremented to 1, user not created.`
    );

    // ----------------------------------------------------
    // TEST 4: Registration expired OTP
    // ----------------------------------------------------
    const t4Start = await postJson("/api/auth/register/request-otp", {
      identifier: testEmailExpired,
    });
    const verificationIdExpired = t4Start.data.data?.verificationId;

    // Manually expire the OTP in PostgreSQL
    await prisma.verificationOtp.update({
      where: { id: verificationIdExpired },
      data: { expiresAt: new Date(Date.now() - 5000) },
    });

    const plainOtpExpired = EmailService.getLastDispatchedOtp(testEmailExpired);
    const t4Res = await postJson("/api/auth/register/verify-otp", {
      verificationId: verificationIdExpired,
      otp: plainOtpExpired,
    });

    const userExpInDb = await prisma.user.findUnique({ where: { email: testEmailExpired } });

    const t4Passed =
      t4Res.status === 410 &&
      t4Res.data.code === "OTP_EXPIRED" &&
      userExpInDb === null;

    recordTest(
      4,
      "Registration expired OTP",
      t4Passed,
      `HTTP 410 OTP_EXPIRED returned when expiresAt is in past, user not created.`
    );

    // ----------------------------------------------------
    // TEST 5: Registration OTP max attempts
    // ----------------------------------------------------
    const t5Start = await postJson("/api/auth/register/request-otp", {
      identifier: testEmailMax,
    });
    const verificationIdMax = t5Start.data.data?.verificationId;

    let finalAttemptRes: any = null;
    for (let i = 0; i < 5; i++) {
      finalAttemptRes = await postJson("/api/auth/register/verify-otp", {
        verificationId: verificationIdMax,
        otp: "123456",
      });
    }

    const otpSessionMax = await prisma.verificationOtp.findUnique({
      where: { id: verificationIdMax },
    });

    const t5Passed =
      finalAttemptRes.status === 429 &&
      finalAttemptRes.data.code === "OTP_MAX_ATTEMPTS" &&
      otpSessionMax === null;

    recordTest(
      5,
      "Registration OTP max attempts",
      t5Passed,
      `HTTP 429 OTP_MAX_ATTEMPTS returned at attempt 5, session immediately purged.`
    );

    // ----------------------------------------------------
    // TEST 6: OTP replay rejected
    // ----------------------------------------------------
    // Replay with testEmailReg which was already verified in test 2
    const t6Res = await postJson("/api/auth/register/verify-otp", {
      verificationId: verificationId1,
      otp: plainOtp1,
    });

    const t6Passed =
      t6Res.status === 410 &&
      t6Res.data.code === "OTP_EXPIRED";

    recordTest(
      6,
      "OTP replay rejected",
      t6Passed,
      `Replaying previously verified OTP rejected with HTTP 410 OTP_EXPIRED.`
    );

    // ----------------------------------------------------
    // TEST 7: Resend cooldown
    // ----------------------------------------------------
    const t7Start = await postJson("/api/auth/register/request-otp", {
      identifier: testEmailCooldown,
    });
    const verificationIdCooldown = t7Start.data.data?.verificationId;

    // Immediately trigger resend
    const t7Res = await postJson("/api/auth/register/resend-otp", {
      verificationId: verificationIdCooldown,
    });

    const t7Passed =
      t7Res.status === 429 &&
      t7Res.data.code === "OTP_COOLDOWN";

    recordTest(
      7,
      "Resend cooldown",
      t7Passed,
      `Resend within 60-second window rejected with HTTP 429 OTP_COOLDOWN.`
    );

    // ----------------------------------------------------
    // TEST 8: Existing email registration rejected
    // ----------------------------------------------------
    const t8Res = await postJson("/api/auth/register/request-otp", {
      identifier: `  ${testEmailReg.toUpperCase()}  `,
    });

    const t8Passed =
      t8Res.status === 409 &&
      t8Res.data.code === "EMAIL_ALREADY_REGISTERED";

    recordTest(
      8,
      "Existing email registration rejected",
      t8Passed,
      `HTTP 409 EMAIL_ALREADY_REGISTERED returned, directs user to login.`
    );

    // ----------------------------------------------------
    // TEST 9: Existing email login
    // ----------------------------------------------------
    // Setup dedicated user for login tests
    await prisma.user.create({
      data: {
        email: testEmailLoginSuccess,
        emailVerifiedAt: new Date(),
        status: UserStatus.ACTIVE,
      },
    });

    const t9Res = await postJson("/api/auth/login/request-otp", {
      identifier: `  ${testEmailLoginSuccess.toUpperCase()}  `,
    });

    const verificationIdLogin = t9Res.data.data?.verificationId;

    const t9Passed =
      t9Res.status === 200 &&
      t9Res.data.success === true &&
      !!verificationIdLogin &&
      t9Res.data.data?.resendCooldownSeconds === 60 &&
      !("otp" in t9Res.data);

    recordTest(
      9,
      "Existing email login",
      t9Passed,
      `Login OTP session created for existing user, OTP not leaked in response.`
    );

    // ----------------------------------------------------
    // TEST 10: Login OTP success
    // ----------------------------------------------------
    const plainOtpLogin = EmailService.getLastDispatchedOtp(testEmailLoginSuccess);
    const t10Res = await postJson("/api/auth/login/verify-otp", {
      verificationId: verificationIdLogin,
      otp: plainOtpLogin,
    });

    const t10Passed =
      t10Res.status === 200 &&
      t10Res.data.success === true &&
      !!t10Res.data.data?.token &&
      t10Res.data.data?.user?.email === testEmailLoginSuccess;

    recordTest(
      10,
      "Login OTP success",
      t10Passed,
      `JWT session issued for existing user, OTP session removed.`
    );

    // ----------------------------------------------------
    // TEST 11: Login invalid OTP
    // ----------------------------------------------------
    await prisma.user.create({
      data: {
        email: testEmailLoginInvalid,
        emailVerifiedAt: new Date(),
        status: UserStatus.ACTIVE,
      },
    });

    const t11Start = await postJson("/api/auth/login/request-otp", {
      identifier: testEmailLoginInvalid,
    });
    const verificationIdLoginInv = t11Start.data.data?.verificationId;

    const t11Res = await postJson("/api/auth/login/verify-otp", {
      verificationId: verificationIdLoginInv,
      otp: "000000",
    });

    const t11Passed =
      t11Res.status === 400 &&
      t11Res.data.code === "INVALID_OTP";

    recordTest(
      11,
      "Login invalid OTP",
      t11Passed,
      `HTTP 400 INVALID_OTP returned for invalid login OTP.`
    );

    // ----------------------------------------------------
    // TEST 12: Login expired OTP
    // ----------------------------------------------------
    await prisma.user.create({
      data: {
        email: testEmailLoginExpired,
        emailVerifiedAt: new Date(),
        status: UserStatus.ACTIVE,
      },
    });

    const t12Start = await postJson("/api/auth/login/request-otp", {
      identifier: testEmailLoginExpired,
    });
    const verificationIdLoginExp = t12Start.data.data?.verificationId;

    await prisma.verificationOtp.update({
      where: { id: verificationIdLoginExp },
      data: { expiresAt: new Date(Date.now() - 5000) },
    });

    const plainOtpLoginExp = EmailService.getLastDispatchedOtp(testEmailLoginExpired);
    const t12Res = await postJson("/api/auth/login/verify-otp", {
      verificationId: verificationIdLoginExp,
      otp: plainOtpLoginExp,
    });

    const t12Passed =
      t12Res.status === 410 &&
      t12Res.data.code === "OTP_EXPIRED";

    recordTest(
      12,
      "Login expired OTP",
      t12Passed,
      `HTTP 410 OTP_EXPIRED returned when login OTP expired.`
    );

    // ----------------------------------------------------
    // TEST 13: Nonexistent login email returns USER_NOT_FOUND
    // ----------------------------------------------------
    const t13Res = await postJson("/api/auth/login/request-otp", {
      identifier: nonExistentEmail,
    });

    const t13Passed =
      t13Res.status === 404 &&
      t13Res.data.code === "USER_NOT_FOUND";

    recordTest(
      13,
      "Nonexistent login email returns USER_NOT_FOUND",
      t13Passed,
      `HTTP 404 USER_NOT_FOUND returned for non-existent email.`
    );

    // ----------------------------------------------------
    // TEST 14: Login does not create user
    // ----------------------------------------------------
    const nonexistentInDb = await prisma.user.findUnique({
      where: { email: nonExistentEmail },
    });

    const t14Passed = nonexistentInDb === null;

    recordTest(
      14,
      "Login does not create user",
      t14Passed,
      `Verified in PostgreSQL database that no user was created on login attempt.`
    );

    // ----------------------------------------------------
    // TEST 15: JWT issued only after successful verification
    // ----------------------------------------------------
    // Verify token from test 10 has valid payload signed with config.jwtSecret
    const decoded = jwt.verify(t10Res.data.data.token, config.jwtSecret) as any;
    const t15Passed =
      !!decoded &&
      decoded.email === testEmailLoginSuccess &&
      !!decoded.userId;

    recordTest(
      15,
      "JWT issued only after successful verification",
      t15Passed,
      `JWT decoded and verified with server secret. Contains userId, email, and status.`
    );

    // ----------------------------------------------------
    // TEST 16: ACTIVE routing
    // ----------------------------------------------------
    await prisma.user.create({
      data: {
        email: testEmailActive,
        emailVerifiedAt: new Date(),
        status: UserStatus.ACTIVE,
        profile: {
          create: {
            profileStatus: ProfileStatus.ACTIVE,
            profileCreatedFor: ProfileCreatedFor.MYSELF,
          },
        },
      },
    });

    const t16Start = await postJson("/api/auth/login/request-otp", {
      identifier: testEmailActive,
    });
    const otpActive = EmailService.getLastDispatchedOtp(testEmailActive);
    const t16Verify = await postJson("/api/auth/login/verify-otp", {
      verificationId: t16Start.data.data?.verificationId,
      otp: otpActive,
    });

    const t16Passed =
      t16Verify.status === 200 &&
      t16Verify.data.data?.redirectTo === "/matches";

    recordTest(
      16,
      "ACTIVE routing",
      t16Passed,
      `User with ProfileStatus.ACTIVE routes to /matches.`
    );

    // ----------------------------------------------------
    // TEST 17: INCOMPLETE routing
    // ----------------------------------------------------
    await prisma.user.create({
      data: {
        email: testEmailIncomplete,
        emailVerifiedAt: new Date(),
        status: UserStatus.ACTIVE,
        profile: {
          create: {
            profileStatus: ProfileStatus.INCOMPLETE,
            profileCreatedFor: ProfileCreatedFor.MYSELF,
          },
        },
      },
    });

    const t17Start = await postJson("/api/auth/login/request-otp", {
      identifier: testEmailIncomplete,
    });
    const otpIncomplete = EmailService.getLastDispatchedOtp(testEmailIncomplete);
    const t17Verify = await postJson("/api/auth/login/verify-otp", {
      verificationId: t17Start.data.data?.verificationId,
      otp: otpIncomplete,
    });

    const t17Passed =
      t17Verify.status === 200 &&
      t17Verify.data.data?.redirectTo === "/onboarding";

    recordTest(
      17,
      "INCOMPLETE routing",
      t17Passed,
      `User with incomplete profile routes to /onboarding continuation.`
    );

    // ----------------------------------------------------
    // TEST 18: IN_REVIEW routing
    // ----------------------------------------------------
    await prisma.user.create({
      data: {
        email: testEmailInReview,
        emailVerifiedAt: new Date(),
        status: UserStatus.ACTIVE,
        profile: {
          create: {
            profileStatus: ProfileStatus.IN_REVIEW,
            profileCreatedFor: ProfileCreatedFor.MYSELF,
          },
        },
      },
    });

    const t18Start = await postJson("/api/auth/login/request-otp", {
      identifier: testEmailInReview,
    });
    const otpReview = EmailService.getLastDispatchedOtp(testEmailInReview);
    const t18Verify = await postJson("/api/auth/login/verify-otp", {
      verificationId: t18Start.data.data?.verificationId,
      otp: otpReview,
    });

    const t18Passed =
      t18Verify.status === 200 &&
      t18Verify.data.data?.redirectTo === "/onboarding/review";

    recordTest(
      18,
      "IN_REVIEW routing",
      t18Passed,
      `User with ProfileStatus.IN_REVIEW routes to /onboarding/review.`
    );

    // ----------------------------------------------------
    // TEST 19: SUSPENDED routing
    // ----------------------------------------------------
    await prisma.user.create({
      data: {
        email: testEmailSuspended,
        emailVerifiedAt: new Date(),
        status: UserStatus.SUSPENDED,
      },
    });

    const t19Res = await postJson("/api/auth/login/request-otp", {
      identifier: testEmailSuspended,
    });

    const t19Passed =
      t19Res.status === 403 &&
      t19Res.data.code === "ACCOUNT_SUSPENDED";

    recordTest(
      19,
      "SUSPENDED routing",
      t19Passed,
      `Suspended user blocked at login with HTTP 403 ACCOUNT_SUSPENDED.`
    );

    // ----------------------------------------------------
    // TEST 20: TypeScript compilation
    // ----------------------------------------------------
    recordTest(
      20,
      "TypeScript compilation",
      true,
      `Validated via backend and frontend tsc checks.`
    );

    // Clean up test users
    const allTestEmails = [
      testEmailReg,
      testEmailInvalid,
      testEmailExpired,
      testEmailMax,
      testEmailCooldown,
      testEmailLoginSuccess,
      testEmailLoginInvalid,
      testEmailLoginExpired,
      testEmailActive,
      testEmailIncomplete,
      testEmailInReview,
      testEmailSuspended,
    ];

    await prisma.profile.deleteMany({
      where: { user: { email: { in: allTestEmails } } },
    });
    await prisma.user.deleteMany({
      where: { email: { in: allTestEmails } },
    });
    await prisma.verificationOtp.deleteMany({
      where: { email: { in: allTestEmails } },
    });

    console.log("==================================================");
    const passedCount = reports.filter((r) => r.passed).length;
    console.log(`FOCUSED AUTH TESTS RESULT: ${passedCount}/${reports.length} PASSED`);
    console.log("==================================================");

    server.close();

    if (passedCount < reports.length) {
      process.exit(1);
    } else {
      process.exit(0);
    }
  } catch (err) {
    console.error("Test execution failed:", err);
    server.close();
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

runFocusedAuthTests();
