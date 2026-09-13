import "dotenv/config";
import http from "http";
import jwt from "jsonwebtoken";
import { app } from "../src/app";
import { prisma } from "../src/config/database";
import { config } from "../src/config/env";
import { UserRole, UserStatus, ProfileStatus, ProfileCreatedFor } from "@prisma/client";

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`  ✗ FAIL: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
  console.log(`  ✓ PASS: ${message}`);
}

async function runUserStatusSuite() {
  console.log("==================================================");
  console.log("MANGLAM MATRIMONY — ADMIN USER STATUS TEST SUITE (STEP 5)");
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
  const cleanupUserIds: string[] = [];

  try {
    // 1. Authenticate Admin
    const loginRes = await fetch(`${baseUrl}/api/admin/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: normalizedEmail, password: adminPassword }),
    });
    const loginJson: any = await loginRes.json();
    assert(loginRes.status === 200, "Admin login successful");
    const adminToken = loginJson.data.token;

    // 2. Create a dedicated test user with profile
    const lang = await prisma.language.findFirst();
    assert(Boolean(lang), "Language exists for test profile");

    const testUser = await prisma.user.create({
      data: {
        email: `test_status_subject_${Date.now()}@example.com`,
        phone: `+919876${Math.floor(100000 + Math.random() * 900000)}`,
        role: UserRole.USER,
        status: UserStatus.ACTIVE,
        emailVerifiedAt: new Date(),
        phoneVerifiedAt: new Date(),
        passwordHash: "dummy_hashed_password",
        profile: {
          create: {
            profileCreatedFor: ProfileCreatedFor.MYSELF,
            profileStatus: ProfileStatus.ACTIVE,
            completionPercentage: 100,
            personalDetails: {
              create: {
                firstName: "StatusTest",
                lastName: "Candidate",
                gender: "FEMALE",
                dateOfBirth: new Date("1996-05-15"),
                maritalStatus: "NEVER_MARRIED",
                heightCm: 165,
                motherTongueId: lang!.id,
                city: "Jaipur",
                state: "Rajasthan",
              },
            },
          },
        },
      },
      include: { profile: { include: { personalDetails: true } } },
    });
    cleanupUserIds.push(testUser.id);
    assert(Boolean(testUser.id), "Dedicated test user created");

    // Create another normal user for caller token
    const normalCaller = await prisma.user.create({
      data: {
        email: `test_caller_${Date.now()}@example.com`,
        role: UserRole.USER,
        status: UserStatus.ACTIVE,
      },
    });
    cleanupUserIds.push(normalCaller.id);

    // Mint tokens
    const userJwt = jwt.sign(
      { userId: normalCaller.id, email: normalCaller.email, role: "USER", status: "ACTIVE" },
      config.jwtSecret,
      { expiresIn: "1h" }
    );

    // Subject user token (starts ACTIVE)
    let subjectUserJwt = jwt.sign(
      { userId: testUser.id, email: testUser.email, role: "USER", status: "ACTIVE" },
      config.jwtSecret,
      { expiresIn: "1h" }
    );

    // ==========================================
    // AUTHORIZATION TESTS
    // ==========================================
    console.log("\n--- AUTHORIZATION CHECKS ---");

    // 1. Suspend without token → 401
    const res1 = await fetch(`${baseUrl}/api/admin/users/${testUser.id}/suspend`, { method: "POST" });
    assert(res1.status === 401, "1. Suspend without token → 401");
    passedTests++;

    // 2. Suspend with USER token → 403
    const res2 = await fetch(`${baseUrl}/api/admin/users/${testUser.id}/suspend`, {
      method: "POST",
      headers: { Authorization: `Bearer ${userJwt}` },
    });
    assert(res2.status === 403, "2. Suspend with USER token → 403");
    passedTests++;

    // 3. Block without token → 401
    const res3 = await fetch(`${baseUrl}/api/admin/users/${testUser.id}/block`, { method: "POST" });
    assert(res3.status === 401, "3. Block without token → 401");
    passedTests++;

    // 4. Block with USER token → 403
    const res4 = await fetch(`${baseUrl}/api/admin/users/${testUser.id}/block`, {
      method: "POST",
      headers: { Authorization: `Bearer ${userJwt}` },
    });
    assert(res4.status === 403, "4. Block with USER token → 403");
    passedTests++;

    // 5. Restore without token → 401
    const res5 = await fetch(`${baseUrl}/api/admin/users/${testUser.id}/restore`, { method: "POST" });
    assert(res5.status === 401, "5. Restore without token → 401");
    passedTests++;

    // 6. Restore with USER token → 403
    const res6 = await fetch(`${baseUrl}/api/admin/users/${testUser.id}/restore`, {
      method: "POST",
      headers: { Authorization: `Bearer ${userJwt}` },
    });
    assert(res6.status === 403, "6. Restore with USER token → 403");
    passedTests++;

    // ==========================================
    // ADMIN SAFETY CHECKS
    // ==========================================
    console.log("\n--- ADMIN SAFETY CHECKS ---");

    // 7. Admin cannot alter own account status → 403
    const res7 = await fetch(`${baseUrl}/api/admin/users/${adminUser!.id}/suspend`, {
      method: "POST",
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const json7: any = await res7.json();
    assert(res7.status === 403, "7. Admin self-suspend rejected with 403");
    assert(json7.code === "ADMIN_SELF_STATUS_CHANGE_FORBIDDEN", "Code is ADMIN_SELF_STATUS_CHANGE_FORBIDDEN");
    passedTests++;

    // Create a 2nd admin to test protection against modifying other admins
    const secondAdmin = await prisma.user.create({
      data: {
        email: `second_admin_${Date.now()}@example.com`,
        role: UserRole.ADMIN,
        status: UserStatus.ACTIVE,
      },
    });
    cleanupUserIds.push(secondAdmin.id);

    // 8. Admin cannot suspend another admin → 403 ADMIN_ACCOUNT_PROTECTED
    const res8 = await fetch(`${baseUrl}/api/admin/users/${secondAdmin.id}/suspend`, {
      method: "POST",
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const json8: any = await res8.json();
    assert(res8.status === 403, "8. Modify another admin rejected with 403");
    assert(json8.code === "ADMIN_ACCOUNT_PROTECTED", "Code is ADMIN_ACCOUNT_PROTECTED");
    passedTests++;

    // ==========================================
    // STATUS TRANSITIONS & IDEMPOTENCY
    // ==========================================
    console.log("\n--- STATUS TRANSITIONS & IDEMPOTENCY ---");

    // 9. ACTIVE → SUSPENDED
    const res9 = await fetch(`${baseUrl}/api/admin/users/${testUser.id}/suspend`, {
      method: "POST",
      headers: { Authorization: `Bearer ${adminToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ currentStatus: "ACTIVE" }),
    });
    const json9: any = await res9.json();
    assert(res9.status === 200, "9. ACTIVE → SUSPENDED returns 200");
    assert(json9.success === true, "Envelope has success: true");
    assert(json9.data.user.status === "SUSPENDED", "User status in response is SUSPENDED");
    assert(Boolean(json9.data.user.statusChangedAt), "statusChangedAt is set");
    assert(json9.data.user.statusChangedByUser?.id === adminUser!.id, "statusChangedByUser is admin");
    assert(json9.data.user.statusChangedByUser?.email === normalizedEmail, "Moderator email matches");
    passedTests++;

    // 10. Repeated suspend is idempotent → 200
    const res10 = await fetch(`${baseUrl}/api/admin/users/${testUser.id}/suspend`, {
      method: "POST",
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const json10: any = await res10.json();
    assert(res10.status === 200, "10. Repeated suspend is idempotent (200)");
    assert(json10.code === "STATUS_UNCHANGED", "Code is STATUS_UNCHANGED");
    passedTests++;

    // 11. SUSPENDED → ACTIVE (Restore)
    const res11 = await fetch(`${baseUrl}/api/admin/users/${testUser.id}/restore`, {
      method: "POST",
      headers: { Authorization: `Bearer ${adminToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ currentStatus: "SUSPENDED" }),
    });
    const json11: any = await res11.json();
    assert(res11.status === 200, "11. SUSPENDED → ACTIVE (Restore) returns 200");
    assert(json11.data.user.status === "ACTIVE", "User status restored to ACTIVE");
    passedTests++;

    // 12. Repeated restore is idempotent → 200
    const res12 = await fetch(`${baseUrl}/api/admin/users/${testUser.id}/restore`, {
      method: "POST",
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert(res12.status === 200, "12. Repeated restore is idempotent (200)");
    passedTests++;

    // 13. ACTIVE → BLOCKED
    const res13 = await fetch(`${baseUrl}/api/admin/users/${testUser.id}/block`, {
      method: "POST",
      headers: { Authorization: `Bearer ${adminToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ currentStatus: "ACTIVE" }),
    });
    const json13: any = await res13.json();
    assert(res13.status === 200, "13. ACTIVE → BLOCKED returns 200");
    assert(json13.data.user.status === "BLOCKED", "User status changed to BLOCKED");
    passedTests++;

    // 14. Repeated block is idempotent → 200
    const res14 = await fetch(`${baseUrl}/api/admin/users/${testUser.id}/block`, {
      method: "POST",
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert(res14.status === 200, "14. Repeated block is idempotent (200)");
    passedTests++;

    // 15. Attempting to suspend a BLOCKED user → 409 ACCOUNT_STATUS_CONFLICT
    const res15 = await fetch(`${baseUrl}/api/admin/users/${testUser.id}/suspend`, {
      method: "POST",
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const json15: any = await res15.json();
    assert(res15.status === 409, "15. Suspend on BLOCKED returns 409");
    assert(json15.code === "ACCOUNT_STATUS_CONFLICT", "Code is ACCOUNT_STATUS_CONFLICT");
    passedTests++;

    // 16. BLOCKED → ACTIVE (Restore)
    const res16 = await fetch(`${baseUrl}/api/admin/users/${testUser.id}/restore`, {
      method: "POST",
      headers: { Authorization: `Bearer ${adminToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ currentStatus: "BLOCKED" }),
    });
    const json16: any = await res16.json();
    assert(res16.status === 200, "16. BLOCKED → ACTIVE (Restore) returns 200");
    assert(json16.data.user.status === "ACTIVE", "User restored to ACTIVE");
    passedTests++;

    // 17. SUSPENDED → BLOCKED transition
    await fetch(`${baseUrl}/api/admin/users/${testUser.id}/suspend`, {
      method: "POST",
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const res17 = await fetch(`${baseUrl}/api/admin/users/${testUser.id}/block`, {
      method: "POST",
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const json17: any = await res17.json();
    assert(res17.status === 200, "17. SUSPENDED → BLOCKED returns 200");
    assert(json17.data.user.status === "BLOCKED", "User transitioned from SUSPENDED to BLOCKED");
    passedTests++;

    // Restore back to ACTIVE
    await fetch(`${baseUrl}/api/admin/users/${testUser.id}/restore`, {
      method: "POST",
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    // 18. Concurrency check: Stale currentStatus passed → 409
    const res18 = await fetch(`${baseUrl}/api/admin/users/${testUser.id}/suspend`, {
      method: "POST",
      headers: { Authorization: `Bearer ${adminToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ currentStatus: "BLOCKED" }), // Client thinks it's BLOCKED, but it's ACTIVE
    });
    const json18: any = await res18.json();
    assert(res18.status === 409, "18. Stale currentStatus mismatch returns 409");
    assert(json18.code === "ACCOUNT_STATUS_CONFLICT", "Code is ACCOUNT_STATUS_CONFLICT");
    passedTests++;

    // Create a DELETED user to test terminal state
    const deletedUser = await prisma.user.create({
      data: {
        email: `deleted_user_${Date.now()}@example.com`,
        role: UserRole.USER,
        status: UserStatus.DELETED,
      },
    });
    cleanupUserIds.push(deletedUser.id);

    // 19. DELETED cannot be restored → 409
    const res19 = await fetch(`${baseUrl}/api/admin/users/${deletedUser.id}/restore`, {
      method: "POST",
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert(res19.status === 409, "19. DELETED cannot be restored → 409");
    passedTests++;

    // 20. DELETED cannot be suspended → 409
    const res20 = await fetch(`${baseUrl}/api/admin/users/${deletedUser.id}/suspend`, {
      method: "POST",
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert(res20.status === 409, "20. DELETED cannot be suspended → 409");
    passedTests++;

    // 21. DELETED cannot be blocked → 409
    const res21 = await fetch(`${baseUrl}/api/admin/users/${deletedUser.id}/block`, {
      method: "POST",
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert(res21.status === 409, "21. DELETED cannot be blocked → 409");
    passedTests++;

    // ==========================================
    // AUDIT & DATA INTEGRITY
    // ==========================================
    console.log("\n--- AUDIT & DATA INTEGRITY ---");

    // Suspend testUser again to inspect DB audit fields
    await fetch(`${baseUrl}/api/admin/users/${testUser.id}/suspend`, {
      method: "POST",
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    // 22. Inspect DB audit persistence directly
    const dbRecord = await prisma.user.findUnique({
      where: { id: testUser.id },
      include: { profile: { include: { personalDetails: true } } },
    });
    assert(dbRecord?.status === "SUSPENDED", "22. DB status is SUSPENDED");
    assert(Boolean(dbRecord?.statusChangedAt), "23. DB statusChangedAt is populated");
    assert(dbRecord?.statusChangedByUserId === adminUser!.id, "24. DB statusChangedByUserId matches admin ID");
    passedTests += 3;

    // 25. Data integrity: profileStatus, role, passwordHash, and personal details unchanged
    assert(dbRecord?.profile?.profileStatus === ProfileStatus.ACTIVE, "25. profileStatus remains ACTIVE");
    assert(dbRecord?.profile?.completionPercentage === 100, "26. completionPercentage remains 100");
    assert(dbRecord?.role === UserRole.USER, "27. role remains USER");
    assert(dbRecord?.passwordHash === "dummy_hashed_password", "28. passwordHash remains unchanged");
    assert(Boolean(dbRecord?.emailVerifiedAt), "29. emailVerifiedAt remains intact");
    assert(Boolean(dbRecord?.phoneVerifiedAt), "30. phoneVerifiedAt remains intact");
    assert(dbRecord?.profile?.personalDetails?.firstName === "StatusTest", "31. Personal details preserved");
    passedTests += 7;

    // 32. GET /api/admin/users/:userId returns audit details safely
    const res32 = await fetch(`${baseUrl}/api/admin/users/${testUser.id}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const json32: any = await res32.json();
    assert(res32.status === 200, "32. GET user detail returns 200");
    assert(json32.data.user.statusChangedByUser?.email === normalizedEmail, "33. Detail returns moderator email");
    assert(json32.data.user.passwordHash === undefined, "34. passwordHash strictly omitted");
    passedTests += 3;

    // 35. Deleted moderator handled safely (SetNull relation)
    // Create a temporary admin, have them change status, then delete the admin
    const tempAdmin = await prisma.user.create({
      data: {
        email: `temp_admin_${Date.now()}@example.com`,
        role: UserRole.ADMIN,
        status: UserStatus.ACTIVE,
      },
    });
    await prisma.user.update({
      where: { id: testUser.id },
      data: {
        statusChangedByUserId: tempAdmin.id,
      },
    });
    // Delete tempAdmin
    await prisma.user.delete({ where: { id: tempAdmin.id } });

    const res35 = await fetch(`${baseUrl}/api/admin/users/${testUser.id}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const json35: any = await res35.json();
    assert(res35.status === 200, "35. User detail loads even after moderator deletion");
    assert(json35.data.user.statusChangedByUser === null, "36. statusChangedByUser is null after moderator deleted");
    passedTests += 2;

    // ==========================================
    // NORMAL USER ACCESS ENFORCEMENT
    // ==========================================
    console.log("\n--- NORMAL USER ACCESS ENFORCEMENT ---");

    // testUser is currently SUSPENDED
    // 37. SUSPENDED user receives 403 ACCOUNT_SUSPENDED
    const res37 = await fetch(`${baseUrl}/api/matches`, {
      headers: { Authorization: `Bearer ${subjectUserJwt}` },
    });
    const json37: any = await res37.json();
    assert(res37.status === 403, "37. SUSPENDED user receives 403");
    assert(json37.code === "ACCOUNT_SUSPENDED", "Code is ACCOUNT_SUSPENDED");
    passedTests++;

    // Change testUser to BLOCKED
    await fetch(`${baseUrl}/api/admin/users/${testUser.id}/block`, {
      method: "POST",
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    // 38. BLOCKED user receives 403 ACCOUNT_BLOCKED
    const res38 = await fetch(`${baseUrl}/api/matches`, {
      headers: { Authorization: `Bearer ${subjectUserJwt}` },
    });
    const json38: any = await res38.json();
    assert(res38.status === 403, "38. BLOCKED user receives 403");
    assert(json38.code === "ACCOUNT_BLOCKED", "Code is ACCOUNT_BLOCKED");
    passedTests++;

    // Restore testUser to ACTIVE
    await fetch(`${baseUrl}/api/admin/users/${testUser.id}/restore`, {
      method: "POST",
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    // 39. ACTIVE user regains access with existing token → 200
    const res39 = await fetch(`${baseUrl}/api/matches`, {
      headers: { Authorization: `Bearer ${subjectUserJwt}` },
    });
    const json39: any = await res39.json();
    assert(res39.status === 200, "39. ACTIVE user regains access (200)");
    assert(json39.success === true, "Matches response has success: true");
    passedTests++;

    // 40. DELETED user token receives 403 ACCOUNT_DELETED
    const deletedToken = jwt.sign(
      { userId: deletedUser.id, email: deletedUser.email, role: "USER", status: "ACTIVE" },
      config.jwtSecret,
      { expiresIn: "1h" }
    );
    const res40 = await fetch(`${baseUrl}/api/matches`, {
      headers: { Authorization: `Bearer ${deletedToken}` },
    });
    const json40: any = await res40.json();
    assert(res40.status === 403, "40. DELETED user rejected with 403");
    assert(json40.code === "ACCOUNT_DELETED", "Code is ACCOUNT_DELETED");
    passedTests++;

    console.log("\n==================================================");
    console.log(`ALL ${passedTests} USER STATUS TESTS PASSED!`);
    console.log("==================================================");
  } finally {
    // Cleanup created test users
    if (cleanupUserIds.length > 0) {
      // First delete profiles of cleanup users
      await prisma.profile.deleteMany({
        where: { userId: { in: cleanupUserIds } },
      });
      await prisma.user.deleteMany({
        where: { id: { in: cleanupUserIds } },
      });
      console.log(`[CLEANUP] Deleted ${cleanupUserIds.length} test user records`);
    }
    server.close();
    await prisma.$disconnect();
  }
}

runUserStatusSuite().catch((err) => {
  console.error("Test suite failed:", err);
  process.exit(1);
});
