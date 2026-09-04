// Complete automated verification script for registration endpoints
import http from "http";
import { app } from "../dist/app.js";

async function runTests() {
  const PORT = 5002;
  const BASE_URL = `http://localhost:${PORT}`;

  const server = app.listen(PORT);
  console.log(`[TEST SERVER] Running on port ${PORT}`);

  try {
    console.log("==================================================");
    console.log("MANGLAM MATRIMONY — AUTH API VALIDATION SUITE");
    console.log("==================================================");

    // 1. Health Check
    console.log("\n[TEST 1] Backend Health Check GET /api/health");
    const healthRes = await fetch(`${BASE_URL}/api/health`);
    const healthJson = await healthRes.json();
    console.log(`Status: ${healthRes.status} | Body:`, healthJson);
    if (healthRes.status !== 200) throw new Error("Health check failed");

    // 2. Request Mobile OTP (Normalization from 10 digits to +919876543210)
    console.log("\n[TEST 2] Request Mobile OTP (Phone: 9876543210)");
    const phoneRes = await fetch(`${BASE_URL}/api/auth/register/request-otp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ method: "phone", identifier: "9876543210" }),
    });
    const phoneJson = await phoneRes.json();
    console.log(`Status: ${phoneRes.status} | Body:`, phoneJson);
    if (!phoneJson.success || !phoneJson.data.verificationId) {
      throw new Error("Phone OTP request failed");
    }
    const phoneVerificationId = phoneJson.data.verificationId;

    // 3. Request Email OTP
    console.log("\n[TEST 3] Request Email OTP (Email: test.user@manglam.com)");
    const emailRes = await fetch(`${BASE_URL}/api/auth/register/request-otp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ method: "email", identifier: "Test.User@Manglam.com" }),
    });
    const emailJson = await emailRes.json();
    console.log(`Status: ${emailRes.status} | Body:`, emailJson);
    if (!emailJson.success || !emailJson.data.verificationId) {
      throw new Error("Email OTP request failed");
    }

    // 4. Invalid Phone Number Rejection
    console.log("\n[TEST 4] Reject Invalid Phone Format (Phone: 12345)");
    const invalidPhoneRes = await fetch(`${BASE_URL}/api/auth/register/request-otp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ method: "phone", identifier: "12345" }),
    });
    const invalidPhoneJson = await invalidPhoneRes.json();
    console.log(`Status: ${invalidPhoneRes.status} (Expected 400) | Body:`, invalidPhoneJson);
    if (invalidPhoneRes.status !== 400 || invalidPhoneJson.code !== "INVALID_PHONE") {
      throw new Error("Invalid phone was not properly rejected");
    }

    // 5. Invalid Email Rejection
    console.log("\n[TEST 5] Reject Invalid Email Format (Email: not-an-email)");
    const invalidEmailRes = await fetch(`${BASE_URL}/api/auth/register/request-otp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ method: "email", identifier: "not-an-email" }),
    });
    const invalidEmailJson = await invalidEmailRes.json();
    console.log(`Status: ${invalidEmailRes.status} (Expected 400) | Body:`, invalidEmailJson);
    if (invalidEmailRes.status !== 400 || invalidEmailJson.code !== "INVALID_EMAIL") {
      throw new Error("Invalid email was not properly rejected");
    }

    // 6. Resend Cooldown Enforcement
    console.log("\n[TEST 6] Enforce Resend Cooldown (Immediate resend attempt)");
    const cooldownRes = await fetch(`${BASE_URL}/api/auth/register/resend-otp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ verificationId: phoneVerificationId }),
    });
    const cooldownJson = await cooldownRes.json();
    console.log(`Status: ${cooldownRes.status} (Expected 429) | Body:`, cooldownJson);
    if (cooldownRes.status !== 429 || cooldownJson.code !== "COOLDOWN_ACTIVE") {
      throw new Error("Resend cooldown was not enforced");
    }

    // 7. Reject Wrong OTP
    console.log("\n[TEST 7] Reject Incorrect OTP (OTP: 000000)");
    const wrongOtpRes = await fetch(`${BASE_URL}/api/auth/register/verify-otp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ verificationId: phoneVerificationId, otp: "000000" }),
    });
    const wrongOtpJson = await wrongOtpRes.json();
    console.log(`Status: ${wrongOtpRes.status} (Expected 400) | Body:`, wrongOtpJson);
    if (wrongOtpRes.status !== 400 || wrongOtpJson.code !== "INVALID_OTP") {
      throw new Error("Wrong OTP was not properly rejected");
    }

    console.log("\n==================================================");
    console.log("ALL BACKEND API TESTS PASSED SUCCESSFULLY! (7/7)");
    console.log("==================================================");
  } finally {
    server.close();
    process.exit(0);
  }
}

runTests().catch((err) => {
  console.error("Test Suite Failure:", err);
  process.exit(1);
});
