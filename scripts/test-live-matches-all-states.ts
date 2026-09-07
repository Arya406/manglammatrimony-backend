import { prisma } from "../src/config/database";
import jwt from "jsonwebtoken";
import { config } from "../src/config/env";

async function testHttp() {
  console.log("=== Testing GET /api/matches over HTTP ===");

  // Find users for each status
  const activeUser = await prisma.user.findFirst({
    where: {
      status: "ACTIVE",
      profile: { profileStatus: "ACTIVE" },
    },
    include: { profile: true },
  });

  const inReviewUser = await prisma.user.findFirst({
    where: {
      status: "ACTIVE",
      profile: { profileStatus: "IN_REVIEW" },
    },
    include: { profile: true },
  });

  const incompleteUser = await prisma.user.findFirst({
    where: {
      status: "ACTIVE",
      profile: { profileStatus: "INCOMPLETE" },
    },
    include: { profile: true },
  });

  let suspendedUser = await prisma.user.findFirst({
    where: { status: "SUSPENDED" },
    include: { profile: true },
  });

  if (!suspendedUser) {
    suspendedUser = await prisma.user.create({
      data: {
        email: `suspended.test.${Date.now()}@example.com`,
        status: "SUSPENDED",
      },
      include: { profile: true },
    });
  }

  const testCases = [
    { name: "ACTIVE", user: activeUser, expectedStatus: 200 },
    { name: "IN_REVIEW", user: inReviewUser, expectedStatus: 403 },
    { name: "INCOMPLETE", user: incompleteUser, expectedStatus: 403 },
    { name: "SUSPENDED", user: suspendedUser, expectedStatus: 403 },
  ];

  for (const tc of testCases) {
    if (!tc.user) {
      console.log(`[SKIP] No user for ${tc.name}`);
      continue;
    }
    const token = jwt.sign(
      { userId: tc.user.id, email: tc.user.email, status: tc.user.status },
      config.jwtSecret,
      { expiresIn: "1h" }
    );

    try {
      const res = await fetch("http://localhost:5000/api/matches", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const data: any = await res.json();
      console.log(
        `[${tc.name}] HTTP Status: ${res.status} (Expected: ${tc.expectedStatus}), Success: ${data.success}, Code: ${data.code || "N/A"}`
      );
      if (res.status === 200) {
        console.log(`  Profiles count: ${data.data?.profiles?.length}, Total: ${data.data?.pagination?.total}`);
        if (data.data?.profiles?.length > 0) {
          console.log(`  First candidate: ${data.data.profiles[0].name}, ${data.data.profiles[0].age} yrs`);
        }
      } else {
        console.log(`  Message: ${data.message}`);
      }
    } catch (err: any) {
      console.error(`[${tc.name}] HTTP Request Failed:`, err.message);
    }
  }
}

testHttp()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
