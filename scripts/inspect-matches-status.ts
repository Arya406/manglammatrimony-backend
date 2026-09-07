import { prisma } from "../src/config/database";
import { matchesService } from "../src/services/matches.service";

async function main() {
  console.log("--- Inspecting Users and Profiles ---");
  const users = await prisma.user.findMany({
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
          personalDetails: {
            select: {
              firstName: true,
              lastName: true,
              gender: true,
            },
          },
        },
      },
    },
  });

  console.log(`Total users in DB: ${users.length}`);
  for (const u of users) {
    console.log(
      `User ID: ${u.id}, Phone/Email: ${u.phone || u.email}, UserStatus: ${u.status}, ProfileStatus: ${
        u.profile?.profileStatus || "NO_PROFILE"
      }, Completion: ${u.profile?.completionPercentage ?? "N/A"}%, Gender: ${
        u.profile?.personalDetails?.gender || "N/A"
      }, Name: ${u.profile?.personalDetails?.firstName || ""} ${u.profile?.personalDetails?.lastName || ""}`
    );
  }

  // Find an active user
  const activeUser = users.find(
    (u) => u.status === "ACTIVE" && u.profile?.profileStatus === "ACTIVE"
  );

  if (activeUser) {
    console.log(`\nTesting matchesService for active user: ${activeUser.id} (${activeUser.profile?.personalDetails?.gender})`);
    try {
      const matches = await matchesService.getDiscoveryMatches(activeUser.id);
      console.log(`Found ${matches.profiles.length} profiles (total: ${matches.pagination.total})`);
      if (matches.profiles.length > 0) {
        console.log("Sample profile:", JSON.stringify(matches.profiles[0], null, 2));
      }
    } catch (err) {
      console.error("Error running matchesService:", err);
    }
  } else {
    console.log("\nNo ACTIVE user found!");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
