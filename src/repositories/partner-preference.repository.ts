import {
  PrismaClient,
  ManglikStatus,
  MaritalStatus,
} from "@prisma/client";
import { prisma as defaultPrisma } from "../config/database";
import { SavePartnerPreferencesDto } from "../types/partner-preference";

export class PartnerPreferenceRepository {
  constructor(private prisma: PrismaClient = defaultPrisma) {}

  async findByProfileId(profileId: string) {
    return this.prisma.partnerPreference.findUnique({
      where: { profileId },
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
    });
  }

  async findActiveReligionsByIds(ids: string[]) {
    if (!ids.length) return [];
    return this.prisma.religion.findMany({
      where: { id: { in: ids }, isActive: true },
    });
  }

  async findActiveCommunitiesByIds(ids: string[]) {
    if (!ids.length) return [];
    return this.prisma.community.findMany({
      where: { id: { in: ids }, isActive: true },
    });
  }

  async findActiveSubCommunitiesByIds(ids: string[]) {
    if (!ids.length) return [];
    return this.prisma.subCommunity.findMany({
      where: { id: { in: ids }, isActive: true },
    });
  }

  async findActiveCastesByIds(ids: string[]) {
    if (!ids.length) return [];
    return this.prisma.caste.findMany({
      where: { id: { in: ids }, isActive: true },
    });
  }

  async findActiveGotrasByIds(ids: string[]) {
    if (!ids.length) return [];
    return this.prisma.gotra.findMany({
      where: { id: { in: ids }, isActive: true },
    });
  }

  async findActiveEducationsByIds(ids: string[]) {
    if (!ids.length) return [];
    return this.prisma.education.findMany({
      where: { id: { in: ids }, isActive: true },
    });
  }

  async findActiveOccupationsByIds(ids: string[]) {
    if (!ids.length) return [];
    return this.prisma.occupation.findMany({
      where: { id: { in: ids }, isActive: true },
    });
  }

  async savePartnerPreferences(
    profileId: string,
    dto: SavePartnerPreferencesDto,
    sanitized: {
      religionIds: string[];
      communityIds: string[];
      subCommunityIds: string[];
      casteIds: string[];
      gotraIds: string[];
      educationIds: string[];
      occupationIds: string[];
      manglikStatuses: ManglikStatus[];
      maritalStatuses: MaritalStatus[];
    }
  ) {
    return this.prisma.$transaction(async (tx) => {
      // 1. Upsert Parent PartnerPreference Record
      const pref = await tx.partnerPreference.upsert({
        where: { profileId },
        update: {
          minAge: dto.minAge ?? null,
          maxAge: dto.maxAge ?? null,
          minHeightCm: dto.minHeightCm ?? null,
          maxHeightCm: dto.maxHeightCm ?? null,
        },
        create: {
          profileId,
          minAge: dto.minAge ?? null,
          maxAge: dto.maxAge ?? null,
          minHeightCm: dto.minHeightCm ?? null,
          maxHeightCm: dto.maxHeightCm ?? null,
        },
      });

      const prefId = pref.id;

      // 2. Clear All Existing Junction Records
      await tx.partnerPreferenceReligion.deleteMany({ where: { partnerPreferenceId: prefId } });
      await tx.partnerPreferenceCommunity.deleteMany({ where: { partnerPreferenceId: prefId } });
      await tx.partnerPreferenceSubCommunity.deleteMany({ where: { partnerPreferenceId: prefId } });
      await tx.partnerPreferenceCaste.deleteMany({ where: { partnerPreferenceId: prefId } });
      await tx.partnerPreferenceGotra.deleteMany({ where: { partnerPreferenceId: prefId } });
      await tx.partnerPreferenceEducation.deleteMany({ where: { partnerPreferenceId: prefId } });
      await tx.partnerPreferenceOccupation.deleteMany({ where: { partnerPreferenceId: prefId } });
      await tx.partnerPreferenceManglik.deleteMany({ where: { partnerPreferenceId: prefId } });
      await tx.partnerPreferenceMaritalStatus.deleteMany({ where: { partnerPreferenceId: prefId } });

      // 3. Insert New Junction Records Atomically
      if (sanitized.religionIds.length > 0) {
        await tx.partnerPreferenceReligion.createMany({
          data: sanitized.religionIds.map((id) => ({
            partnerPreferenceId: prefId,
            religionId: id,
          })),
        });
      }

      if (sanitized.communityIds.length > 0) {
        await tx.partnerPreferenceCommunity.createMany({
          data: sanitized.communityIds.map((id) => ({
            partnerPreferenceId: prefId,
            communityId: id,
          })),
        });
      }

      if (sanitized.subCommunityIds.length > 0) {
        await tx.partnerPreferenceSubCommunity.createMany({
          data: sanitized.subCommunityIds.map((id) => ({
            partnerPreferenceId: prefId,
            subCommunityId: id,
          })),
        });
      }

      if (sanitized.casteIds.length > 0) {
        await tx.partnerPreferenceCaste.createMany({
          data: sanitized.casteIds.map((id) => ({
            partnerPreferenceId: prefId,
            casteId: id,
          })),
        });
      }

      if (sanitized.gotraIds.length > 0) {
        await tx.partnerPreferenceGotra.createMany({
          data: sanitized.gotraIds.map((id) => ({
            partnerPreferenceId: prefId,
            gotraId: id,
          })),
        });
      }

      if (sanitized.educationIds.length > 0) {
        await tx.partnerPreferenceEducation.createMany({
          data: sanitized.educationIds.map((id) => ({
            partnerPreferenceId: prefId,
            educationId: id,
          })),
        });
      }

      if (sanitized.occupationIds.length > 0) {
        await tx.partnerPreferenceOccupation.createMany({
          data: sanitized.occupationIds.map((id) => ({
            partnerPreferenceId: prefId,
            occupationId: id,
          })),
        });
      }

      if (sanitized.manglikStatuses.length > 0) {
        await tx.partnerPreferenceManglik.createMany({
          data: sanitized.manglikStatuses.map((st) => ({
            partnerPreferenceId: prefId,
            manglik: st,
          })),
        });
      }

      if (sanitized.maritalStatuses.length > 0) {
        await tx.partnerPreferenceMaritalStatus.createMany({
          data: sanitized.maritalStatuses.map((st) => ({
            partnerPreferenceId: prefId,
            maritalStatus: st,
          })),
        });
      }

      // 4. Return Fresh Complete Data with Relations
      return tx.partnerPreference.findUnique({
        where: { id: prefId },
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
      });
    });
  }
}

export const partnerPreferenceRepository = new PartnerPreferenceRepository();
