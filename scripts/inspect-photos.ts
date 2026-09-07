import { prisma } from "../src/config/database";
import fs from "fs";
import path from "path";

async function inspect() {
  const count = await prisma.profilePhoto.count();
  const photos = await prisma.profilePhoto.findMany({
    take: 10,
    select: {
      id: true,
      profileId: true,
      storageKey: true,
      mimeType: true,
      fileSize: true,
      moderationStatus: true,
      photoType: true,
    },
  });

  console.log("TOTAL_DB_PHOTOS:", count);
  console.log("SAMPLE_PHOTOS:", JSON.stringify(photos, null, 2));

  let existingFilesCount = 0;
  let missingFilesCount = 0;

  const allPhotos = await prisma.profilePhoto.findMany({
    select: { id: true, storageKey: true },
  });

  for (const p of allPhotos) {
    const fullPath = path.resolve(process.cwd(), "./storage", p.storageKey);
    if (fs.existsSync(fullPath)) {
      existingFilesCount++;
    } else {
      missingFilesCount++;
    }
  }

  console.log("EXISTING_ON_DISK:", existingFilesCount);
  console.log("MISSING_ON_DISK:", missingFilesCount);

  await prisma.$disconnect();
}

inspect().catch(console.error);
