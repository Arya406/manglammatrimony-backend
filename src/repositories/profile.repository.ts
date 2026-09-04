import {
  PrismaClient,
  Profile,
  ProfileCreatedFor,
  ProfileStatus,
  ProfilePersonalDetails,
  ProfileReligion,
  ProfileEducation,
  ProfileCareer,
  Language,
  Religion,
  Community,
  SubCommunity,
  Caste,
  SubCaste,
  Gotra,
  Education,
  Specialization,
  Institution,
  EmploymentStatus,
  Occupation,
  ManglikStatus,
} from "@prisma/client";
import { prisma as defaultPrisma } from "../config/database";
import {
  SavePersonalDetailsDto,
  SaveReligionDto,
  SaveEducationDto,
  SaveCareerDto,
} from "../types/profile";

export class ProfileRepository {
  constructor(private prisma: PrismaClient = defaultPrisma) {}

  async findByUserId(userId: string): Promise<Profile | null> {
    return this.prisma.profile.findUnique({
      where: { userId },
    });
  }

  async findById(id: string): Promise<Profile | null> {
    return this.prisma.profile.findUnique({
      where: { id },
    });
  }

  async createOrGetProfile(
    userId: string,
    profileCreatedFor: ProfileCreatedFor
  ): Promise<{ profile: Profile; isNew: boolean }> {
    // 1. Check existing
    const existing = await this.prisma.profile.findUnique({
      where: { userId },
    });

    if (existing) {
      if (existing.profileCreatedFor !== profileCreatedFor) {
        const updated = await this.prisma.profile.update({
          where: { id: existing.id },
          data: { profileCreatedFor },
        });
        return { profile: updated, isNew: false };
      }
      return { profile: existing, isNew: false };
    }

    // 2. Create profile with upsert to prevent concurrent unique constraint collision
    const profile = await this.prisma.profile.upsert({
      where: { userId },
      update: { profileCreatedFor },
      create: {
        userId,
        profileCreatedFor,
        profileStatus: ProfileStatus.INCOMPLETE,
        completionPercentage: 0,
      },
    });

    return { profile, isNew: true };
  }

  async getCompleteProfile(userId: string) {
    return this.prisma.profile.findUnique({
      where: { userId },
      include: {
        personalDetails: {
          include: {
            motherTongue: {
              select: { id: true, name: true, code: true },
            },
          },
        },
        languages: {
          include: {
            language: {
              select: { id: true, name: true, code: true },
            },
          },
        },
        religion: {
          include: {
            religion: {
              select: { id: true, name: true, slug: true },
            },
            community: {
              select: { id: true, name: true, slug: true },
            },
            subCommunity: {
              select: { id: true, name: true, slug: true },
            },
            caste: {
              select: { id: true, name: true, slug: true },
            },
            subCaste: {
              select: { id: true, name: true, slug: true },
            },
            gotra: {
              select: { id: true, name: true, slug: true },
            },
          },
        },
        education: {
          include: {
            education: {
              select: { id: true, name: true, slug: true },
            },
            specialization: {
              select: { id: true, name: true, slug: true },
            },
            institution: {
              select: { id: true, name: true, normalizedName: true, type: true },
            },
          },
        },
        career: {
          include: {
            employmentStatus: {
              select: { id: true, name: true, slug: true },
            },
            occupation: {
              select: { id: true, name: true, slug: true },
            },
          },
        },
        photos: {
          orderBy: { sortOrder: "asc" },
        },
        partnerPreference: {
          include: {
            religions: {
              include: {
                religion: {
                  select: { id: true, name: true, slug: true },
                },
              },
            },
            communities: {
              include: {
                community: {
                  select: { id: true, name: true, slug: true },
                },
              },
            },
            subCommunities: {
              include: {
                subCommunity: {
                  select: { id: true, name: true, slug: true },
                },
              },
            },
            castes: {
              include: {
                caste: {
                  select: { id: true, name: true, slug: true },
                },
              },
            },
            gotras: {
              include: {
                gotra: {
                  select: { id: true, name: true, slug: true },
                },
              },
            },
            educations: {
              include: {
                education: {
                  select: { id: true, name: true, slug: true },
                },
              },
            },
            occupations: {
              include: {
                occupation: {
                  select: { id: true, name: true, slug: true },
                },
              },
            },
            manglik: true,
            maritalStatuses: true,
          },
        },
      },
    });
  }

  async getAllActiveLanguages(): Promise<Language[]> {
    return this.prisma.language.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" },
    });
  }

  async verifyActiveLanguages(languageIds: string[]): Promise<Language[]> {
    if (!languageIds.length) return [];
    return this.prisma.language.findMany({
      where: {
        id: { in: languageIds },
        isActive: true,
      },
    });
  }

  async verifyActiveLanguage(languageId: string): Promise<Language | null> {
    return this.prisma.language.findFirst({
      where: {
        id: languageId,
        isActive: true,
      },
    });
  }

  async getAllActiveReligions(): Promise<Religion[]> {
    return this.prisma.religion.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" },
    });
  }

  async getActiveCommunities(religionId?: string): Promise<Community[]> {
    return this.prisma.community.findMany({
      where: {
        isActive: true,
        ...(religionId ? { OR: [{ religionId }, { religionId: null }] } : {}),
      },
      orderBy: { sortOrder: "asc" },
    });
  }

  async getActiveSubCommunities(communityId?: string): Promise<SubCommunity[]> {
    return this.prisma.subCommunity.findMany({
      where: {
        isActive: true,
        ...(communityId ? { communityId } : {}),
      },
      orderBy: { sortOrder: "asc" },
    });
  }

  async getActiveCastes(communityId?: string): Promise<Caste[]> {
    return this.prisma.caste.findMany({
      where: {
        isActive: true,
        ...(communityId ? { communityId } : {}),
      },
      orderBy: { sortOrder: "asc" },
    });
  }

  async getActiveSubCastes(casteId?: string): Promise<SubCaste[]> {
    return this.prisma.subCaste.findMany({
      where: {
        isActive: true,
        ...(casteId ? { casteId } : {}),
      },
      orderBy: { sortOrder: "asc" },
    });
  }

  async getActiveGotras(communityId?: string): Promise<Gotra[]> {
    return this.prisma.gotra.findMany({
      where: {
        isActive: true,
        ...(communityId ? { communityId } : {}),
      },
      orderBy: { sortOrder: "asc" },
    });
  }

  async getAllActiveEducations(): Promise<Education[]> {
    return this.prisma.education.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" },
    });
  }

  async getActiveSpecializations(educationId?: string): Promise<Specialization[]> {
    return this.prisma.specialization.findMany({
      where: {
        isActive: true,
        ...(educationId ? { educationId } : {}),
      },
      orderBy: { sortOrder: "asc" },
    });
  }

  async getAllActiveInstitutions(): Promise<Institution[]> {
    return this.prisma.institution.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
    });
  }

  async getAllActiveEmploymentStatuses(): Promise<EmploymentStatus[]> {
    return this.prisma.employmentStatus.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" },
    });
  }

  async getActiveOccupations(employmentStatusId?: string): Promise<Occupation[]> {
    return this.prisma.occupation.findMany({
      where: {
        isActive: true,
        ...(employmentStatusId ? { employmentStatusId } : {}),
      },
      orderBy: { sortOrder: "asc" },
    });
  }

  async findReligionById(id: string): Promise<Religion | null> {
    return this.prisma.religion.findFirst({
      where: { id, isActive: true },
    });
  }

  async findCommunityById(id: string): Promise<Community | null> {
    return this.prisma.community.findFirst({
      where: { id, isActive: true },
    });
  }

  async findSubCommunityById(id: string): Promise<SubCommunity | null> {
    return this.prisma.subCommunity.findFirst({
      where: { id, isActive: true },
    });
  }

  async findCasteById(id: string): Promise<Caste | null> {
    return this.prisma.caste.findFirst({
      where: { id, isActive: true },
    });
  }

  async findSubCasteById(id: string): Promise<SubCaste | null> {
    return this.prisma.subCaste.findFirst({
      where: { id, isActive: true },
    });
  }

  async findGotraById(id: string): Promise<Gotra | null> {
    return this.prisma.gotra.findFirst({
      where: { id, isActive: true },
    });
  }

  async findEducationById(id: string): Promise<Education | null> {
    return this.prisma.education.findFirst({
      where: { id, isActive: true },
    });
  }

  async findSpecializationById(id: string): Promise<Specialization | null> {
    return this.prisma.specialization.findFirst({
      where: { id, isActive: true },
    });
  }

  async findInstitutionById(id: string): Promise<Institution | null> {
    return this.prisma.institution.findFirst({
      where: { id, isActive: true },
    });
  }

  async findEmploymentStatusById(id: string): Promise<EmploymentStatus | null> {
    return this.prisma.employmentStatus.findFirst({
      where: { id, isActive: true },
    });
  }

  async findOccupationById(id: string): Promise<Occupation | null> {
    return this.prisma.occupation.findFirst({
      where: { id, isActive: true },
    });
  }

  async savePersonalDetailsAndLanguages(
    profileId: string,
    data: SavePersonalDetailsDto,
    cleanLanguageIds: string[]
  ): Promise<{
    personalDetails: ProfilePersonalDetails;
    languages: Array<{ languageId: string; name: string; code: string }>;
  }> {
    return this.prisma.$transaction(async (tx) => {
      // 1. Upsert Personal Details
      const personalDetails = await tx.profilePersonalDetails.upsert({
        where: { profileId },
        update: {
          firstName: data.firstName,
          lastName: data.lastName,
          gender: data.gender,
          dateOfBirth: new Date(data.dateOfBirth),
          maritalStatus: data.maritalStatus,
          heightCm: data.heightCm,
          motherTongueId: data.motherTongueId,
          city: data.city ? data.city.trim() : null,
          state: data.state ? data.state.trim() : null,
        },
        create: {
          profileId,
          firstName: data.firstName,
          lastName: data.lastName,
          gender: data.gender,
          dateOfBirth: new Date(data.dateOfBirth),
          maritalStatus: data.maritalStatus,
          heightCm: data.heightCm,
          motherTongueId: data.motherTongueId,
          city: data.city ? data.city.trim() : null,
          state: data.state ? data.state.trim() : null,
        },
        include: {
          motherTongue: {
            select: { id: true, name: true, code: true },
          },
        },
      });

      // 2. Synchronize Languages in junction table
      await tx.profileLanguage.deleteMany({
        where: { profileId },
      });

      if (cleanLanguageIds.length > 0) {
        await tx.profileLanguage.createMany({
          data: cleanLanguageIds.map((langId) => ({
            profileId,
            languageId: langId,
          })),
        });
      }

      // 3. Query updated languages
      const updatedLanguages = await tx.profileLanguage.findMany({
        where: { profileId },
        include: {
          language: {
            select: { id: true, name: true, code: true },
          },
        },
      });

      return {
        personalDetails,
        languages: updatedLanguages.map((l) => ({
          languageId: l.language.id,
          name: l.language.name,
          code: l.language.code,
        })),
      };
    });
  }

  async upsertReligion(
    profileId: string,
    data: SaveReligionDto
  ): Promise<ProfileReligion> {
    const manglikVal = data.manglik ?? ManglikStatus.DONT_KNOW;

    return this.prisma.profileReligion.upsert({
      where: { profileId },
      update: {
        religionId: data.religionId,
        communityId: data.communityId ?? null,
        subCommunityId: data.subCommunityId ?? null,
        casteId: data.casteId ?? null,
        subCasteId: data.subCasteId ?? null,
        gotraId: data.gotraId ?? null,
        manglik: manglikVal,
        customReligion: data.customReligion ?? null,
        customCommunity: data.customCommunity ?? null,
        customCaste: data.customCaste ?? null,
        customSubCaste: data.customSubCaste ?? null,
      },
      create: {
        profileId,
        religionId: data.religionId,
        communityId: data.communityId ?? null,
        subCommunityId: data.subCommunityId ?? null,
        casteId: data.casteId ?? null,
        subCasteId: data.subCasteId ?? null,
        gotraId: data.gotraId ?? null,
        manglik: manglikVal,
        customReligion: data.customReligion ?? null,
        customCommunity: data.customCommunity ?? null,
        customCaste: data.customCaste ?? null,
        customSubCaste: data.customSubCaste ?? null,
      },
      include: {
        religion: {
          select: { id: true, name: true, slug: true },
        },
        community: {
          select: { id: true, name: true, slug: true },
        },
        subCommunity: {
          select: { id: true, name: true, slug: true },
        },
        caste: {
          select: { id: true, name: true, slug: true },
        },
        subCaste: {
          select: { id: true, name: true, slug: true },
        },
        gotra: {
          select: { id: true, name: true, slug: true },
        },
      },
    });
  }

  async upsertEducationCareer(
    profileId: string,
    educationData: SaveEducationDto,
    careerData: SaveCareerDto
  ): Promise<{
    education: ProfileEducation;
    career: ProfileCareer;
  }> {
    return this.prisma.$transaction(async (tx) => {
      // 1. Upsert ProfileEducation
      const education = await tx.profileEducation.upsert({
        where: { profileId },
        update: {
          educationId: educationData.educationId,
          specializationId: educationData.specializationId ?? null,
          institutionId: educationData.institutionId ?? null,
          institutionName: educationData.institutionName ?? null,
        },
        create: {
          profileId,
          educationId: educationData.educationId,
          specializationId: educationData.specializationId ?? null,
          institutionId: educationData.institutionId ?? null,
          institutionName: educationData.institutionName ?? null,
        },
        include: {
          education: {
            select: { id: true, name: true, slug: true },
          },
          specialization: {
            select: { id: true, name: true, slug: true },
          },
          institution: {
            select: { id: true, name: true, normalizedName: true, type: true },
          },
        },
      });

      // 2. Upsert ProfileCareer
      const career = await tx.profileCareer.upsert({
        where: { profileId },
        update: {
          employmentStatusId: careerData.employmentStatusId,
          occupationId: careerData.occupationId ?? null,
          companyName: careerData.companyName ?? null,
          employmentType: careerData.employmentType ?? null,
          annualIncomeRange: careerData.annualIncomeRange ?? null,
        },
        create: {
          profileId,
          employmentStatusId: careerData.employmentStatusId,
          occupationId: careerData.occupationId ?? null,
          companyName: careerData.companyName ?? null,
          employmentType: careerData.employmentType ?? null,
          annualIncomeRange: careerData.annualIncomeRange ?? null,
        },
        include: {
          employmentStatus: {
            select: { id: true, name: true, slug: true },
          },
          occupation: {
            select: { id: true, name: true, slug: true },
          },
        },
      });

      return { education, career };
    });
  }

  async updateCompletionPercentage(
    profileId: string,
    completionPercentage: number
  ): Promise<Profile> {
    return this.prisma.profile.update({
      where: { id: profileId },
      data: { completionPercentage },
    });
  }

  async getProfileSubmissionState(userId: string) {
    return this.prisma.profile.findUnique({
      where: { userId },
      include: {
        personalDetails: true,
        languages: true,
        religion: true,
        education: true,
        career: true,
        photos: {
          select: {
            id: true,
            photoType: true,
            moderationStatus: true,
          },
        },
        partnerPreference: {
          select: {
            id: true,
          },
        },
      },
    });
  }

  async submitProfile(profileId: string): Promise<Profile | null> {
    const existing = await this.prisma.profile.findUnique({
      where: { id: profileId },
    });

    if (!existing) return null;

    // Idempotency: If already IN_REVIEW or ACTIVE, preserve state and timestamps
    if (
      existing.profileStatus === ProfileStatus.IN_REVIEW ||
      existing.profileStatus === ProfileStatus.ACTIVE
    ) {
      return existing;
    }

    const now = new Date();
    return this.prisma.profile.update({
      where: { id: profileId },
      data: {
        profileStatus: ProfileStatus.IN_REVIEW,
        submittedAt: now,
      },
    });
  }
}

export const profileRepository = new ProfileRepository();
