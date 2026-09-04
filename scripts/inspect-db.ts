import { prisma } from "../src/config/database";

async function main() {
  const users = await prisma.user.findMany({
    include: {
      profile: {
        include: {
          personalDetails: true,
          photos: true,
        },
      },
    },
  });
  console.log("TOTAL USERS IN DB:", users.length);
  for (const u of users) {
    console.log({
      id: u.id,
      phone: u.phone,
      email: u.email,
      status: u.status,
      profileId: u.profile?.id,
      firstName: u.profile?.personalDetails?.firstName,
      lastName: u.profile?.personalDetails?.lastName,
      photosCount: u.profile?.photos?.length,
    });
  }
}

main().finally(async () => {
  await prisma.$disconnect();
});
