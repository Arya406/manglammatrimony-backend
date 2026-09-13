import "dotenv/config";
import http from "http";
import jwt from "jsonwebtoken";
import { app } from "../src/app";
import { prisma } from "../src/config/database";
import { config } from "../src/config/env";
import { seedAdminAccount } from "../src/seeds/admin.seed";
import { UserRole, UserStatus } from "@prisma/client";

async function runAdminStep1Tests() {
  console.log("==================================================");
  console.log("MANGLAM MATRIMONY — ADMIN STEP 1 REGRESSION TEST");
  console.log("==================================================");

  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!adminEmail || !adminPassword) {
    console.error(
      "✗ CONFIGURATION ERROR: Missing required test environment variables: ADMIN_EMAIL and ADMIN_PASSWORD. Please configure them in .env before running tests."
    );
    process.exit(1);
  }

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, message: string) {
    if (condition) {
      console.log(`  ✓ PASS: ${message}`);
      passed++;
    } else {
      console.error(`  ✗ FAIL: ${message}`);
      failed++;
    }
  }

  // Ensure admin account is bootstrapped
  await seedAdminAccount();

  // Start test server on dynamic ephemeral port
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address() as any;
  const baseUrl = `http://localhost:${address.port}`;

  try {
    // 1. Verify admin record in DB
    const adminUser = await prisma.user.findUnique({
      where: { email: adminEmail.trim().toLowerCase() },
      include: { profile: true },
    });
    assert(!!adminUser, "Admin user exists in database");
    assert(adminUser?.role === UserRole.ADMIN, "Admin user role is ADMIN");
    assert(adminUser?.status === UserStatus.ACTIVE, "Admin user status is ACTIVE");
    assert(
      Boolean(
        adminUser?.passwordHash &&
          (adminUser.passwordHash.startsWith("$2a$") || adminUser.passwordHash.startsWith("$2b$"))
      ),
      "Admin password is securely bcrypt-hashed (not plaintext)"
    );
    assert(adminUser?.profile === null, "Admin account does NOT have a matrimonial Profile");

    // 2. Admin login with correct credentials
    const loginRes = await fetch(`${baseUrl}/api/admin/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: adminEmail, password: adminPassword }),
    });
    const loginData = (await loginRes.json()) as any;
    assert(loginRes.status === 200, "Admin login succeeds with HTTP 200");
    assert(loginData.success === true, "Admin login response has success: true");
    assert(!!loginData.data?.token, "Admin login returns JWT token");
    assert(loginData.data?.admin?.role === "ADMIN", "Returned admin payload has role ADMIN");

    const adminToken = loginData.data?.token;

    // 3. Admin login with wrong password
    const wrongPassRes = await fetch(`${baseUrl}/api/admin/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: adminEmail, password: "wrong_password_999" }),
    });
    const wrongPassData = (await wrongPassRes.json()) as any;
    assert(wrongPassRes.status === 401, "Wrong password returns HTTP 401");
    assert(wrongPassData.success === false, "Wrong password response has success: false");
    assert(wrongPassData.message === "Invalid email or password.", "Generic error message on wrong password");

    // 4. Admin login with nonexistent email
    const unknownEmailRes = await fetch(`${baseUrl}/api/admin/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "unknown_random_admin@gmail.com", password: "some_password" }),
    });
    const unknownEmailData = (await unknownEmailRes.json()) as any;
    assert(unknownEmailRes.status === 401, "Nonexistent email returns HTTP 401");
    assert(unknownEmailData.message === "Invalid email or password.", "Generic error message on nonexistent email");

    // 5. Admin GET /api/admin/auth/me
    const meRes = await fetch(`${baseUrl}/api/admin/auth/me`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const meData = (await meRes.json()) as any;
    assert(meRes.status === 200, "Admin GET /api/admin/auth/me returns HTTP 200");
    assert(meData.data?.admin?.role === "ADMIN", "Admin /me confirms role is ADMIN");

    // 6. Admin GET /api/admin/dashboard/stats
    const statsRes = await fetch(`${baseUrl}/api/admin/dashboard/stats`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const statsData = (await statsRes.json()) as any;
    assert(statsRes.status === 200, "Admin GET /api/admin/dashboard/stats returns HTTP 200");
    assert(typeof statsData.data?.users === "number", "Stats data includes numeric total users count");
    assert(typeof statsData.data?.profiles === "number", "Stats data includes numeric total profiles count");
    assert(typeof statsData.data?.activeProfiles === "number", "Stats data includes numeric active profiles count");
    assert(typeof statsData.data?.incompleteProfiles === "number", "Stats data includes numeric incomplete profiles count");

    console.log(
      `  [DB STATS VERIFIED]: users=${statsData.data.users}, profiles=${statsData.data.profiles}, active=${statsData.data.activeProfiles}, incomplete=${statsData.data.incompleteProfiles}`
    );

    // 7. Find normal active USER and generate normal user token
    const normalUser = await prisma.user.findFirst({
      where: {
        role: UserRole.USER,
        status: UserStatus.ACTIVE,
      },
    });
    assert(!!normalUser, "Normal active USER exists in test database");

    if (normalUser) {
      const normalUserToken = jwt.sign(
        {
          userId: normalUser.id,
          phone: normalUser.phone,
          email: normalUser.email,
          status: normalUser.status,
          role: normalUser.role,
        },
        config.jwtSecret,
        { expiresIn: "1h" }
      );

      // 8. Normal USER attempting GET /api/admin/dashboard/stats receives 403
      const userStatsRes = await fetch(`${baseUrl}/api/admin/dashboard/stats`, {
        headers: { Authorization: `Bearer ${normalUserToken}` },
      });
      const userStatsData = (await userStatsRes.json()) as any;
      assert(userStatsRes.status === 403, "Normal USER accessing /api/admin/dashboard/stats receives HTTP 403 FORBIDDEN");
      assert(userStatsData.code === "FORBIDDEN", "Error code is FORBIDDEN");

      // 9. Normal USER attempting GET /api/admin/auth/me receives 403
      const userMeRes = await fetch(`${baseUrl}/api/admin/auth/me`, {
        headers: { Authorization: `Bearer ${normalUserToken}` },
      });
      assert(userMeRes.status === 403, "Normal USER accessing /api/admin/auth/me receives HTTP 403 FORBIDDEN");
    }

    // 10. Unauthenticated request to /api/admin/dashboard/stats receives 401
    const noTokenRes = await fetch(`${baseUrl}/api/admin/dashboard/stats`);
    assert(noTokenRes.status === 401, "Unauthenticated request to admin stats receives HTTP 401 UNAUTHORIZED");
  } finally {
    server.close();
    await prisma.$disconnect();
  }

  console.log("==================================================");
  console.log(`TEST RESULTS: ${passed} passed, ${failed} failed`);
  console.log("==================================================");

  if (failed > 0) {
    process.exit(1);
  }
  process.exit(0);
}

runAdminStep1Tests().catch((e) => {
  console.error("Test execution failed:", e);
  process.exit(1);
});
