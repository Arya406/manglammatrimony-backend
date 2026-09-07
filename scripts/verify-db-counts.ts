import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function count() {
  const rel = await prisma.religion.count();
  const com = await prisma.community.count();
  const subcom = await prisma.subCommunity.count();
  const caste = await prisma.caste.count();
  const subcaste = await prisma.subCaste.count();
  const gotra = await prisma.gotra.count();
  const unlinked = await prisma.community.count({ where: { religionId: null } });

  console.log("--------------------------------------------------");
  console.log("DATABASE MASTER DATA RECORD COUNTS VERIFICATION:");
  console.log("  religions:       ", rel);
  console.log("  communities:     ", com);
  console.log("  sub_communities: ", subcom);
  console.log("  castes:          ", caste);
  console.log("  sub_castes:      ", subcaste);
  console.log("  gotras:          ", gotra);
  console.log("  unlinked comms:  ", unlinked);
  console.log("--------------------------------------------------");

  await prisma.$disconnect();
}

count();
