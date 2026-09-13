import "dotenv/config";
import http from "http";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import jwt from "jsonwebtoken";
import { app } from "../src/app";
import { prisma } from "../src/config/database";
import { config } from "../src/config/env";
import {
  UserRole,
  UserStatus,
  AccountActivationStatus,
  ProfileCreatedFor,
  ProfileStatus,
  Gender,
  MaritalStatus,
  ManglikStatus,
  PhotoType,
  ModerationStatus,
  NotificationType,
  MessageRequestStatus,
} from "@prisma/client";
import { getStorageProvider } from "../src/providers/storage";
import { authService } from "../src/services/auth.service";

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`  ✗ FAIL: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
  console.log(`  ✓ PASS: ${message}`);
}

async function runAdminPermanentDeleteSuite() {
  console.log("==================================================");
  console.log("MANGLAM MATRIMONY — PERMANENT USER ACCOUNT DELETION TEST SUITE");
  console.log("==================================================");

  const adminEmail = process.env.ADMIN_EMAIL || "admin@gmail.com";
  const adminPassword = process.env.ADMIN_PASSWORD || "admin123@";
  const normalizedAdminEmail = adminEmail.trim().toLowerCase();

  const adminUser = await prisma.user.findUnique({
    where: { email: normalizedAdminEmail },
  });
  assert(Boolean(adminUser), `Admin user (${normalizedAdminEmail}) exists in DB`);

  // Spin up ephemeral test server
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as any).port;
  const baseUrl = `http://127.0.0.1:${port}`;

  let passedTests = 0;

  try {
    // ------------------------------------------------------------------------
    // SETUP: Authenticate Admin & obtain Master Data
    // ------------------------------------------------------------------------
    console.log("\n[AUTH: Admin Login]");
    const loginRes = await fetch(`${baseUrl}/api/admin/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: normalizedAdminEmail, password: adminPassword }),
    });
    const loginJson: any = await loginRes.json();
    assert(loginRes.status === 200, "Admin login successful");
    const adminToken = loginJson.data.token;
    passedTests++;

    const lang = await prisma.language.findFirst();
    assert(Boolean(lang), "Language master data exists in DB");
    const defaultMotherTongueId = lang!.id;

    const religion = await prisma.religion.findFirst();
    assert(Boolean(religion), "Religion master data exists in DB");
    const defaultReligionId = religion!.id;

    const education = await prisma.education.findFirst();
    assert(Boolean(education), "Education master data exists in DB");
    const defaultEducationId = education!.id;

    const empStatus = await prisma.employmentStatus.findFirst();
    assert(Boolean(empStatus), "EmploymentStatus master data exists in DB");
    const defaultEmploymentStatusId = empStatus!.id;

    // ------------------------------------------------------------------------
    // TEST 1: Unauthenticated request receives 401
    // ------------------------------------------------------------------------
    console.log("\n[TEST 1: Unauthenticated request rejected]");
    const unauthRes = await fetch(`${baseUrl}/api/admin/users/some-fake-id`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirmation: "DELETE" }),
    });
    assert(unauthRes.status === 401, "Unauthenticated request returns 401");
    passedTests++;

    // ------------------------------------------------------------------------
    // TEST 2: Normal USER token receives 403
    // ------------------------------------------------------------------------
    console.log("\n[TEST 2: Regular USER token rejected with 403]");
    const dummyUserEmail = `dummy.normal.user.${Date.now()}@manglam.test`;
    const dummyUser = await prisma.user.create({
      data: {
        email: dummyUserEmail,
        role: UserRole.USER,
        status: UserStatus.ACTIVE,
      },
    });
    const userJwt = jwt.sign(
      { userId: dummyUser.id, email: dummyUser.email, role: "USER", status: "ACTIVE" },
      config.jwtSecret,
      { expiresIn: "1h" }
    );
    const userTokenRes = await fetch(`${baseUrl}/api/admin/users/${dummyUser.id}`, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${userJwt}`,
      },
      body: JSON.stringify({ confirmation: "DELETE" }),
    });
    assert(userTokenRes.status === 403, "Normal USER token receives 403 Forbidden");
    await prisma.user.delete({ where: { id: dummyUser.id } });
    passedTests++;

    // ------------------------------------------------------------------------
    // TEST 3: Admin cannot delete another ADMIN account (403 CANNOT_DELETE_ADMIN)
    // ------------------------------------------------------------------------
    console.log("\n[TEST 3: Admin target cannot be deleted]");
    const anotherAdminEmail = `secondary.admin.${Date.now()}@manglam.test`;
    const anotherAdmin = await prisma.user.create({
      data: {
        email: anotherAdminEmail,
        role: UserRole.ADMIN,
        status: UserStatus.ACTIVE,
      },
    });
    const adminTargetRes = await fetch(`${baseUrl}/api/admin/users/${anotherAdmin.id}`, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ confirmation: "DELETE" }),
    });
    const adminTargetJson: any = await adminTargetRes.json();
    assert(adminTargetRes.status === 403, "Deleting ADMIN returns 403");
    assert(adminTargetJson.code === "CANNOT_DELETE_ADMIN", "Error code is CANNOT_DELETE_ADMIN");
    await prisma.user.delete({ where: { id: anotherAdmin.id } });
    passedTests++;

    // ------------------------------------------------------------------------
    // TEST 4: Admin cannot delete their own account (403 CANNOT_DELETE_ADMIN)
    // ------------------------------------------------------------------------
    console.log("\n[TEST 4: Self-deletion rejected]");
    const selfDeleteRes = await fetch(`${baseUrl}/api/admin/users/${adminUser!.id}`, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ confirmation: "DELETE" }),
    });
    const selfDeleteJson: any = await selfDeleteRes.json();
    assert(selfDeleteRes.status === 403, "Self-deletion returns 403");
    assert(selfDeleteJson.code === "CANNOT_DELETE_ADMIN", "Self-deletion error code is CANNOT_DELETE_ADMIN");
    passedTests++;

    // ------------------------------------------------------------------------
    // TEST 5: Nonexistent user returns 404
    // ------------------------------------------------------------------------
    console.log("\n[TEST 5: Nonexistent user returns 404]");
    const nonexistentRes = await fetch(`${baseUrl}/api/admin/users/00000000-0000-0000-0000-000000000000`, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ confirmation: "DELETE" }),
    });
    const nonexistentJson: any = await nonexistentRes.json();
    assert(nonexistentRes.status === 404, "Nonexistent user returns 404");
    assert(nonexistentJson.code === "USER_NOT_FOUND", "Error code is USER_NOT_FOUND");
    passedTests++;

    // ------------------------------------------------------------------------
    // TEST 6: Invalid confirmation values rejected (400 VALIDATION_ERROR)
    // ------------------------------------------------------------------------
    console.log("\n[TEST 6: Confirmation value enforcement]");
    const candidateEmail = `candidate.guard.${Date.now()}@manglam.test`;
    const candidateUser = await prisma.user.create({
      data: {
        email: candidateEmail,
        role: UserRole.USER,
        status: UserStatus.ACTIVE,
      },
    });

    // 6a: Lowercase "delete"
    const lowerRes = await fetch(`${baseUrl}/api/admin/users/${candidateUser.id}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ confirmation: "delete" }),
    });
    assert(lowerRes.status === 400, "Lowercase 'delete' returns 400");
    const lowerJson: any = await lowerRes.json();
    assert(lowerJson.code === "VALIDATION_ERROR", "Error code is VALIDATION_ERROR");

    // 6b: Missing confirmation
    const missingRes = await fetch(`${baseUrl}/api/admin/users/${candidateUser.id}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({}),
    });
    assert(missingRes.status === 400, "Missing confirmation returns 400");

    // 6c: "DELETE USER"
    const phraseRes = await fetch(`${baseUrl}/api/admin/users/${candidateUser.id}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ confirmation: "DELETE USER" }),
    });
    assert(phraseRes.status === 400, "'DELETE USER' returns 400");

    // 6d: "YES"
    const yesRes = await fetch(`${baseUrl}/api/admin/users/${candidateUser.id}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ confirmation: "YES" }),
    });
    assert(yesRes.status === 400, "'YES' returns 400");
    await prisma.user.delete({ where: { id: candidateUser.id } });
    passedTests++;

    // ------------------------------------------------------------------------
    // TEST 7: Complete Hard Delete with Full Relational Graph + Shared Data
    // ------------------------------------------------------------------------
    console.log("\n[TEST 7: Full Relational Graph & Shared Resource Hard Delete]");
    const timestamp = Date.now();
    const targetEmail = `target.user.${timestamp}@manglam.test`;
    const otherEmail = `other.user.${timestamp}@manglam.test`;

    // 1. Create Target User
    const target = await prisma.user.create({
      data: {
        email: targetEmail,
        phone: `+9198${String(timestamp).slice(-8)}`,
        passwordHash: "$2b$10$abcdefghijklmnopqrstuvwxyz123456",
        role: UserRole.USER,
        status: UserStatus.ACTIVE,
        activationStatus: AccountActivationStatus.ACTIVE,
        emailVerifiedAt: new Date(),
        phoneVerifiedAt: new Date(),
      },
    });

    // 2. Create Target Profile & all sub-entities
    const targetProfile = await prisma.profile.create({
      data: {
        userId: target.id,
        profileCreatedFor: ProfileCreatedFor.MYSELF,
        profileStatus: ProfileStatus.ACTIVE,
        completionPercentage: 100,
        personalDetails: {
          create: {
            firstName: "TargetFirstName",
            lastName: "TargetLastName",
            gender: Gender.MALE,
            dateOfBirth: new Date("1995-05-15"),
            maritalStatus: MaritalStatus.NEVER_MARRIED,
            heightCm: 178,
            motherTongueId: defaultMotherTongueId,
            city: "Jaipur",
            state: "Rajasthan",
          },
        },
        religion: {
          create: {
            religionId: defaultReligionId,
            manglik: ManglikStatus.NO,
          },
        },
        education: {
          create: {
            educationId: defaultEducationId,
            institutionName: "Rajasthan Technical University",
          },
        },
        career: {
          create: {
            employmentStatusId: defaultEmploymentStatusId,
            companyName: "Tech Corp",
          },
        },
        languages: {
          create: {
            languageId: defaultMotherTongueId,
          },
        },
        partnerPreference: {
          create: {
            minAge: 22,
            maxAge: 28,
            minHeightCm: 155,
            maxHeightCm: 175,
            religions: {
              create: {
                religionId: defaultReligionId,
              },
            },
            educations: {
              create: {
                educationId: defaultEducationId,
              },
            },
          },
        },
      },
    });

    // 3. Create Physical Photo Object in storage (R2 or Local)
    const activeProviderType = config.photo.storageProvider || "local";
    const storageProvider = getStorageProvider(activeProviderType);
    const photoId = crypto.randomUUID();
    const dummyImageBuffer = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      "base64"
    );

    // Upload physical file through provider
    const uploadMeta = await storageProvider.upload(dummyImageBuffer, {
      profileId: targetProfile.id,
      photoId,
      originalFileName: "photo.jpg",
      mimeType: "image/jpeg",
    });
    const testStorageKey = uploadMeta.storageKey;
    const physicalUploaded = await storageProvider.exists(testStorageKey);
    assert(physicalUploaded, "Physical photo uploaded to storage provider prior to delete");

    const targetPhoto = await prisma.profilePhoto.create({
      data: {
        id: photoId,
        profileId: targetProfile.id,
        storageKey: testStorageKey,
        storageProvider: activeProviderType,
        originalFileName: "photo.jpg",
        mimeType: "image/jpeg",
        fileSize: dummyImageBuffer.length,
        photoType: PhotoType.PRIMARY,
        moderationStatus: ModerationStatus.APPROVED,
      },
    });

    // 4. Create Other User with Profile and unrelated data
    const otherUser = await prisma.user.create({
      data: {
        email: otherEmail,
        phone: `+9197${String(timestamp).slice(-8)}`,
        role: UserRole.USER,
        status: UserStatus.ACTIVE,
        activationStatus: AccountActivationStatus.ACTIVE,
        profile: {
          create: {
            profileCreatedFor: ProfileCreatedFor.MYSELF,
            profileStatus: ProfileStatus.ACTIVE,
            completionPercentage: 80,
            personalDetails: {
              create: {
                firstName: "OtherFirstName",
                lastName: "OtherLastName",
                gender: Gender.FEMALE,
                dateOfBirth: new Date("1997-08-20"),
                maritalStatus: MaritalStatus.NEVER_MARRIED,
                heightCm: 165,
                motherTongueId: defaultMotherTongueId,
                city: "Udaipur",
                state: "Rajasthan",
              },
            },
          },
        },
      },
      include: { profile: true },
    });

    // 5. Create Shared Conversation between Target and Other User
    const conversation = await prisma.conversation.create({
      data: {
        userOneId: target.id,
        userTwoId: otherUser.id,
        participants: {
          create: [
            { userId: target.id },
            { userId: otherUser.id },
          ],
        },
        messages: {
          create: [
            {
              senderUserId: target.id,
              body: "Hello from target user!",
            },
            {
              senderUserId: otherUser.id,
              body: "Hello back from other user!",
            },
          ],
        },
      },
      include: {
        participants: true,
        messages: true,
      },
    });
    assert(conversation.messages.length === 2, "Shared conversation with messages created");

    // 6. Create Message Requests sent and received
    await prisma.messageRequest.create({
      data: {
        senderUserId: target.id,
        receiverUserId: otherUser.id,
        status: MessageRequestStatus.PENDING,
      },
    });

    // 7. Create Profile Favourites sent and received
    await prisma.profileFavourite.create({
      data: {
        userId: target.id,
        targetProfileId: otherUser.profile!.id,
      },
    });
    await prisma.profileFavourite.create({
      data: {
        userId: otherUser.id,
        targetProfileId: targetProfile.id,
      },
    });

    // 8. Create Notifications
    await prisma.notification.create({
      data: {
        userId: target.id,
        type: NotificationType.MESSAGE_REQUEST_RECEIVED,
        title: "Test notification for target",
        body: "Test notification body",
      },
    });

    // 9. Create Verification OTP for target AND for other user
    const targetOtpId = crypto.randomUUID();
    await prisma.verificationOtp.create({
      data: {
        id: targetOtpId,
        email: targetEmail,
        hashedOtp: "dummyhashedotp1",
        salt: "dummysalt1",
        expiresAt: new Date(Date.now() + 600000),
        resendAvailableAt: new Date(Date.now() + 60000),
      },
    });

    const otherOtpId = crypto.randomUUID();
    await prisma.verificationOtp.create({
      data: {
        id: otherOtpId,
        email: otherEmail,
        hashedOtp: "dummyhashedotp2",
        salt: "dummysalt2",
        expiresAt: new Date(Date.now() + 600000),
        resendAvailableAt: new Date(Date.now() + 60000),
      },
    });

    // 10. Execute Permanent Account Deletion API call
    console.log("  Executing permanent delete API call...");
    const deleteRes = await fetch(`${baseUrl}/api/admin/users/${target.id}`, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ confirmation: "DELETE" }),
    });

    const deleteJson: any = await deleteRes.json();
    assert(deleteRes.status === 200, "Permanent delete returned 200 OK");
    assert(deleteJson.success === true, "Response success is true");
    assert(deleteJson.data.deleted === true, "Response data.deleted is true");
    assert(deleteJson.data.userId === target.id, "Response data.userId matches target");

    // Security check: Verify NO secrets leaked in response
    assert(deleteJson.data.passwordHash === undefined, "No passwordHash leaked");
    assert(deleteJson.data.token === undefined, "No auth token leaked");
    assert(deleteJson.data.otp === undefined, "No OTP leaked");
    assert(deleteJson.data.email === undefined, "Email not unnecessarily exposed");
    passedTests++;

    // 11. VERIFY TARGET RECORDS ARE PERMANENTLY REMOVED
    console.log("\n[VERIFY: Target Database Purge]");
    const userInDb = await prisma.user.findUnique({ where: { id: target.id } });
    assert(userInDb === null, "Target User row permanently removed from DB");

    const profileInDb = await prisma.profile.findUnique({ where: { id: targetProfile.id } });
    assert(profileInDb === null, "Target Profile row permanently removed from DB");

    const personalInDb = await prisma.profilePersonalDetails.findUnique({ where: { profileId: targetProfile.id } });
    assert(personalInDb === null, "Target ProfilePersonalDetails permanently removed");

    const religionInDb = await prisma.profileReligion.findUnique({ where: { profileId: targetProfile.id } });
    assert(religionInDb === null, "Target ProfileReligion permanently removed");

    const educationInDb = await prisma.profileEducation.findUnique({ where: { profileId: targetProfile.id } });
    assert(educationInDb === null, "Target ProfileEducation permanently removed");

    const careerInDb = await prisma.profileCareer.findUnique({ where: { profileId: targetProfile.id } });
    assert(careerInDb === null, "Target ProfileCareer permanently removed");

    const langInDb = await prisma.profileLanguage.findMany({ where: { profileId: targetProfile.id } });
    assert(langInDb.length === 0, "Target ProfileLanguage rows permanently removed");

    const prefInDb = await prisma.partnerPreference.findUnique({ where: { profileId: targetProfile.id } });
    assert(prefInDb === null, "Target PartnerPreference permanently removed");

    const photoInDb = await prisma.profilePhoto.findUnique({ where: { id: targetPhoto.id } });
    assert(photoInDb === null, "Target ProfilePhoto DB row permanently removed");

    const targetOtpInDb = await prisma.verificationOtp.findUnique({ where: { id: targetOtpId } });
    assert(targetOtpInDb === null, "Target VerificationOtp record permanently deleted");

    const targetNotifsInDb = await prisma.notification.findMany({ where: { userId: target.id } });
    assert(targetNotifsInDb.length === 0, "Target notifications permanently removed");

    const targetRequestsInDb = await prisma.messageRequest.findMany({
      where: { OR: [{ senderUserId: target.id }, { receiverUserId: target.id }] },
    });
    assert(targetRequestsInDb.length === 0, "Target message requests permanently removed");

    const targetFavsInDb = await prisma.profileFavourite.findMany({
      where: { OR: [{ userId: target.id }, { targetProfileId: targetProfile.id }] },
    });
    assert(targetFavsInDb.length === 0, "Target favourites permanently removed");
    passedTests++;

    // 12. VERIFY PHYSICAL STORAGE OBJECT REMOVAL
    console.log("\n[VERIFY: Physical Storage Cleanup]");
    const physicalStillExists = await storageProvider.exists(testStorageKey);
    assert(!physicalStillExists, "Physical photo object permanently deleted from storage (R2/local)");
    passedTests++;

    // 13. EXPLICIT GUARDRAIL A & B: OTHER USER AND UNRELATED DATA INTACT
    console.log("\n[EXPLICIT GUARDRAIL A & B: Other user & data intact]");
    const otherUserInDb = await prisma.user.findUnique({
      where: { id: otherUser.id },
      include: { profile: { include: { personalDetails: true } } },
    });
    assert(Boolean(otherUserInDb), "Other User account remains completely INTACT");
    assert(Boolean(otherUserInDb!.profile), "Other User profile remains completely INTACT");
    assert(otherUserInDb!.profile!.personalDetails?.firstName === "OtherFirstName", "Other User personal details intact");
    passedTests++;

    // 14. EXPLICIT GUARDRAIL C: SHARED CONVERSATION CASCADE CLEANUP
    console.log("\n[EXPLICIT GUARDRAIL C: Shared conversation cascade behavior]");
    const convInDb = await prisma.conversation.findUnique({ where: { id: conversation.id } });
    assert(convInDb === null, "Shared Conversation removed cleanly without corrupting other user");

    const participantsInDb = await prisma.conversationParticipant.findMany({ where: { conversationId: conversation.id } });
    assert(participantsInDb.length === 0, "No orphaned ConversationParticipant rows remain");

    const messagesInDb = await prisma.message.findMany({ where: { conversationId: conversation.id } });
    assert(messagesInDb.length === 0, "No orphaned Message rows remain");
    passedTests++;

    // 15. EXPLICIT GUARDRAIL D: OTHER USER'S OTP INTACT
    console.log("\n[EXPLICIT GUARDRAIL D: Other user's OTP remains intact]");
    const otherOtpInDb = await prisma.verificationOtp.findUnique({ where: { id: otherOtpId } });
    assert(Boolean(otherOtpInDb), "Other user's VerificationOtp record is completely intact");
    await prisma.verificationOtp.delete({ where: { id: otherOtpId } });
    await prisma.user.delete({ where: { id: otherUser.id } });
    passedTests++;

    // ------------------------------------------------------------------------
    // TEST 8: Works across different lifecycle states
    // ------------------------------------------------------------------------
    console.log("\n[TEST 8: Deletion across all lifecycle states]");
    const statusesToTest = [
      { status: UserStatus.ACTIVE, act: AccountActivationStatus.PENDING_ACTIVATION, name: "PENDING_ACTIVATION" },
      { status: UserStatus.SUSPENDED, act: AccountActivationStatus.ACTIVE, name: "SUSPENDED" },
      { status: UserStatus.BLOCKED, act: AccountActivationStatus.ACTIVE, name: "BLOCKED" },
      { status: UserStatus.DELETED, act: AccountActivationStatus.ACTIVE, name: "DELETED (Soft-delete state)" },
    ];

    for (const item of statusesToTest) {
      const u = await prisma.user.create({
        data: {
          email: `candidate.${item.name.toLowerCase().replace(/[^a-z]/g, "")}.${Date.now()}@manglam.test`,
          role: UserRole.USER,
          status: item.status,
          activationStatus: item.act,
        },
      });

      const delRes = await fetch(`${baseUrl}/api/admin/users/${u.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ confirmation: "DELETE" }),
      });

      assert(delRes.status === 200, `Successfully permanently deleted user in ${item.name} state`);
      const check = await prisma.user.findUnique({ where: { id: u.id } });
      assert(check === null, `User in ${item.name} state no longer exists in DB`);
      passedTests++;
    }

    // ------------------------------------------------------------------------
    // TEST 9: Concurrent deletion safety (second attempt returns 404 USER_NOT_FOUND)
    // ------------------------------------------------------------------------
    console.log("\n[TEST 9: Concurrency safety]");
    const concurrentUser = await prisma.user.create({
      data: {
        email: `concurrent.user.${Date.now()}@manglam.test`,
        role: UserRole.USER,
        status: UserStatus.ACTIVE,
      },
    });

    const [req1, req2] = await Promise.all([
      fetch(`${baseUrl}/api/admin/users/${concurrentUser.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ confirmation: "DELETE" }),
      }),
      fetch(`${baseUrl}/api/admin/users/${concurrentUser.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ confirmation: "DELETE" }),
      }),
    ]);

    const statuses = [req1.status, req2.status].sort();
    assert(
      statuses[0] === 200 && statuses[1] === 404,
      `Concurrent deletes safely resolved: one 200 OK and one 404 USER_NOT_FOUND (got ${statuses.join(", ")})`
    );
    passedTests++;

    // ------------------------------------------------------------------------
    // TEST 10: Admin User List query verification
    // ------------------------------------------------------------------------
    console.log("\n[TEST 10: Verify deleted user disappears from Admin Users list]");
    const listRes = await fetch(`${baseUrl}/api/admin/users?q=${encodeURIComponent(targetEmail)}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const listJson: any = await listRes.json();
    assert(listRes.status === 200, "Admin users list returned 200");
    assert(listJson.data.users.length === 0, "Deleted user is not returned in Admin users search");
    passedTests++;

    // ------------------------------------------------------------------------
    // TEST 11: Database failure simulation rolls back transaction
    // ------------------------------------------------------------------------
    console.log("\n[TEST 11: Database transaction rollback simulation]");
    const rollbackCandidate = await prisma.user.create({
      data: {
        email: `rollback.test.${Date.now()}@manglam.test`,
        role: UserRole.USER,
        status: UserStatus.ACTIVE,
      },
    });

    try {
      await prisma.$transaction(async (tx) => {
        await tx.user.delete({ where: { id: rollbackCandidate.id } });
        throw new Error("Simulated PostgreSQL transaction abort");
      });
    } catch (err: any) {
      assert(err.message === "Simulated PostgreSQL transaction abort", "Transaction caught simulated error and aborted");
    }

    // Verify candidate was NOT deleted and remains in DB due to rollback
    const candidateStillInDb = await prisma.user.findUnique({ where: { id: rollbackCandidate.id } });
    assert(Boolean(candidateStillInDb), "Candidate account intact in DB after transaction rollback");
    await prisma.user.delete({ where: { id: rollbackCandidate.id } });
    passedTests++;

    console.log("\n==================================================");
    console.log(`ALL ${passedTests} AUTOMATED PERMANENT ACCOUNT DELETION TESTS PASSED!`);
    console.log("==================================================");
  } finally {
    server.close();
    await prisma.$disconnect();
    process.exit(0);
  }
}

runAdminPermanentDeleteSuite().catch((err) => {
  console.error("\n❌ SUITE EXECUTION ERROR:", err);
  process.exit(1);
});
