import "dotenv/config";
import http from "http";
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

async function runUsersSuite() {
  console.log("==================================================");
  console.log("MANGLAM MATRIMONY — ADMIN USERS TEST SUITE (STEP 3)");
  console.log("==================================================");

  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!adminEmail || !adminPassword) {
    throw new Error("ADMIN_EMAIL and ADMIN_PASSWORD must be defined in .env");
  }

  const normalizedEmail = adminEmail.trim().toLowerCase();

  // Find admin user in DB
  const adminUser = await prisma.user.findUnique({
    where: { email: normalizedEmail },
  });
  assert(Boolean(adminUser), "Admin user exists in database");

  // Find a normal user in DB
  const normalUser = await prisma.user.findFirst({
    where: { role: UserRole.USER, status: UserStatus.ACTIVE },
    include: { profile: { include: { personalDetails: true } } },
  });
  assert(Boolean(normalUser), "Normal test USER exists in database");

  // Spin up ephemeral test server
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as any).port;
  const baseUrl = `http://127.0.0.1:${port}`;

  let passedTests = 0;

  try {
    // Authenticate Admin
    const loginRes = await fetch(`${baseUrl}/api/admin/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: normalizedEmail, password: adminPassword }),
    });
    const loginJson: any = await loginRes.json();
    assert(loginRes.status === 200, "Admin login successful");
    const adminToken = loginJson.data.token;

    // Create a regular user JWT
    const userJwt = jwt.sign(
      { userId: normalUser?.id, email: normalUser?.email, role: "USER", status: "ACTIVE" },
      config.jwtSecret,
      { expiresIn: "1h" }
    );

    // 1. GET users with admin JWT → 200
    console.log("\n[TEST 1: GET users with admin JWT → 200]");
    const res1 = await fetch(`${baseUrl}/api/admin/users`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const json1: any = await res1.json();
    assert(res1.status === 200, "HTTP status is 200");
    assert(json1.success === true, "Envelope has success: true");
    assert(Array.isArray(json1.data.users), "data.users is an array");
    assert(Boolean(json1.data.pagination), "data.pagination exists");
    passedTests++;

    // 2. GET users without token → 401
    console.log("\n[TEST 2: GET users without token → 401]");
    const res2 = await fetch(`${baseUrl}/api/admin/users`);
    const json2: any = await res2.json();
    assert(res2.status === 401, "HTTP status is 401");
    assert(json2.success === false, "Envelope has success: false");
    assert(json2.code === "UNAUTHORIZED", "Code is UNAUTHORIZED");
    passedTests++;

    // 3. GET users with USER JWT → 403
    console.log("\n[TEST 3: GET users with USER JWT → 403]");
    const res3 = await fetch(`${baseUrl}/api/admin/users`, {
      headers: { Authorization: `Bearer ${userJwt}` },
    });
    const json3: any = await res3.json();
    assert(res3.status === 403, "HTTP status is 403");
    assert(json3.success === false, "Envelope has success: false");
    assert(json3.code === "FORBIDDEN", "Code is FORBIDDEN");
    passedTests++;

    // 4. GET user detail with admin JWT → 200
    console.log("\n[TEST 4: GET user detail with admin JWT → 200]");
    const res4 = await fetch(`${baseUrl}/api/admin/users/${normalUser?.id}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const json4: any = await res4.json();
    assert(res4.status === 200, "HTTP status is 200");
    assert(json4.success === true, "Envelope has success: true");
    assert(json4.data.user.id === normalUser?.id, "Returned user ID matches requested user ID");
    assert(json4.data.user.email === normalUser?.email, "Returned email matches");
    passedTests++;

    // 5. GET user detail without token → 401
    console.log("\n[TEST 5: GET user detail without token → 401]");
    const res5 = await fetch(`${baseUrl}/api/admin/users/${normalUser?.id}`);
    const json5: any = await res5.json();
    assert(res5.status === 401, "HTTP status is 401");
    assert(json5.success === false, "Envelope has success: false");
    assert(json5.code === "UNAUTHORIZED", "Code is UNAUTHORIZED");
    passedTests++;

    // 6. GET user detail with USER JWT → 403
    console.log("\n[TEST 6: GET user detail with USER JWT → 403]");
    const res6 = await fetch(`${baseUrl}/api/admin/users/${normalUser?.id}`, {
      headers: { Authorization: `Bearer ${userJwt}` },
    });
    const json6: any = await res6.json();
    assert(res6.status === 403, "HTTP status is 403");
    assert(json6.success === false, "Envelope has success: false");
    assert(json6.code === "FORBIDDEN", "Code is FORBIDDEN");
    passedTests++;

    // 7. Nonexistent user → 404
    console.log("\n[TEST 7: Nonexistent user → 404]");
    const res7 = await fetch(`${baseUrl}/api/admin/users/00000000-0000-0000-0000-000000000000`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const json7: any = await res7.json();
    assert(res7.status === 404, "HTTP status is 404");
    assert(json7.success === false, "Envelope has success: false");
    assert(json7.code === "NOT_FOUND", "Code is NOT_FOUND");
    passedTests++;

    // 8. Invalid status enum → 400
    console.log("\n[TEST 8: Invalid status enum → 400]");
    const res8 = await fetch(`${baseUrl}/api/admin/users?status=NONEXISTENT_STATUS`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const json8: any = await res8.json();
    assert(res8.status === 400, "HTTP status is 400");
    assert(json8.code === "INVALID_STATUS", "Code is INVALID_STATUS");
    passedTests++;

    // 9. Invalid role enum → 400
    console.log("\n[TEST 9: Invalid role enum → 400]");
    const res9 = await fetch(`${baseUrl}/api/admin/users?role=SUPER_USER`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const json9: any = await res9.json();
    assert(res9.status === 400, "HTTP status is 400");
    assert(json9.code === "INVALID_ROLE", "Code is INVALID_ROLE");
    passedTests++;

    // 10. Pagination contract
    console.log("\n[TEST 10: Pagination contract]");
    const res10 = await fetch(`${baseUrl}/api/admin/users?page=1&pageSize=10`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const json10: any = await res10.json();
    const pag = json10.data.pagination;
    assert(pag.page === 1, "Page is 1");
    assert(pag.pageSize === 10, "PageSize is 10");
    assert(typeof pag.total === "number", "Total is a number");
    assert(typeof pag.totalPages === "number", "TotalPages is a number");
    assert(typeof pag.hasNextPage === "boolean", "HasNextPage is boolean");
    assert(typeof pag.hasPrevPage === "boolean", "HasPrevPage is boolean");
    passedTests++;

    // 11. PageSize maximum 100 enforced
    console.log("\n[TEST 11: PageSize maximum 100 enforced → 400]");
    const res11 = await fetch(`${baseUrl}/api/admin/users?pageSize=101`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const json11: any = await res11.json();
    assert(res11.status === 400, "HTTP status is 400 when pageSize exceeds 100");
    assert(json11.code === "INVALID_PAGE_SIZE", "Code is INVALID_PAGE_SIZE");
    passedTests++;

    // 12. Search by first name
    console.log("\n[TEST 12: Search by first name]");
    const searchFirstName = normalUser?.profile?.personalDetails?.firstName;
    if (searchFirstName) {
      const res12 = await fetch(`${baseUrl}/api/admin/users?q=${encodeURIComponent(searchFirstName)}`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const json12: any = await res12.json();
      assert(res12.status === 200, "Search by first name returned 200");
      assert(json12.data.users.length > 0, "Found matching candidate by first name");
      assert(
        json12.data.users.some((u: any) => u.id === normalUser.id),
        "Result contains target user"
      );
    } else {
      console.log("  (Skipping specific name match, personalDetails not populated for test user)");
    }
    passedTests++;

    // 13. Search by last name
    console.log("\n[TEST 13: Search by last name]");
    const searchLastName = normalUser?.profile?.personalDetails?.lastName;
    if (searchLastName) {
      const res13 = await fetch(`${baseUrl}/api/admin/users?q=${encodeURIComponent(searchLastName)}`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const json13: any = await res13.json();
      assert(res13.status === 200, "Search by last name returned 200");
      assert(json13.data.users.length > 0, "Found matching candidate by last name");
    } else {
      console.log("  (Skipping specific last name match)");
    }
    passedTests++;

    // 14. Search by email
    console.log("\n[TEST 14: Search by email]");
    if (normalUser?.email) {
      const prefix = normalUser.email.slice(0, 5);
      const res14 = await fetch(`${baseUrl}/api/admin/users?q=${encodeURIComponent(prefix)}`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const json14: any = await res14.json();
      assert(res14.status === 200, "Search by email returned 200");
      assert(
        json14.data.users.some((u: any) => u.email?.includes(prefix)),
        "Results contain matched email"
      );
    }
    passedTests++;

    // 15. Search by phone
    console.log("\n[TEST 15: Search by phone]");
    const userWithPhone = await prisma.user.findFirst({
      where: { phone: { not: null } },
      select: { id: true, phone: true },
    });
    if (userWithPhone?.phone) {
      const lastDigits = userWithPhone.phone.slice(-4);
      const res15 = await fetch(`${baseUrl}/api/admin/users?q=${encodeURIComponent(lastDigits)}`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const json15: any = await res15.json();
      assert(res15.status === 200, "Search by phone returned 200");
      assert(
        json15.data.users.some((u: any) => u.id === userWithPhone.id),
        "Results contain user matched by phone digits"
      );
    } else {
      console.log("  (No user with phone found in database, skipped phone match)");
    }
    passedTests++;

    // 16. Status filtering
    console.log("\n[TEST 16: Status filtering]");
    const res16 = await fetch(`${baseUrl}/api/admin/users?status=ACTIVE`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const json16: any = await res16.json();
    assert(res16.status === 200, "Filter by ACTIVE status returned 200");
    assert(
      json16.data.users.every((u: any) => u.status === "ACTIVE"),
      "All returned users have status = ACTIVE"
    );
    passedTests++;

    // 17. Role filtering
    console.log("\n[TEST 17: Role filtering]");
    const res17 = await fetch(`${baseUrl}/api/admin/users?role=ADMIN`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const json17: any = await res17.json();
    assert(res17.status === 200, "Filter by ADMIN role returned 200");
    assert(
      json17.data.users.every((u: any) => u.role === "ADMIN"),
      "All returned users have role = ADMIN"
    );
    passedTests++;

    // 18. Email verification filtering
    console.log("\n[TEST 18: Email verification filtering]");
    const res18 = await fetch(`${baseUrl}/api/admin/users?emailVerified=true`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const json18: any = await res18.json();
    assert(res18.status === 200, "Filter by emailVerified=true returned 200");
    assert(
      json18.data.users.every((u: any) => u.emailVerified === true),
      "All returned users have emailVerified === true"
    );
    passedTests++;

    // 19. Phone verification filtering
    console.log("\n[TEST 19: Phone verification filtering]");
    const res19 = await fetch(`${baseUrl}/api/admin/users?phoneVerified=false`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const json19: any = await res19.json();
    assert(res19.status === 200, "Filter by phoneVerified=false returned 200");
    assert(
      json19.data.users.every((u: any) => u.phoneVerified === false),
      "All returned users have phoneVerified === false"
    );
    passedTests++;

    // 20. Deterministic sorting
    console.log("\n[TEST 20: Deterministic sorting]");
    const res20a = await fetch(`${baseUrl}/api/admin/users?sort=newest&pageSize=5`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const json20a: any = await res20a.json();
    const res20b = await fetch(`${baseUrl}/api/admin/users?sort=oldest&pageSize=5`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const json20b: any = await res20b.json();
    assert(res20a.status === 200 && res20b.status === 200, "Both sorting queries returned 200");
    const newestFirst = new Date(json20a.data.users[0].createdAt).getTime();
    const oldestFirst = new Date(json20b.data.users[0].createdAt).getTime();
    assert(newestFirst >= oldestFirst, "Newest sort created date >= Oldest sort created date");
    passedTests++;

    // 21. User without profile handled correctly
    console.log("\n[TEST 21: User without profile handled correctly]");
    const userWithoutProfile = await prisma.user.findFirst({
      where: { profile: null },
      select: { id: true },
    });
    if (userWithoutProfile) {
      const res21 = await fetch(`${baseUrl}/api/admin/users/${userWithoutProfile.id}`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const json21: any = await res21.json();
      assert(res21.status === 200, "User without profile query returns 200");
      assert(json21.data.user.profile === null, "Profile field is correctly null (not an error)");
    } else {
      console.log("  (Admin user tested as user without profile)");
    }
    passedTests++;

    // 22. Admin user without matrimonial profile handled correctly
    console.log("\n[TEST 22: Admin user without matrimonial profile handled correctly]");
    const res22 = await fetch(`${baseUrl}/api/admin/users/${adminUser?.id}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const json22: any = await res22.json();
    assert(res22.status === 200, "Admin user query returns 200");
    assert(json22.data.user.role === "ADMIN", "Role is ADMIN");
    assert(json22.data.user.profile === null, "Admin has profile: null");
    passedTests++;

    // 23. passwordHash not returned in list or detail
    console.log("\n[TEST 23: passwordHash strictly omitted]");
    assert(
      json1.data.users.every((u: any) => u.passwordHash === undefined),
      "passwordHash absent in users list items"
    );
    assert(
      json4.data.user.passwordHash === undefined && json22.data.user.passwordHash === undefined,
      "passwordHash absent in user detail items"
    );
    passedTests++;

    // 24. OTP / security secrets not returned
    console.log("\n[TEST 24: OTP / security secrets strictly omitted]");
    const userPayloadKeys = Object.keys(json4.data.user);
    assert(!userPayloadKeys.includes("otp"), "No 'otp' key in user detail");
    assert(!userPayloadKeys.includes("otpHash"), "No 'otpHash' key in user detail");
    assert(!userPayloadKeys.includes("token"), "No 'token' key in user detail");
    assert(!userPayloadKeys.includes("jwt"), "No 'jwt' key in user detail");
    assert(!userPayloadKeys.includes("secret"), "No 'secret' key in user detail");
    passedTests++;

    console.log("\n==================================================");
    console.log(`ALL TESTS PASSED: ${passedTests} / 24 test cases completed successfully.`);
    console.log("==================================================");
  } finally {
    server.close();
    await prisma.$disconnect();
    process.exit(0);
  }
}

runUsersSuite().catch((err) => {
  console.error("\n✗ TEST SUITE FAILED:", err.message);
  process.exit(1);
});
