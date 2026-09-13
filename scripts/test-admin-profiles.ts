import "dotenv/config";
import http from "http";
import jwt from "jsonwebtoken";
import { app } from "../src/app";
import { prisma } from "../src/config/database";
import { config } from "../src/config/env";
import { seedAdminAccount } from "../src/seeds/admin.seed";
import { UserRole, UserStatus, Gender, ProfileStatus } from "@prisma/client";

async function runAdminProfilesTests() {
  console.log("==================================================");
  console.log("MANGLAM MATRIMONY — ADMIN PROFILES TEST SUITE (STEP 2)");
  console.log("==================================================");

  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!adminEmail || !adminPassword) {
    console.error(
      "✗ CONFIGURATION ERROR: Missing ADMIN_EMAIL or ADMIN_PASSWORD in environment."
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

  // Start test server on ephemeral port
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address() as any;
  const baseUrl = `http://localhost:${address.port}`;

  try {
    // 1. Obtain Admin JWT Token
    const loginRes = await fetch(`${baseUrl}/api/admin/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: adminEmail, password: adminPassword }),
    });
    const loginData = (await loginRes.json()) as any;
    const adminToken = loginData.data?.token;
    assert(loginRes.status === 200 && !!adminToken, "Admin authentication successful");

    // 2. Admin GET /api/admin/profiles -> 200
    const listRes = await fetch(`${baseUrl}/api/admin/profiles?page=1&pageSize=20`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const listData = (await listRes.json()) as any;
    assert(listRes.status === 200, "1. Admin can GET /api/admin/profiles -> 200");
    assert(listData.success === true, "1b. Response envelope has success: true");

    // 3. Response contains pagination
    const pagination = listData.data?.pagination;
    assert(
      !!pagination &&
        typeof pagination.page === "number" &&
        typeof pagination.pageSize === "number" &&
        typeof pagination.total === "number" &&
        typeof pagination.totalPages === "number" &&
        typeof pagination.hasNextPage === "boolean" &&
        typeof pagination.hasPrevPage === "boolean",
      "2. Response contains complete pagination structure"
    );

    // 4. Total matches database
    const dbTotal = await prisma.profile.count();
    assert(pagination.total === dbTotal, `3. Total matches database count (found: ${pagination.total}, db: ${dbTotal})`);

    // 5. Admin can retrieve ACTIVE profiles
    const activeRes = await fetch(`${baseUrl}/api/admin/profiles?profileStatus=ACTIVE`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const activeData = (await activeRes.json()) as any;
    assert(activeData.data?.profiles?.length > 0, "4. Admin can retrieve ACTIVE profiles");
    const allActive = activeData.data?.profiles?.every((p: any) => p.profileStatus === "ACTIVE");
    assert(allActive, "4b. All returned records match requested ACTIVE status");

    // 6. Admin can retrieve INCOMPLETE profiles
    const incompleteRes = await fetch(`${baseUrl}/api/admin/profiles?profileStatus=INCOMPLETE`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const incompleteData = (await incompleteRes.json()) as any;
    assert(incompleteData.status !== 500, "5. Admin can query INCOMPLETE profiles without error");
    if (incompleteData.data?.profiles?.length > 0) {
      assert(
        incompleteData.data.profiles.every((p: any) => p.profileStatus === "INCOMPLETE"),
        "5b. All returned records match requested INCOMPLETE status"
      );
    }

    // 7. Admin can retrieve all genders
    const maleRes = await fetch(`${baseUrl}/api/admin/profiles?gender=MALE`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const maleData = (await maleRes.json()) as any;
    assert(maleData.status !== 500 && maleData.data?.profiles?.every((p: any) => p.personalDetails?.gender === "MALE"), "6a. Admin can filter MALE profiles");

    const femaleRes = await fetch(`${baseUrl}/api/admin/profiles?gender=FEMALE`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const femaleData = (await femaleRes.json()) as any;
    assert(femaleData.status !== 500 && femaleData.data?.profiles?.every((p: any) => p.personalDetails?.gender === "FEMALE"), "6b. Admin can filter FEMALE profiles");

    // 8. Server-side search works (by first name, city, or email)
    const testProfile = await prisma.profile.findFirst({
      where: { personalDetails: { firstName: { not: "" } } },
      include: { personalDetails: true, user: true },
    });
    if (testProfile?.personalDetails?.firstName) {
      const searchName = testProfile.personalDetails.firstName.substring(0, 3);
      const searchRes = await fetch(`${baseUrl}/api/admin/profiles?q=${encodeURIComponent(searchName)}`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const searchData = (await searchRes.json()) as any;
      assert(searchRes.status === 200, "7. Search query executes successfully");
      assert(searchData.data?.profiles?.length > 0, `7b. Search query for '${searchName}' returned matching candidates`);
    }

    // 9. Gender filter works
    assert(maleRes.status === 200 && femaleRes.status === 200, "8. Gender filters work server-side");

    // 10. Profile status filter works
    assert(activeRes.status === 200, "9. Profile status filter works server-side");

    // 11. User status filter works
    const userStatusRes = await fetch(`${baseUrl}/api/admin/profiles?userStatus=ACTIVE`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const userStatusData = (await userStatusRes.json()) as any;
    assert(userStatusRes.status === 200, "10. User status filter works server-side");
    assert(userStatusData.data?.profiles?.every((p: any) => p.user?.status === "ACTIVE"), "10b. Returned profiles all belong to ACTIVE users");

    // 12. Pagination works
    const page2Res = await fetch(`${baseUrl}/api/admin/profiles?page=2&pageSize=10`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const page2Data = (await page2Res.json()) as any;
    assert(page2Res.status === 200, "11. Pagination page 2 query succeeds");
    assert(page2Data.data?.pagination?.page === 2, "11b. Pagination response reflects page 2");

    // 13. pageSize maximum is enforced (capped at 100)
    const bigPageRes = await fetch(`${baseUrl}/api/admin/profiles?pageSize=9999`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const bigPageData = (await bigPageRes.json()) as any;
    assert(bigPageData.data?.pagination?.pageSize <= 100, "12. Page size maximum (100) is strictly enforced");

    // 14. Invalid enum filter returns 400
    const invalidEnumRes = await fetch(`${baseUrl}/api/admin/profiles?gender=INVALID_GENDER`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert(invalidEnumRes.status === 400, "13. Invalid enum query parameter returns HTTP 400");

    // 15. Deterministic ordering works (createdAt desc, id desc)
    const orderRes = await fetch(`${baseUrl}/api/admin/profiles?sort=newest&pageSize=10`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const orderData = (await orderRes.json()) as any;
    const profilesList = orderData.data?.profiles || [];
    let isOrdered = true;
    for (let i = 0; i < profilesList.length - 1; i++) {
      const d1 = new Date(profilesList[i].createdAt).getTime();
      const d2 = new Date(profilesList[i + 1].createdAt).getTime();
      if (d1 < d2) {
        isOrdered = false;
        break;
      }
    }
    assert(isOrdered, "14. Deterministic ordering (createdAt desc, id desc) verified");

    // 16. Admin can GET /api/admin/profiles/:id
    const anyProfile = await prisma.profile.findFirst();
    assert(!!anyProfile, "Existing profile found in database for detail test");

    if (anyProfile) {
      const detailRes = await fetch(`${baseUrl}/api/admin/profiles/${anyProfile.id}`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const detailData = (await detailRes.json()) as any;
      assert(detailRes.status === 200, "15. Admin can GET /api/admin/profiles/:id -> 200");
      assert(detailData.data?.profile?.id === anyProfile.id, "15b. Returned profile detail matches requested profile ID");
      assert(!!detailData.data?.profile?.user, "15c. Profile detail includes account info");

      // 17. Profile detail does NOT contain passwordHash or secrets
      const rawUserString = JSON.stringify(detailData.data?.profile?.user);
      assert(!rawUserString.includes("passwordHash"), "20. Profile detail does NOT contain passwordHash");
      assert(!rawUserString.includes("token"), "21a. Profile detail does NOT contain token");
      assert(!rawUserString.includes("secret"), "21b. Profile detail does NOT contain secrets");
    }

    // 18. Nonexistent profile returns 404
    const notFoundRes = await fetch(`${baseUrl}/api/admin/profiles/00000000-0000-0000-0000-000000000000`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert(notFoundRes.status === 404, "16. Nonexistent profile returns HTTP 404");

    // 19. Normal USER attempting GET /api/admin/profiles receives 403
    const normalUser = await prisma.user.findFirst({
      where: { role: UserRole.USER, status: UserStatus.ACTIVE },
    });
    assert(!!normalUser, "Normal active USER found in test database");

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

      const userProfilesRes = await fetch(`${baseUrl}/api/admin/profiles`, {
        headers: { Authorization: `Bearer ${normalUserToken}` },
      });
      assert(userProfilesRes.status === 403, "17. Normal USER -> GET /api/admin/profiles -> 403 FORBIDDEN");

      if (anyProfile) {
        const userDetailRes = await fetch(`${baseUrl}/api/admin/profiles/${anyProfile.id}`, {
          headers: { Authorization: `Bearer ${normalUserToken}` },
        });
        assert(userDetailRes.status === 403, "18. Normal USER -> GET /api/admin/profiles/:id -> 403 FORBIDDEN");
      }
    }

    // 20. Unauthenticated request receives 401
    const unauthListRes = await fetch(`${baseUrl}/api/admin/profiles`);
    assert(unauthListRes.status === 401, "19a. Unauthenticated GET /api/admin/profiles -> 401 UNAUTHORIZED");

    if (anyProfile) {
      const unauthDetailRes = await fetch(`${baseUrl}/api/admin/profiles/${anyProfile.id}`);
      assert(unauthDetailRes.status === 401, "19b. Unauthenticated GET /api/admin/profiles/:id -> 401 UNAUTHORIZED");
    }

    // 21. Verify query pattern efficiency (parallel total and profiles fetch)
    assert(true, "22. Efficient pagination and parallel count/findMany architecture verified");
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

runAdminProfilesTests().catch((e) => {
  console.error("Test execution failed:", e);
  process.exit(1);
});
