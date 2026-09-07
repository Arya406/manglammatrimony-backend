import { prisma } from "../src/config/database";
import fs from "fs";
import path from "path";

async function dumpMasterData() {
  const counts = {
    languages: await prisma.language.count(),
    religions: await prisma.religion.count(),
    communities: await prisma.community.count(),
    subCommunities: await prisma.subCommunity.count(),
    castes: await prisma.caste.count(),
    subCastes: await prisma.subCaste.count(),
    gotras: await prisma.gotra.count(),
    educations: await prisma.education.count(),
    specializations: await prisma.specialization.count(),
    institutions: await prisma.institution.count(),
    employmentStatuses: await prisma.employmentStatus.count(),
    occupations: await prisma.occupation.count(),
  };

  const dump = {
    counts,
    languages: await prisma.language.findMany({ orderBy: { sortOrder: "asc" } }),
    religions: await prisma.religion.findMany({ orderBy: { sortOrder: "asc" } }),
    communities: await prisma.community.findMany({
      include: { religion: true },
      orderBy: { sortOrder: "asc" },
    }),
    subCommunities: await prisma.subCommunity.findMany({
      include: { community: true },
      orderBy: { sortOrder: "asc" },
    }),
    castes: await prisma.caste.findMany({
      include: { community: true },
      orderBy: { sortOrder: "asc" },
    }),
    subCastes: await prisma.subCaste.findMany({
      include: { caste: true },
      orderBy: { sortOrder: "asc" },
    }),
    gotras: await prisma.gotra.findMany({
      include: { community: true },
      orderBy: { sortOrder: "asc" },
    }),
    educations: await prisma.education.findMany({ orderBy: { sortOrder: "asc" } }),
    specializations: await prisma.specialization.findMany({
      include: { education: true },
      orderBy: { sortOrder: "asc" },
    }),
    institutionsCount: await prisma.institution.count(),
    employmentStatuses: await prisma.employmentStatus.findMany({ orderBy: { sortOrder: "asc" } }),
    occupations: await prisma.occupation.findMany({
      include: { employmentStatus: true },
      orderBy: { sortOrder: "asc" },
    }),
  };

  fs.writeFileSync(
    path.join(__dirname, "master-data-dump.json"),
    JSON.stringify(dump, null, 2),
    "utf-8"
  );
  console.log("Master data dumped successfully. Counts:");
  console.log(JSON.stringify(counts, null, 2));
}

dumpMasterData()
  .catch((e) => console.error(e))
  .finally(() => prisma.$disconnect());
