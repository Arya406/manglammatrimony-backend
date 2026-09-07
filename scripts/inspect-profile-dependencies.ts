import { prisma } from "../src/config/database";
import fs from "fs";
import path from "path";

async function detailedAudit() {
  const totalProfiles = await prisma.profile.count();

  // Helper to get breakdown
  async function getBreakdown(model: any, field: string) {
    const records = await model.groupBy({
      by: [field],
      _count: { id: true },
    });
    return records;
  }

  const pCreatedFor = await prisma.profile.groupBy({
    by: ["profileCreatedFor"],
    _count: { _all: true },
  });

  const pStatus = await prisma.profile.groupBy({
    by: ["profileStatus"],
    _count: { _all: true },
  });

  // Personal Details
  const pdTotal = await prisma.profilePersonalDetails.count();
  const gender = await prisma.profilePersonalDetails.groupBy({
    by: ["gender"],
    _count: { _all: true },
  });
  const marital = await prisma.profilePersonalDetails.groupBy({
    by: ["maritalStatus"],
    _count: { _all: true },
  });
  const motherTongue = await prisma.profilePersonalDetails.groupBy({
    by: ["motherTongueId"],
    _count: { _all: true },
  });
  const cities = await prisma.profilePersonalDetails.groupBy({
    by: ["city"],
    _count: { _all: true },
  });
  const states = await prisma.profilePersonalDetails.groupBy({
    by: ["state"],
    _count: { _all: true },
  });

  // Religion Details
  const relTotal = await prisma.profileReligion.count();
  const rel = await prisma.profileReligion.groupBy({
    by: ["religionId"],
    _count: { _all: true },
  });
  const comm = await prisma.profileReligion.groupBy({
    by: ["communityId"],
    _count: { _all: true },
  });
  const subComm = await prisma.profileReligion.groupBy({
    by: ["subCommunityId"],
    _count: { _all: true },
  });
  const caste = await prisma.profileReligion.groupBy({
    by: ["casteId"],
    _count: { _all: true },
  });
  const subCaste = await prisma.profileReligion.groupBy({
    by: ["subCasteId"],
    _count: { _all: true },
  });
  const gotra = await prisma.profileReligion.groupBy({
    by: ["gotraId"],
    _count: { _all: true },
  });
  const manglik = await prisma.profileReligion.groupBy({
    by: ["manglik"],
    _count: { _all: true },
  });
  const customRels = await prisma.profileReligion.findMany({
    where: {
      OR: [
        { customReligion: { not: null } },
        { customCommunity: { not: null } },
        { customCaste: { not: null } },
        { customSubCaste: { not: null } },
      ],
    },
  });

  // Education Details
  const eduTotal = await prisma.profileEducation.count();
  const edu = await prisma.profileEducation.groupBy({
    by: ["educationId"],
    _count: { _all: true },
  });
  const spec = await prisma.profileEducation.groupBy({
    by: ["specializationId"],
    _count: { _all: true },
  });
  const inst = await prisma.profileEducation.groupBy({
    by: ["institutionId"],
    _count: { _all: true },
  });

  // Career Details
  const carTotal = await prisma.profileCareer.count();
  const empStatus = await prisma.profileCareer.groupBy({
    by: ["employmentStatusId"],
    _count: { _all: true },
  });
  const occ = await prisma.profileCareer.groupBy({
    by: ["occupationId"],
    _count: { _all: true },
  });
  const empType = await prisma.profileCareer.groupBy({
    by: ["employmentType"],
    _count: { _all: true },
  });
  const income = await prisma.profileCareer.groupBy({
    by: ["annualIncomeRange"],
    _count: { _all: true },
  });

  // Partner Preferences
  const prefTotal = await prisma.partnerPreference.count();
  const prefRel = await prisma.partnerPreferenceReligion.groupBy({
    by: ["religionId"],
    _count: { _all: true },
  });
  const prefComm = await prisma.partnerPreferenceCommunity.groupBy({
    by: ["communityId"],
    _count: { _all: true },
  });
  const prefCaste = await prisma.partnerPreferenceCaste.groupBy({
    by: ["casteId"],
    _count: { _all: true },
  });
  const prefEdu = await prisma.partnerPreferenceEducation.groupBy({
    by: ["educationId"],
    _count: { _all: true },
  });
  const prefOcc = await prisma.partnerPreferenceOccupation.groupBy({
    by: ["occupationId"],
    _count: { _all: true },
  });
  const prefMang = await prisma.partnerPreferenceManglik.groupBy({
    by: ["manglik"],
    _count: { _all: true },
  });
  const prefMar = await prisma.partnerPreferenceMaritalStatus.groupBy({
    by: ["maritalStatus"],
    _count: { _all: true },
  });

  const detailedAuditResult = {
    totalProfiles,
    pCreatedFor,
    pStatus,
    personalDetails: {
      totalWithDetails: pdTotal,
      totalNull: totalProfiles - pdTotal,
      gender,
      marital,
      motherTongue,
      cities,
      states,
    },
    religion: {
      totalWithDetails: relTotal,
      totalNull: totalProfiles - relTotal,
      rel,
      comm,
      subComm,
      caste,
      subCaste,
      gotra,
      manglik,
      customRels,
    },
    education: {
      totalWithDetails: eduTotal,
      totalNull: totalProfiles - eduTotal,
      edu,
      spec,
      inst,
    },
    career: {
      totalWithDetails: carTotal,
      totalNull: totalProfiles - carTotal,
      empStatus,
      occ,
      empType,
      income,
    },
    preferences: {
      prefTotal,
      prefRel,
      prefComm,
      prefCaste,
      prefEdu,
      prefOcc,
      prefMang,
      prefMar,
    },
  };

  fs.writeFileSync(
    path.join(__dirname, "profile-audit-dump.json"),
    JSON.stringify(detailedAuditResult, null, 2),
    "utf-8"
  );
  console.log("Detailed audit dump written to profile-audit-dump.json");
}

detailedAudit()
  .catch((e) => console.error(e))
  .finally(() => prisma.$disconnect());
