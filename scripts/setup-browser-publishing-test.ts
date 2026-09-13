import "dotenv/config";
import { prisma } from "../src/config/database";
import {
  UserRole,
  UserStatus,
  AccountActivationStatus,
  ProfileStatus,
  ProfileCreatedFor,
  Gender,
  MaritalStatus,
  ManglikStatus,
  PhotoType,
  ModerationStatus,
} from "@prisma/client";

async function setup() {
  console.log("Setting up controlled browser verification accounts...");

  const admin = await prisma.user.findFirst({ where: { role: UserRole.ADMIN } });
  const religion = await prisma.religion.findFirst();
  const language = await prisma.language.findFirst();
  const education = await prisma.education.findFirst();
  const occupation = await prisma.occupation.findFirst();
  const employmentStatus = await prisma.employmentStatus.findFirst();

  // 1. Controlled Candidate: Kavita Verma (Female, 100% complete, unsubmitted/INCOMPLETE, PENDING_ACTIVATION)
  const candidateEmail = "kavita.verma@manglam.test";
  await prisma.user.deleteMany({ where: { email: candidateEmail } });

  const candidate = await prisma.user.create({
    data: {
      email: candidateEmail,
      role: UserRole.USER,
      status: UserStatus.ACTIVE,
      activationStatus: AccountActivationStatus.PENDING_ACTIVATION,
      emailVerifiedAt: null,
      profile: {
        create: {
          profileCreatedFor: ProfileCreatedFor.MYSELF,
          profileStatus: ProfileStatus.INCOMPLETE,
          completionPercentage: 100,
          personalDetails: {
            create: {
              firstName: "Kavita",
              lastName: "Verma",
              gender: Gender.FEMALE,
              dateOfBirth: new Date("1997-08-20"),
              maritalStatus: MaritalStatus.NEVER_MARRIED,
              heightCm: 168,
              motherTongueId: language!.id,
              city: "Jaipur",
              state: "Rajasthan",
            },
          },
          languages: {
            create: {
              languageId: language!.id,
            },
          },
          religion: {
            create: {
              religionId: religion!.id,
              manglik: ManglikStatus.NO,
            },
          },
          education: {
            create: {
              educationId: education!.id,
            },
          },
          career: {
            create: {
              employmentStatusId: employmentStatus!.id,
              occupationId: occupation?.id || null,
            },
          },
          partnerPreference: {
            create: {
              minAge: 25,
              maxAge: 35,
            },
          },
          photos: {
            create: {
              storageKey: `profiles/demo/kavita.webp`,
              storageProvider: "local",
              originalFileName: "kavita.webp",
              mimeType: "image/webp",
              fileSize: 10240,
              width: 300,
              height: 300,
              photoType: PhotoType.PRIMARY,
              moderationStatus: ModerationStatus.APPROVED,
              moderatedAt: new Date(),
              moderatedByUserId: admin!.id,
            },
          },
        },
      },
    },
    include: { profile: true },
  });

  console.log("Created controlled candidate:", {
    id: candidate.id,
    email: candidate.email,
    profileId: candidate.profile?.id,
    profileStatus: candidate.profile?.profileStatus,
    completionPercentage: candidate.profile?.completionPercentage,
    activationStatus: candidate.activationStatus,
  });

  // 2. Normal Member: Vikram Malhotra (Male, ACTIVE, can log in with OTP 123456)
  const memberEmail = "vikram.malhotra@manglam.test";
  await prisma.user.deleteMany({ where: { email: memberEmail } });

  const member = await prisma.user.create({
    data: {
      email: memberEmail,
      role: UserRole.USER,
      status: UserStatus.ACTIVE,
      activationStatus: AccountActivationStatus.ACTIVE,
      emailVerifiedAt: new Date(),
      profile: {
        create: {
          profileCreatedFor: ProfileCreatedFor.MYSELF,
          profileStatus: ProfileStatus.ACTIVE,
          completionPercentage: 100,
          personalDetails: {
            create: {
              firstName: "Vikram",
              lastName: "Malhotra",
              gender: Gender.MALE,
              dateOfBirth: new Date("1995-03-12"),
              maritalStatus: MaritalStatus.NEVER_MARRIED,
              heightCm: 180,
              motherTongueId: language!.id,
              city: "Jaipur",
              state: "Rajasthan",
            },
          },
          languages: {
            create: {
              languageId: language!.id,
            },
          },
          religion: {
            create: {
              religionId: religion!.id,
              manglik: ManglikStatus.NO,
            },
          },
          education: {
            create: {
              educationId: education!.id,
            },
          },
          career: {
            create: {
              employmentStatusId: employmentStatus!.id,
            },
          },
          partnerPreference: {
            create: {
              minAge: 20,
              maxAge: 32,
            },
          },
          photos: {
            create: {
              storageKey: `profiles/demo/vikram.webp`,
              storageProvider: "local",
              originalFileName: "vikram.webp",
              mimeType: "image/webp",
              fileSize: 10240,
              width: 300,
              height: 300,
              photoType: PhotoType.PRIMARY,
              moderationStatus: ModerationStatus.APPROVED,
              moderatedAt: new Date(),
              moderatedByUserId: admin!.id,
            },
          },
        },
      },
    },
  });

  console.log("Created normal browsing member:", {
    id: member.id,
    email: member.email,
  });

  console.log("Setup complete!");
}

setup()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
