import { PrismaClient } from "@prisma/client";
import { profileService } from "../src/services/profile.service";

const prisma = new PrismaClient();

async function verifyBatch4() {
  console.log("==================================================");
  console.log("MANGLAM MATRIMONY — VERIFY BATCH 4 POPULATION");
  console.log("==================================================");

  let allChecksPassed = true;

  function assert(condition: boolean, message: string) {
    if (condition) {
      console.log(`  ✓ PASS: ${message}`);
    } else {
      console.error(`  ✗ FAIL: ${message}`);
      allChecksPassed = false;
    }
  }

  // 1. Table Counts Verification
  console.log("\n1. Table Counts Verification:");
  const eduCount = await prisma.education.count();
  const specCount = await prisma.specialization.count();
  const instCount = await prisma.institution.count();
  const empCount = await prisma.employmentStatus.count();
  const occCount = await prisma.occupation.count();

  assert(eduCount === 25, `Education count: ${eduCount} (expected 25)`);
  assert(specCount === 241, `Specialization count: ${specCount} (expected 241)`);
  assert(instCount === 208, `Institution count: ${instCount} (expected 208)`);
  assert(empCount === 10, `Employment status count: ${empCount} (expected 10)`);
  assert(occCount === 117, `Occupation count: ${occCount} (expected 117)`);

  // 2. Foreign Key & Orphan Verification
  console.log("\n2. Foreign Key & Orphan Verification:");

  // A) Specializations -> Educations
  const educations = await prisma.education.findMany({ select: { id: true } });
  const eduIdSet = new Set(educations.map((e) => e.id));
  const specs = await prisma.specialization.findMany({ select: { id: true, educationId: true, name: true, slug: true } });
  const orphanSpecs = specs.filter((s) => !eduIdSet.has(s.educationId));
  assert(orphanSpecs.length === 0, `Orphan specializations: ${orphanSpecs.length} (expected 0)`);

  // B) Occupations -> Employment Statuses
  const empStatuses = await prisma.employmentStatus.findMany({ select: { id: true } });
  const empIdSet = new Set(empStatuses.map((es) => es.id));
  const occs = await prisma.occupation.findMany({ select: { id: true, employmentStatusId: true, name: true, slug: true } });
  const orphanOccs = occs.filter((o) => !empIdSet.has(o.employmentStatusId));
  assert(orphanOccs.length === 0, `Orphan occupations: ${orphanOccs.length} (expected 0)`);

  // 3. Uniqueness & Deterministic Constraints Verification
  console.log("\n3. Uniqueness & Deterministic Constraints Verification:");

  // A) Education slugs unique
  const allEduSlugs = (await prisma.education.findMany({ select: { slug: true } })).map((e) => e.slug);
  const uniqueEduSlugs = new Set(allEduSlugs);
  assert(allEduSlugs.length === uniqueEduSlugs.size, `All ${allEduSlugs.length} education slugs are globally unique`);

  // B) Employment status slugs unique
  const allEmpSlugs = (await prisma.employmentStatus.findMany({ select: { slug: true } })).map((es) => es.slug);
  const uniqueEmpSlugs = new Set(allEmpSlugs);
  assert(allEmpSlugs.length === uniqueEmpSlugs.size, `All ${allEmpSlugs.length} employment status slugs are globally unique`);

  // C) Specializations unique per educationId
  const specScopedKeySet = new Set<string>();
  let dupSpecScopedSlugs = 0;
  for (const s of specs) {
    const key = `${s.educationId}::${s.slug}`;
    if (specScopedKeySet.has(key)) {
      dupSpecScopedSlugs++;
    }
    specScopedKeySet.add(key);
  }
  assert(dupSpecScopedSlugs === 0, `Duplicate scoped specialization slugs: ${dupSpecScopedSlugs} (expected 0)`);

  // D) Occupations unique per employmentStatusId
  const occScopedKeySet = new Set<string>();
  let dupOccScopedSlugs = 0;
  for (const o of occs) {
    const key = `${o.employmentStatusId}::${o.slug}`;
    if (occScopedKeySet.has(key)) {
      dupOccScopedSlugs++;
    }
    occScopedKeySet.add(key);
  }
  assert(dupOccScopedSlugs === 0, `Duplicate scoped occupation slugs: ${dupOccScopedSlugs} (expected 0)`);

  // E) Institutions unique normalizedName
  const allInstNorms = (await prisma.institution.findMany({ select: { normalizedName: true } })).map((i) => i.normalizedName);
  const uniqueInstNorms = new Set(allInstNorms);
  assert(allInstNorms.length === uniqueInstNorms.size, `All ${allInstNorms.length} institutions have unique normalized names`);

  // 4. Existing Profile & Preferences Integrity Check
  console.log("\n4. Existing Profile & Preferences Integrity Check:");

  // Verify Software Engineer record preserved
  const softwareEngineer = await prisma.occupation.findFirst({
    where: { slug: "software-engineer" },
    include: { employmentStatus: true },
  });
  assert(
    softwareEngineer?.id === "3c4881eb-1807-444b-8921-89477fcda754",
    `Software Engineer ID preserved: ${softwareEngineer?.id} (expected 3c4881eb-1807-444b-8921-89477fcda754)`
  );
  assert(
    softwareEngineer?.employmentStatus.slug === "employed",
    `Software Engineer parent employment status: ${softwareEngineer?.employmentStatus.slug} (expected employed)`
  );

  // Verify Profile Education records
  const profileEducations = await prisma.profileEducation.findMany({
    include: { education: true, specialization: true, institution: true },
  });
  assert(profileEducations.length === 19, `Total ProfileEducations: ${profileEducations.length} (expected 19)`);
  const brokenProfileEdu = profileEducations.filter((pe) => !pe.education);
  assert(brokenProfileEdu.length === 0, `Broken ProfileEducation FKs: ${brokenProfileEdu.length} (expected 0)`);

  // Verify Profile Career records
  const profileCareers = await prisma.profileCareer.findMany({
    include: { employmentStatus: true, occupation: true },
  });
  assert(profileCareers.length === 25, `Total ProfileCareers: ${profileCareers.length} (expected 25)`);
  const brokenProfileCareerEmp = profileCareers.filter((pc) => !pc.employmentStatus);
  assert(brokenProfileCareerEmp.length === 0, `Broken ProfileCareer EmploymentStatus FKs: ${brokenProfileCareerEmp.length} (expected 0)`);
  const careersWithOccupation = profileCareers.filter((pc) => pc.occupationId !== null);
  assert(careersWithOccupation.length === 7, `ProfileCareers with occupation: ${careersWithOccupation.length} (expected 7)`);
  const brokenProfileCareerOcc = careersWithOccupation.filter((pc) => !pc.occupation);
  assert(brokenProfileCareerOcc.length === 0, `Broken ProfileCareer Occupation FKs: ${brokenProfileCareerOcc.length} (expected 0)`);

  // Verify Partner Preferences
  const prefEduCount = await prisma.partnerPreferenceEducation.count();
  const prefOccCount = await prisma.partnerPreferenceOccupation.count();
  assert(prefEduCount === 2, `Partner preference educations: ${prefEduCount} (expected 2)`);
  assert(prefOccCount === 2, `Partner preference occupations: ${prefOccCount} (expected 2)`);

  // 5. REST Service & Query Behavior Verification
  console.log("\n5. REST Service & Query Behavior Verification:");

  // A) getActiveEducations
  const activeEdus = await profileService.getActiveEducations();
  assert(activeEdus.length === 25, `profileService.getActiveEducations() returned ${activeEdus.length} items`);

  // B) getActiveSpecializations by educationId
  const btech = await prisma.education.findFirst({ where: { slug: "btech" } });
  const btechSpecs = await profileService.getActiveSpecializations(btech?.id);
  assert(btechSpecs.length === 18, `profileService.getActiveSpecializations(btechId) returned ${btechSpecs.length} items (expected 18)`);

  const mba = await prisma.education.findFirst({ where: { slug: "mba" } });
  const mbaSpecs = await profileService.getActiveSpecializations(mba?.id);
  assert(mbaSpecs.length === 13, `profileService.getActiveSpecializations(mbaId) returned ${mbaSpecs.length} items (expected 13)`);

  // C) getActiveInstitutions with search and limit
  const iitSearch = await profileService.getActiveInstitutions({ search: "IIT" });
  assert(iitSearch.length >= 23, `profileService.getActiveInstitutions({ search: 'IIT' }) returned ${iitSearch.length} items`);

  const delhiSearch = await profileService.getActiveInstitutions({ search: "Delhi" });
  assert(delhiSearch.length >= 10, `profileService.getActiveInstitutions({ search: 'Delhi' }) returned ${delhiSearch.length} items`);

  const paginatedInstitutions = await profileService.getActiveInstitutions({ limit: 25, offset: 0 });
  assert(paginatedInstitutions.length === 25, `profileService.getActiveInstitutions({ limit: 25 }) returned 25 items`);

  // D) getActiveEmploymentStatuses
  const activeEmps = await profileService.getActiveEmploymentStatuses();
  assert(activeEmps.length === 10, `profileService.getActiveEmploymentStatuses() returned ${activeEmps.length} items`);

  // E) getActiveOccupations by employmentStatusId
  const employedStatus = await prisma.employmentStatus.findFirst({ where: { slug: "employed" } });
  const employedOccs = await profileService.getActiveOccupations(employedStatus?.id);
  assert(employedOccs.length === 37, `profileService.getActiveOccupations(employedId) returned ${employedOccs.length} items (expected 37)`);

  const govtStatus = await prisma.employmentStatus.findFirst({ where: { slug: "government-employee" } });
  const govtOccs = await profileService.getActiveOccupations(govtStatus?.id);
  assert(govtOccs.length === 18, `profileService.getActiveOccupations(govtId) returned ${govtOccs.length} items (expected 18)`);

  console.log("\n==================================================");
  if (allChecksPassed) {
    console.log("✓ ALL BATCH 4 VERIFICATION CHECKS PASSED PERFECTLY!");
  } else {
    console.error("✗ ONE OR MORE BATCH 4 VERIFICATION CHECKS FAILED!");
    throw new Error("Verification failed.");
  }
  console.log("==================================================");
}

verifyBatch4()
  .then(async () => {
    await prisma.$disconnect();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error("[VERIFICATION ERROR]:", err);
    await prisma.$disconnect();
    process.exit(1);
  });
