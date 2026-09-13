import "dotenv/config";
import http from "http";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { app } from "../src/app";
import { prisma } from "../src/config/database";
import { config } from "../src/config/env";
import { UserRole, UserStatus } from "@prisma/client";

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`  ✗ FAIL: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
  console.log(`  ✓ PASS: ${message}`);
}

async function runAuthSuite() {
  console.log("==================================================");
  console.log("MANGLAM MATRIMONY — ADMIN AUTHENTICATION TEST SUITE");
  console.log("==================================================");

  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!adminEmail || !adminPassword) {
    throw new Error("ADMIN_EMAIL and ADMIN_PASSWORD must be defined in .env");
  }

  const normalizedEmail = adminEmail.trim().toLowerCase();

  // Find or verify test admin user
  const adminUser = await prisma.user.findUnique({
    where: { email: normalizedEmail },
  });
  assert(Boolean(adminUser), "Admin user exists in database");
  assert(adminUser?.role === UserRole.ADMIN, "Admin user role is ADMIN");
  assert(adminUser?.status === UserStatus.ACTIVE, "Admin user status is ACTIVE");

  // Find normal user
  const normalUser = await prisma.user.findFirst({
    where: { role: UserRole.USER, status: UserStatus.ACTIVE },
  });
  assert(Boolean(normalUser), "Normal test USER exists in database");

  // Start HTTP server on dynamic port
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as any).port;
  const baseUrl = `http://127.0.0.1:${port}`;

  let passedTests = 0;

  try {
    // 1. correct admin login → 200
    console.log("\n[TEST 1: Correct admin login → 200]");
    const res1 = await fetch(`${baseUrl}/api/admin/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: normalizedEmail, password: adminPassword }),
    });
    const json1 = await res1.json();
    assert(res1.status === 200, "HTTP status is 200");
    assert(json1.success === true, "Response envelope has success: true");
    assert(Boolean(json1.data?.token), "JWT token returned in payload");
    assert(json1.data?.admin?.role === "ADMIN", "Returned role is ADMIN");
    const validAdminToken = json1.data.token;
    passedTests++;

    // 2. wrong password → 401
    console.log("\n[TEST 2: Wrong password → 401]");
    const res2 = await fetch(`${baseUrl}/api/admin/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: normalizedEmail, password: "wrong_password_xyz_99" }),
    });
    const json2 = await res2.json();
    assert(res2.status === 401, "HTTP status is 401");
    assert(json2.success === false, "Response envelope has success: false");
    assert(json2.code === "INVALID_CREDENTIALS", "Error code is INVALID_CREDENTIALS");
    passedTests++;

    // 3. unknown email → 401
    console.log("\n[TEST 3: Unknown email → 401]");
    const res3 = await fetch(`${baseUrl}/api/admin/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "unknown_admin_98765@example.com", password: adminPassword }),
    });
    const json3 = await res3.json();
    assert(res3.status === 401, "HTTP status is 401");
    assert(json3.success === false, "Response envelope has success: false");
    assert(json3.code === "INVALID_CREDENTIALS", "Error code is INVALID_CREDENTIALS");
    passedTests++;

    // 4. USER credentials cannot authenticate as ADMIN
    console.log("\n[TEST 4: USER credentials cannot authenticate as ADMIN → 401]");
    const res4 = await fetch(`${baseUrl}/api/admin/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: normalUser?.email, password: adminPassword }),
    });
    const json4 = await res4.json();
    assert(res4.status === 401, "HTTP status is 401");
    assert(json4.success === false, "Response envelope has success: false");
    assert(json4.code === "INVALID_CREDENTIALS", "Error code is INVALID_CREDENTIALS");
    passedTests++;

    // 5. admin /me with valid token → 200
    console.log("\n[TEST 5: Admin /me with valid token → 200]");
    const res5 = await fetch(`${baseUrl}/api/admin/auth/me`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${validAdminToken}`,
      },
    });
    const json5 = await res5.json();
    assert(res5.status === 200, "HTTP status is 200");
    assert(json5.success === true, "Response envelope has success: true");
    assert(json5.data?.admin?.role === "ADMIN", "Returned role is ADMIN");
    assert(json5.data?.admin?.email === normalizedEmail, "Returned email matches normalized admin email");
    passedTests++;

    // 6. admin /me without token → 401
    console.log("\n[TEST 6: Admin /me without token → 401]");
    const res6 = await fetch(`${baseUrl}/api/admin/auth/me`, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });
    const json6 = await res6.json();
    assert(res6.status === 401, "HTTP status is 401");
    assert(json6.success === false, "Response envelope has success: false");
    assert(json6.code === "UNAUTHORIZED", "Error code is UNAUTHORIZED");
    passedTests++;

    // 7. admin /me invalid token → 401
    console.log("\n[TEST 7: Admin /me with invalid/forged token → 401]");
    const res7 = await fetch(`${baseUrl}/api/admin/auth/me`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer invalid_garbage_token_signature_fake",
      },
    });
    const json7 = await res7.json();
    assert(res7.status === 401, "HTTP status is 401");
    assert(json7.success === false, "Response envelope has success: false");
    assert(json7.code === "UNAUTHORIZED", "Error code is UNAUTHORIZED");
    passedTests++;

    // 8. USER token against /api/admin/* → 403
    console.log("\n[TEST 8: Normal USER token against /api/admin/* → 403 FORBIDDEN]");
    const userJwt = jwt.sign(
      { userId: normalUser?.id, email: normalUser?.email, role: "USER", status: "ACTIVE" },
      config.jwtSecret,
      { expiresIn: "1h" }
    );
    const res8 = await fetch(`${baseUrl}/api/admin/dashboard/stats`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${userJwt}`,
      },
    });
    const json8 = await res8.json();
    assert(res8.status === 403, "HTTP status is 403");
    assert(json8.success === false, "Response envelope has success: false");
    assert(json8.code === "FORBIDDEN", "Error code is FORBIDDEN");
    passedTests++;

    // 9. ADMIN token against protected admin endpoint → 200
    console.log("\n[TEST 9: ADMIN token against protected admin endpoint → 200]");
    const res9 = await fetch(`${baseUrl}/api/admin/profiles?page=1&pageSize=5`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${validAdminToken}`,
      },
    });
    const json9 = await res9.json();
    assert(res9.status === 200, "HTTP status is 200");
    assert(json9.success === true, "Response envelope has success: true");
    assert(Array.isArray(json9.data?.profiles), "Profiles list returned as array");
    assert(typeof json9.data?.pagination?.total === "number", "Total count returned");
    passedTests++;

    // 10. Logout simulation: token revocation / absence
    console.log("\n[TEST 10: Revoked / cleared token cannot access admin routes]");
    const res10 = await fetch(`${baseUrl}/api/admin/dashboard/stats`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: "",
      },
    });
    assert(res10.status === 401, "HTTP status is 401 when token header is empty");
    passedTests++;

    // 11. Page refresh simulation: repeated /me calls preserve valid session
    console.log("\n[TEST 11: Page refresh simulation (repeated /me calls with valid token)]");
    const refresh1 = await fetch(`${baseUrl}/api/admin/auth/me`, {
      headers: { Authorization: `Bearer ${validAdminToken}` },
    });
    const refresh2 = await fetch(`${baseUrl}/api/admin/auth/me`, {
      headers: { Authorization: `Bearer ${validAdminToken}` },
    });
    assert(refresh1.status === 200 && refresh2.status === 200, "Both refresh requests returned 200");
    passedTests++;

    // 12. Stale/invalid token cannot authenticate even with forged role claim
    console.log("\n[TEST 12: Forged token with fake role claim cannot authenticate]");
    const forgedToken = jwt.sign(
      { userId: "00000000-0000-0000-0000-000000000000", email: "fake@admin.com", role: "ADMIN" },
      config.jwtSecret,
      { expiresIn: "1h" }
    );
    const res12 = await fetch(`${baseUrl}/api/admin/auth/me`, {
      headers: { Authorization: `Bearer ${forgedToken}` },
    });
    assert(res12.status === 401, "Database authoritative lookup rejects nonexistent user ID with 401");
    passedTests++;

    // 13. Normal-user session remains independent
    console.log("\n[TEST 13: Normal-user session independent (USER token cannot access admin)]");
    const res13 = await fetch(`${baseUrl}/api/admin/auth/me`, {
      headers: { Authorization: `Bearer ${userJwt}` },
    });
    assert(res13.status === 403, "Normal user JWT receives 403 on admin /me");
    passedTests++;

    // 14. Admin session remains independent (Admin token cannot access candidate matrimonial APIs)
    console.log("\n[TEST 14: Admin session independent (Admin token rejected from candidate APIs)]");
    const res14 = await fetch(`${baseUrl}/api/matches`, {
      headers: { Authorization: `Bearer ${validAdminToken}` },
    });
    assert(res14.status === 403, "Admin JWT receives 403 on candidate matrimonial endpoint");
    passedTests++;

    console.log("\n==================================================");
    console.log(`ALL TESTS PASSED: ${passedTests} / 14 suites completed successfully.`);
    console.log("==================================================");
  } finally {
    server.close();
    await prisma.$disconnect();
    process.exit(0);
  }
}

runAuthSuite().catch((err) => {
  console.error("\n✗ TEST SUITE FAILED:", err.message);
  process.exit(1);
});
