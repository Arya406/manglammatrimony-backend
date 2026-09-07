import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function check() {
  const ids = [
    "2582cc84-7355-4737-84dc-e04b3c11af5c",
    "f4efeee9-6e89-4045-aa93-0ebec568dc47",
    "1d8af08a-1aa9-4e1a-9f43-642d3dfdcbca",
  ];

  for (const id of ids) {
    const p = await prisma.profile.findUnique({
      where: { id },
      include: {
        religion: { include: { religion: true, community: true } },
        user: true,
        personalDetails: true,
      },
    });
    console.log("--------------------------------------------------");
    console.log("Profile ID:", id);
    console.log("User Email:", p?.user?.email);
    console.log("Phone:", p?.user?.phone);
    console.log("Status:", p?.profileStatus);
    console.log("First Name:", p?.personalDetails?.firstName);
    console.log("Religion:", p?.religion?.religion?.name, `(ID: ${p?.religion?.religionId})`);
    console.log("Community:", p?.religion?.community?.name, `(ID: ${p?.religion?.communityId})`);
  }
  await prisma.$disconnect();
}

check();
