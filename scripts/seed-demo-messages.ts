import { PrismaClient, UserStatus, MessageRequestStatus } from "@prisma/client";
import jwt from "jsonwebtoken";
import { config } from "../src/config/env";

const prisma = new PrismaClient();

async function main() {
  console.log("[SEEDING DEMO MESSAGING STATE]");

  const hindi = await prisma.language.findFirst({ where: { code: "hi" } });
  const hindu = await prisma.religion.findFirst({ where: { slug: "hindu" } });
  const brahmin = await prisma.community.findFirst({ where: { slug: "brahmin" } });

  // 1. Ensure Demo User Arya exists
  const aryaPhone = "+919876543210";
  const userArya = await prisma.user.upsert({
    where: { phone: aryaPhone },
    update: { status: UserStatus.ACTIVE },
    create: {
      phone: aryaPhone,
      status: UserStatus.ACTIVE,
      phoneVerifiedAt: new Date(),
    },
  });

  await prisma.profile.upsert({
    where: { userId: userArya.id },
    update: { profileStatus: "ACTIVE", completionPercentage: 100 },
    create: {
      userId: userArya.id,
      profileCreatedFor: "MYSELF",
      profileStatus: "ACTIVE",
      completionPercentage: 100,
      submittedAt: new Date(),
      personalDetails: {
        create: {
          firstName: "Arya",
          lastName: "Sharma",
          gender: "MALE",
          maritalStatus: "NEVER_MARRIED",
          dateOfBirth: new Date("1996-06-15"),
          heightCm: 178,
          motherTongueId: hindi!.id,
        },
      },
      religion: hindu
        ? {
            create: {
              religionId: hindu.id,
              communityId: brahmin?.id,
              manglik: "NO",
            },
          }
        : undefined,
    },
  });

  // 2. Fetch Priya & Ananya
  const userPriya = await prisma.user.findFirst({ where: { phone: "+919999000001" } });
  const userAnanya = await prisma.user.findFirst({ where: { phone: "+919999000002" } });

  if (!userPriya || !userAnanya) {
    console.error("Priya or Ananya not found in DB!");
    return;
  }

  // 3. Clear existing demo requests/conversations for Arya
  await prisma.message.deleteMany({
    where: {
      OR: [
        { senderUserId: userArya.id },
        { senderUserId: userPriya.id },
        { senderUserId: userAnanya.id },
      ],
    },
  });
  await prisma.conversationParticipant.deleteMany({
    where: { userId: { in: [userArya.id, userPriya.id, userAnanya.id] } },
  });
  await prisma.conversation.deleteMany({
    where: {
      OR: [
        { userOneId: userArya.id },
        { userTwoId: userArya.id },
      ],
    },
  });
  await prisma.messageRequest.deleteMany({
    where: {
      OR: [
        { senderUserId: userArya.id },
        { receiverUserId: userArya.id },
      ],
    },
  });

  // 4. Create Incoming Request from Priya to Arya
  const priyaRequest = await prisma.messageRequest.create({
    data: {
      senderUserId: userPriya.id,
      receiverUserId: userArya.id,
      status: MessageRequestStatus.PENDING,
    },
  });

  await prisma.notification.create({
    data: {
      userId: userArya.id,
      type: "MESSAGE_REQUEST_RECEIVED",
      title: "New Message Request",
      body: "Priya Sharma wants to connect with you.",
      relatedRequestId: priyaRequest.id,
    },
  });

  // 5. Create Accepted Connection between Ananya and Arya
  const ananyaRequest = await prisma.messageRequest.create({
    data: {
      senderUserId: userAnanya.id,
      receiverUserId: userArya.id,
      status: MessageRequestStatus.ACCEPTED,
      respondedAt: new Date(Date.now() - 3600000),
    },
  });

  const userOneId = userArya.id < userAnanya.id ? userArya.id : userAnanya.id;
  const userTwoId = userArya.id < userAnanya.id ? userAnanya.id : userArya.id;

  const conv = await prisma.conversation.create({
    data: {
      userOneId,
      userTwoId,
    },
  });

  await prisma.conversationParticipant.createMany({
    data: [
      { conversationId: conv.id, userId: userOneId },
      { conversationId: conv.id, userId: userTwoId },
    ],
  });

  // Messages in conversation
  await prisma.message.create({
    data: {
      conversationId: conv.id,
      senderUserId: userAnanya.id,
      body: "Namaste Arya, happy to connect with you on Manglam Matrimony!",
      createdAt: new Date(Date.now() - 1800000),
      readAt: new Date(Date.now() - 1500000),
    },
  });

  await prisma.message.create({
    data: {
      conversationId: conv.id,
      senderUserId: userArya.id,
      body: "Namaste Ananya! Glad to connect as well. How has your week been?",
      createdAt: new Date(Date.now() - 1200000),
      readAt: new Date(Date.now() - 900000),
    },
  });

  await prisma.message.create({
    data: {
      conversationId: conv.id,
      senderUserId: userAnanya.id,
      body: "It's going well, thank you. Would love to learn more about your family background.",
      createdAt: new Date(Date.now() - 300000),
    },
  });

  // Issue JWT token for Arya
  const token = jwt.sign(
    {
      userId: userArya.id,
      phone: userArya.phone,
      roles: ["USER"],
      status: userArya.status,
    },
    config.jwtSecret,
    { expiresIn: config.jwtExpiry as jwt.SignOptions["expiresIn"] }
  );

  console.log("DEMO_TOKEN:" + token);
  console.log("USER_JSON:" + JSON.stringify({ id: userArya.id, phone: userArya.phone, roles: ["USER"] }));
  console.log("PRIYA_REQUEST_ID:" + priyaRequest.id);
  console.log("CONVERSATION_ID:" + conv.id);
  console.log("✓ Seeded demo requests & conversation successfully!");
}

main().finally(() => prisma.$disconnect());
