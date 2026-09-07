/**
 * Development-Only Script: Approve Existing Profiles for Testing
 *
 * Marks existing profiles and users in the local development database as ACTIVE/APPROVED
 * so they can behave as approved profiles during discovery and browsing testing.
 *
 * SAFETY GUARDS:
 * - Refuses to execute if NODE_ENV is 'production'.
 * - Safe and idempotent to run repeatedly.
 * - Preserves all user credentials, personal data, photos, preferences, and relationships.
 * - Zero mock or fabricated profile data.
 */

import { prisma } from "../src/config/database";
import { config } from "../src/config/env";
import { ProfileStatus, UserStatus, ModerationStatus } from "@prisma/client";

async function main() {
  // 1. Explicit Development/Test Environment Guard
  if (config.nodeEnv === "production" || process.env.NODE_ENV === "production") {
    console.error("FATAL ERROR: This testing approval script is strictly prohibited in PRODUCTION environments.");
    process.exit(1);
  }

  console.log("==================================================================");
  console.log("MANGLAM MATRIMONY — DEV TESTING PROFILE APPROVAL SCRIPT");
  console.log(`Environment: ${config.nodeEnv || "development"} (Safe to proceed)`);
  console.log("==================================================================");

  // 2. Query Before State
  const allUsersBefore = await prisma.user.findMany({
    select: {
      id: true,
      email: true,
      phone: true,
      status: true,
      profile: {
        select: {
          id: true,
          profileStatus: true,
          completionPercentage: true,
          photos: {
            select: {
              id: true,
              moderationStatus: true,
            },
          },
        },
      },
    },
  });

  console.log("\n--- [BEFORE SUMMARY] ---");
  console.log(`Total users in DB: ${allUsersBefore.length}`);
  const userStatusCountsBefore: Record<string, number> = {};
  const profileStatusCountsBefore: Record<string, number> = {};
  let pendingPhotosCountBefore = 0;

  for (const u of allUsersBefore) {
    userStatusCountsBefore[u.status] = (userStatusCountsBefore[u.status] || 0) + 1;
    const pStatus = u.profile?.profileStatus || "NO_PROFILE";
    profileStatusCountsBefore[pStatus] = (profileStatusCountsBefore[pStatus] || 0) + 1;
    if (u.profile?.photos) {
      for (const ph of u.profile.photos) {
        if (ph.moderationStatus === ModerationStatus.PENDING) {
          pendingPhotosCountBefore++;
        }
      }
    }
  }

  console.log("User Statuses:", JSON.stringify(userStatusCountsBefore, null, 2));
  console.log("Profile Statuses:", JSON.stringify(profileStatusCountsBefore, null, 2));
  console.log(`Pending Photos awaiting moderation: ${pendingPhotosCountBefore}`);

  // 3. Perform Testing-Only Approval Updates
  console.log("\n--- [PERFORMING TESTING APPROVAL UPDATES] ---");
  let updatedUsersCount = 0;
  let updatedProfilesCount = 0;
  let updatedPhotosCount = 0;

  for (const u of allUsersBefore) {
    // Only update users who have a profile (or users created for testing)
    if (u.profile) {
      // Activate user account if not already ACTIVE
      if (u.status !== UserStatus.ACTIVE) {
        await prisma.user.update({
          where: { id: u.id },
          data: { status: UserStatus.ACTIVE },
        });
        updatedUsersCount++;
      }

      // Activate profile if not already ACTIVE
      if (u.profile.profileStatus !== ProfileStatus.ACTIVE) {
        await prisma.profile.update({
          where: { id: u.profile.id },
          data: {
            profileStatus: ProfileStatus.ACTIVE,
            completionPercentage: 100,
            reviewedAt: new Date(),
          },
        });
        updatedProfilesCount++;
      } else if (u.profile.completionPercentage < 100) {
        await prisma.profile.update({
          where: { id: u.profile.id },
          data: {
            completionPercentage: 100,
          },
        });
        updatedProfilesCount++;
      }

      // Approve pending photos for testing visibility
      const pendingPhotos = u.profile.photos.filter(
        (ph) => ph.moderationStatus !== ModerationStatus.APPROVED
      );
      if (pendingPhotos.length > 0) {
        await prisma.profilePhoto.updateMany({
          where: {
            profileId: u.profile.id,
            moderationStatus: { not: ModerationStatus.APPROVED },
          },
          data: {
            moderationStatus: ModerationStatus.APPROVED,
          },
        });
        updatedPhotosCount += pendingPhotos.length;
      }
    }
  }

  console.log(`Updated Users: ${updatedUsersCount}`);
  console.log(`Updated Profiles to ACTIVE: ${updatedProfilesCount}`);
  console.log(`Approved Photos: ${updatedPhotosCount}`);

  // 4. Query After State
  const allUsersAfter = await prisma.user.findMany({
    select: {
      id: true,
      status: true,
      profile: {
        select: {
          id: true,
          profileStatus: true,
          completionPercentage: true,
        },
      },
    },
  });

  const userStatusCountsAfter: Record<string, number> = {};
  const profileStatusCountsAfter: Record<string, number> = {};

  for (const u of allUsersAfter) {
    userStatusCountsAfter[u.status] = (userStatusCountsAfter[u.status] || 0) + 1;
    const pStatus = u.profile?.profileStatus || "NO_PROFILE";
    profileStatusCountsAfter[pStatus] = (profileStatusCountsAfter[pStatus] || 0) + 1;
  }

  console.log("\n--- [AFTER SUMMARY] ---");
  console.log("User Statuses:", JSON.stringify(userStatusCountsAfter, null, 2));
  console.log("Profile Statuses:", JSON.stringify(profileStatusCountsAfter, null, 2));
  console.log("==================================================================");
  console.log("TESTING APPROVAL OPERATION COMPLETED SUCCESSFULLY.");
  console.log("==================================================================");
}

main()
  .catch((e) => {
    console.error("Approval script failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
