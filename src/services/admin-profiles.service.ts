import { prisma } from "../config/database";
import {
  Gender,
  ProfileStatus,
  UserStatus,
  Prisma,
  ProfileCreatedFor,
  ManglikStatus,
  MaritalStatus,
  EmploymentType,
  AnnualIncomeRange,
} from "@prisma/client";
import { resolvePhotoPublicUrl } from "../providers/storage";
import { calculateProfileCompletion } from "./profile.completion";
import {
  AdminUpdateProfileCreatedForDto,
  AdminUpdatePersonalDetailsDto,
  AdminUpdateReligionDto,
  AdminUpdateEducationCareerDto,
  AdminUpdatePartnerPreferencesDto,
} from "../types/admin-profile-edit";

export interface AdminListProfilesOptions {
  page?: number;
  pageSize?: number;
  q?: string;
  gender?: Gender;
  profileStatus?: ProfileStatus;
  userStatus?: UserStatus;
  sort?: "newest" | "oldest" | "name_asc" | "name_desc";
}

export interface AdminProfileListResponse {
  profiles: Array<{
    id: string;
    userId: string;
    profileStatus: ProfileStatus;
    completionPercentage: number;
    submittedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    user: {
      id: string;
      email: string | null;
      status: UserStatus;
      role: string;
    };
    personalDetails: {
      firstName: string;
      lastName: string;
      gender: Gender;
      dateOfBirth: Date;
      city: string | null;
      state: string | null;
    } | null;
    primaryPhotoUrl: string | null;
  }>;
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };
}

export interface AdminProfileMutationResult<T = unknown> {
  success: boolean;
  status: number;
  code: string;
  message: string;
  data?: T;
  currentUpdatedAt?: string;
}

export class AdminProfilesService {
  /**
   * Authoritative admin list query retrieving all matrimonial profiles.
   */
  async listProfiles(options: AdminListProfilesOptions): Promise<AdminProfileListResponse> {
    const page = Math.max(1, Number(options.page) || 1);
    const rawPageSize = Number(options.pageSize) || 20;
    const pageSize = Math.min(100, Math.max(1, rawPageSize));

    const where: Prisma.ProfileWhereInput = {};

    if (options.profileStatus) {
      where.profileStatus = options.profileStatus;
    }

    if (options.gender) {
      where.personalDetails = {
        gender: options.gender,
      };
    }

    if (options.userStatus) {
      where.user = {
        status: options.userStatus,
      };
    }

    if (options.q && options.q.trim()) {
      const term = options.q.trim();
      where.AND = [
        {
          OR: [
            { personalDetails: { firstName: { contains: term, mode: "insensitive" } } },
            { personalDetails: { lastName: { contains: term, mode: "insensitive" } } },
            { user: { email: { contains: term, mode: "insensitive" } } },
            { personalDetails: { city: { contains: term, mode: "insensitive" } } },
            { personalDetails: { state: { contains: term, mode: "insensitive" } } },
          ],
        },
      ];
    }

    let orderBy: Prisma.ProfileOrderByWithRelationInput[];
    switch (options.sort) {
      case "oldest":
        orderBy = [{ createdAt: "asc" }, { id: "asc" }];
        break;
      case "name_asc":
        orderBy = [
          { personalDetails: { firstName: "asc" } },
          { createdAt: "desc" },
          { id: "desc" },
        ];
        break;
      case "name_desc":
        orderBy = [
          { personalDetails: { firstName: "desc" } },
          { createdAt: "desc" },
          { id: "desc" },
        ];
        break;
      case "newest":
      default:
        orderBy = [{ createdAt: "desc" }, { id: "desc" }];
        break;
    }

    const [total, profiles] = await Promise.all([
      prisma.profile.count({ where }),
      prisma.profile.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy,
        select: {
          id: true,
          userId: true,
          profileStatus: true,
          completionPercentage: true,
          submittedAt: true,
          createdAt: true,
          updatedAt: true,
          user: {
            select: {
              id: true,
              email: true,
              status: true,
              role: true,
            },
          },
          personalDetails: {
            select: {
              firstName: true,
              lastName: true,
              gender: true,
              dateOfBirth: true,
              city: true,
              state: true,
            },
          },
          photos: {
            select: {
              id: true,
              storageKey: true,
              storageProvider: true,
              photoType: true,
              moderationStatus: true,
            },
          },
        },
      }),
    ]);

    const mappedProfiles = profiles.map((p) => {
      const primaryPhoto =
        p.photos.find((ph) => ph.photoType === "PRIMARY") || p.photos[0] || null;
      const primaryPhotoUrl = primaryPhoto
        ? resolvePhotoPublicUrl(
            primaryPhoto.storageKey,
            primaryPhoto.id,
            primaryPhoto.storageProvider
          )
        : null;

      return {
        id: p.id,
        userId: p.userId,
        profileStatus: p.profileStatus,
        completionPercentage: p.completionPercentage,
        submittedAt: p.submittedAt,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
        user: p.user,
        personalDetails: p.personalDetails,
        primaryPhotoUrl,
      };
    });

    const totalPages = Math.ceil(total / pageSize);

    return {
      profiles: mappedProfiles,
      pagination: {
        page,
        pageSize,
        total,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    };
  }

  /**
   * Retrieves complete read-only profile detail for administrative inspection.
   * Includes all relations, partner preferences, audit metadata, and languages.
   * Strictly excludes passwordHash and sensitive authentication secrets.
   */
  async getProfileDetail(profileId: string) {
    const profile = await prisma.profile.findUnique({
      where: { id: profileId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            phone: true,
            status: true,
            role: true,
            phoneVerifiedAt: true,
            emailVerifiedAt: true,
            createdAt: true,
            updatedAt: true,
          },
        },
        lastEditedByUser: {
          select: {
            id: true,
            email: true,
          },
        },
        personalDetails: {
          include: {
            motherTongue: true,
          },
        },
        religion: {
          include: {
            religion: true,
            community: true,
            subCommunity: true,
            caste: true,
            subCaste: true,
            gotra: true,
          },
        },
        education: {
          include: {
            education: true,
            specialization: true,
            institution: true,
          },
        },
        career: {
          include: {
            employmentStatus: true,
            occupation: true,
          },
        },
        partnerPreference: {
          include: {
            religions: { include: { religion: true } },
            communities: { include: { community: true } },
            subCommunities: { include: { subCommunity: true } },
            castes: { include: { caste: true } },
            gotras: { include: { gotra: true } },
            educations: { include: { education: true } },
            occupations: { include: { occupation: true } },
            manglik: true,
            maritalStatuses: true,
          },
        },
        photos: {
          orderBy: [{ photoType: "asc" }, { createdAt: "desc" }],
        },
        languages: {
          include: {
            language: true,
          },
        },
      },
    });

    if (!profile) {
      return null;
    }

    const mappedPhotos = profile.photos.map((ph) => ({
      id: ph.id,
      photoType: ph.photoType,
      isPrimary: ph.photoType === "PRIMARY",
      moderationStatus: ph.moderationStatus,
      moderationReason: ph.moderationReason,
      moderatedAt: ph.moderatedAt,
      moderatedByUserId: ph.moderatedByUserId,
      sortOrder: ph.sortOrder,
      url: resolvePhotoPublicUrl(ph.storageKey, ph.id, ph.storageProvider),
      originalFileName: ph.originalFileName,
      fileSize: ph.fileSize,
      width: ph.width,
      height: ph.height,
      createdAt: ph.createdAt,
    }));

    return {
      id: profile.id,
      userId: profile.userId,
      profileCreatedFor: profile.profileCreatedFor,
      profileStatus: profile.profileStatus,
      completionPercentage: profile.completionPercentage,
      submittedAt: profile.submittedAt,
      reviewedAt: profile.reviewedAt,
      rejectionReason: profile.rejectionReason,
      lastEditedAt: profile.lastEditedAt,
      lastEditedByUserId: profile.lastEditedByUserId,
      lastEditedByUser: profile.lastEditedByUser,
      createdAt: profile.createdAt,
      updatedAt: profile.updatedAt,
      user: profile.user,
      personalDetails: profile.personalDetails,
      religion: profile.religion,
      education: profile.education,
      career: profile.career,
      partnerPreference: profile.partnerPreference,
      photos: mappedPhotos,
      languages: profile.languages.map((l) => l.language),
    };
  }

  /**
   * Helper to recalculate profile completion percentage and touch audit fields in transaction.
   */
  private async recalculateAndAudit(
    tx: Prisma.TransactionClient,
    profileId: string
  ) {
    const complete = await tx.profile.findUnique({
      where: { id: profileId },
      include: {
        personalDetails: true,
        languages: true,
        religion: true,
        education: true,
        career: true,
        photos: true,
        partnerPreference: true,
      },
    });

    const completionPercentage = calculateProfileCompletion({
      profileCreatedFor: complete?.profileCreatedFor,
      personalDetails: complete?.personalDetails,
      languages: complete?.languages,
      religion: complete?.religion,
      education: complete?.education,
      career: complete?.career,
      photos: complete?.photos,
      partnerPreference: complete?.partnerPreference,
    });

    const updated = await tx.profile.update({
      where: { id: profileId },
      data: {
        completionPercentage,
      },
      include: {
        lastEditedByUser: {
          select: { id: true, email: true },
        },
      },
    });

    return {
      id: updated.id,
      profileCreatedFor: updated.profileCreatedFor,
      profileStatus: updated.profileStatus,
      completionPercentage: updated.completionPercentage,
      lastEditedAt: updated.lastEditedAt,
      lastEditedByUserId: updated.lastEditedByUserId,
      lastEditedByUser: updated.lastEditedByUser,
      updatedAt: updated.updatedAt,
    };
  }

  /**
   * SECTION A: Update Profile Created For
   * Atomic optimistic concurrency protected.
   */
  async updateProfileCreatedFor(
    profileId: string,
    adminUserId: string,
    dto: AdminUpdateProfileCreatedForDto
  ): Promise<AdminProfileMutationResult> {
    const existing = await prisma.profile.findUnique({
      where: { id: profileId },
      select: { id: true, updatedAt: true },
    });

    if (!existing) {
      return {
        success: false,
        status: 404,
        code: "PROFILE_NOT_FOUND",
        message: "Matrimonial profile not found.",
      };
    }

    return prisma.$transaction(async (tx) => {
      // 1. Atomic conditional update on Profile
      const updateResult = await tx.profile.updateMany({
        where: {
          id: profileId,
          updatedAt: new Date(dto.expectedUpdatedAt),
        },
        data: {
          profileCreatedFor: dto.profileCreatedFor,
          lastEditedAt: new Date(),
          lastEditedByUserId: adminUserId,
        },
      });

      if (updateResult.count === 0) {
        return {
          success: false,
          status: 409,
          code: "PROFILE_EDIT_CONFLICT",
          message:
            "This profile was modified by another administrator since you loaded it. Please reload the latest changes to avoid overwriting them.",
          currentUpdatedAt: existing.updatedAt.toISOString(),
        };
      }

      // 2. Recalculate completion using authoritative engine
      const profileSummary = await this.recalculateAndAudit(tx, profileId);

      return {
        success: true,
        status: 200,
        code: "PROFILE_CREATED_FOR_UPDATED",
        message: "Profile created for relationship updated successfully.",
        data: {
          profile: profileSummary,
        },
      };
    });
  }

  /**
   * SECTION B: Update Personal Details & Spoken Languages
   * Atomic optimistic concurrency protected. Upserts personal details and synchronizes languages.
   */
  async updatePersonalDetails(
    profileId: string,
    adminUserId: string,
    dto: AdminUpdatePersonalDetailsDto
  ): Promise<AdminProfileMutationResult> {
    const existing = await prisma.profile.findUnique({
      where: { id: profileId },
      select: { id: true, updatedAt: true },
    });

    if (!existing) {
      return {
        success: false,
        status: 404,
        code: "PROFILE_NOT_FOUND",
        message: "Matrimonial profile not found.",
      };
    }

    return prisma.$transaction(async (tx) => {
      // 1. Atomic conditional update on Profile for optimistic locking & audit
      const updateResult = await tx.profile.updateMany({
        where: {
          id: profileId,
          updatedAt: new Date(dto.expectedUpdatedAt),
        },
        data: {
          lastEditedAt: new Date(),
          lastEditedByUserId: adminUserId,
        },
      });

      if (updateResult.count === 0) {
        return {
          success: false,
          status: 409,
          code: "PROFILE_EDIT_CONFLICT",
          message:
            "This profile was modified by another administrator since you loaded it. Please reload the latest changes to avoid overwriting them.",
          currentUpdatedAt: existing.updatedAt.toISOString(),
        };
      }

      // 2. Validate motherTongueId against active master data
      const motherTongue = await tx.language.findUnique({
        where: { id: dto.motherTongueId.trim() },
      });

      if (!motherTongue || !motherTongue.isActive) {
        throw new Error("INVALID_MOTHER_TONGUE");
      }

      // 3. Deduplicate and validate languageIds
      const rawLanguageIds = dto.languageIds || [];
      const uniqueLanguageIds = Array.from(new Set(rawLanguageIds.map((id) => id.trim())));

      if (uniqueLanguageIds.length > 0) {
        const activeLanguages = await tx.language.findMany({
          where: {
            id: { in: uniqueLanguageIds },
            isActive: true,
          },
        });
        if (activeLanguages.length !== uniqueLanguageIds.length) {
          throw new Error("INVALID_LANGUAGE_ID");
        }
      }

      // 4. Upsert ProfilePersonalDetails (create branch contains ALL non-nullable required fields)
      const personalDetails = await tx.profilePersonalDetails.upsert({
        where: { profileId },
        update: {
          firstName: dto.firstName.trim(),
          lastName: dto.lastName.trim(),
          gender: dto.gender,
          dateOfBirth: new Date(dto.dateOfBirth),
          maritalStatus: dto.maritalStatus,
          heightCm: dto.heightCm,
          motherTongueId: dto.motherTongueId.trim(),
          city: dto.city ? dto.city.trim() : null,
          state: dto.state ? dto.state.trim() : null,
        },
        create: {
          profileId,
          firstName: dto.firstName.trim(),
          lastName: dto.lastName.trim(),
          gender: dto.gender,
          dateOfBirth: new Date(dto.dateOfBirth),
          maritalStatus: dto.maritalStatus,
          heightCm: dto.heightCm,
          motherTongueId: dto.motherTongueId.trim(),
          city: dto.city ? dto.city.trim() : null,
          state: dto.state ? dto.state.trim() : null,
        },
        include: {
          motherTongue: {
            select: { id: true, name: true, code: true },
          },
        },
      });

      // 5. Synchronize spoken languages
      await tx.profileLanguage.deleteMany({
        where: { profileId },
      });

      if (uniqueLanguageIds.length > 0) {
        await tx.profileLanguage.createMany({
          data: uniqueLanguageIds.map((langId) => ({
            profileId,
            languageId: langId,
          })),
        });
      }

      const updatedLanguages = await tx.profileLanguage.findMany({
        where: { profileId },
        include: {
          language: {
            select: { id: true, name: true, code: true },
          },
        },
      });

      // 6. Recalculate completion
      const profileSummary = await this.recalculateAndAudit(tx, profileId);

      return {
        success: true,
        status: 200,
        code: "PERSONAL_DETAILS_UPDATED",
        message: "Personal details and spoken languages updated successfully.",
        data: {
          personalDetails,
          languages: updatedLanguages.map((l) => l.language),
          profile: profileSummary,
        },
      };
    }).catch((err) => {
      if (err.message === "INVALID_MOTHER_TONGUE") {
        return {
          success: false,
          status: 400,
          code: "INVALID_MOTHER_TONGUE",
          message: "The selected mother tongue is invalid or inactive.",
        };
      }
      if (err.message === "INVALID_LANGUAGE_ID") {
        return {
          success: false,
          status: 400,
          code: "INVALID_LANGUAGE_ID",
          message: "One or more selected spoken languages are invalid or inactive.",
        };
      }
      throw err;
    });
  }

  /**
   * SECTION C: Update Religion, Community, Caste, Gotra, and Manglik
   * Atomic optimistic concurrency protected with strict cultural hierarchy validation.
   */
  async updateReligion(
    profileId: string,
    adminUserId: string,
    dto: AdminUpdateReligionDto
  ): Promise<AdminProfileMutationResult> {
    const existing = await prisma.profile.findUnique({
      where: { id: profileId },
      select: { id: true, updatedAt: true },
    });

    if (!existing) {
      return {
        success: false,
        status: 404,
        code: "PROFILE_NOT_FOUND",
        message: "Matrimonial profile not found.",
      };
    }

    const cleanDto: AdminUpdateReligionDto = {
      ...dto,
      religionId: dto.religionId.trim(),
      communityId: dto.communityId ? dto.communityId.trim() : null,
      subCommunityId: dto.subCommunityId ? dto.subCommunityId.trim() : null,
      casteId: dto.casteId ? dto.casteId.trim() : null,
      subCasteId: dto.subCasteId ? dto.subCasteId.trim() : null,
      gotraId: dto.gotraId ? dto.gotraId.trim() : null,
      customReligion: dto.customReligion ? dto.customReligion.trim() : null,
      customCommunity: dto.customCommunity ? dto.customCommunity.trim() : null,
      customCaste: dto.customCaste ? dto.customCaste.trim() : null,
      customSubCaste: dto.customSubCaste ? dto.customSubCaste.trim() : null,
    };

    return prisma.$transaction(async (tx) => {
      // 1. Atomic conditional update on Profile for optimistic locking & audit
      const updateResult = await tx.profile.updateMany({
        where: {
          id: profileId,
          updatedAt: new Date(dto.expectedUpdatedAt),
        },
        data: {
          lastEditedAt: new Date(),
          lastEditedByUserId: adminUserId,
        },
      });

      if (updateResult.count === 0) {
        return {
          success: false,
          status: 409,
          code: "PROFILE_EDIT_CONFLICT",
          message:
            "This profile was modified by another administrator since you loaded it. Please reload the latest changes to avoid overwriting them.",
          currentUpdatedAt: existing.updatedAt.toISOString(),
        };
      }

      // 2. Validate Religion
      const religion = await tx.religion.findUnique({
        where: { id: cleanDto.religionId },
      });
      if (!religion || !religion.isActive) {
        throw new Error("INVALID_RELIGION");
      }
      if (religion.slug === "other" && (!cleanDto.customReligion || cleanDto.customReligion.length === 0)) {
        throw new Error("INVALID_CUSTOM_RELIGION");
      }

      // 3. Validate Community (Optional)
      if (cleanDto.communityId) {
        const community = await tx.community.findUnique({
          where: { id: cleanDto.communityId },
        });
        if (!community || !community.isActive) {
          throw new Error("INVALID_COMMUNITY");
        }
        if (community.slug === "other" && (!cleanDto.customCommunity || cleanDto.customCommunity.length === 0)) {
          throw new Error("INVALID_CUSTOM_COMMUNITY");
        }
        if (community.religionId !== null && community.religionId !== cleanDto.religionId) {
          throw new Error("COMMUNITY_RELIGION_MISMATCH");
        }
      }

      // 4. Validate Sub-Community (Optional)
      if (cleanDto.subCommunityId) {
        if (!cleanDto.communityId) {
          throw new Error("SUB_COMMUNITY_COMMUNITY_MISMATCH");
        }
        const subCommunity = await tx.subCommunity.findUnique({
          where: { id: cleanDto.subCommunityId },
        });
        if (!subCommunity || !subCommunity.isActive) {
          throw new Error("INVALID_SUB_COMMUNITY");
        }
        if (subCommunity.communityId !== cleanDto.communityId) {
          throw new Error("SUB_COMMUNITY_COMMUNITY_MISMATCH");
        }
      }

      // 5. Validate Caste (Optional)
      if (cleanDto.casteId) {
        if (!cleanDto.communityId) {
          throw new Error("CASTE_COMMUNITY_MISMATCH");
        }
        const caste = await tx.caste.findUnique({
          where: { id: cleanDto.casteId },
        });
        if (!caste || !caste.isActive) {
          throw new Error("INVALID_CASTE");
        }
        if (caste.slug === "other" && (!cleanDto.customCaste || cleanDto.customCaste.length === 0)) {
          throw new Error("INVALID_CUSTOM_CASTE");
        }
        if (caste.communityId !== null && caste.communityId !== cleanDto.communityId) {
          throw new Error("CASTE_COMMUNITY_MISMATCH");
        }
      }

      // 6. Validate Sub-Caste (Optional)
      if (cleanDto.subCasteId) {
        if (!cleanDto.casteId) {
          throw new Error("SUB_CASTE_CASTE_MISMATCH");
        }
        const subCaste = await tx.subCaste.findUnique({
          where: { id: cleanDto.subCasteId },
        });
        if (!subCaste || !subCaste.isActive) {
          throw new Error("INVALID_SUB_CASTE");
        }
        if (subCaste.slug === "other" && (!cleanDto.customSubCaste || cleanDto.customSubCaste.length === 0)) {
          throw new Error("INVALID_CUSTOM_SUB_CASTE");
        }
        if (subCaste.casteId !== cleanDto.casteId) {
          throw new Error("SUB_CASTE_CASTE_MISMATCH");
        }
      }

      // 7. Validate Gotra (Optional, Hindu only)
      if (cleanDto.gotraId) {
        if (religion.slug !== "hindu") {
          throw new Error("GOTRA_RELIGION_MISMATCH");
        }
        if (!cleanDto.communityId) {
          throw new Error("GOTRA_COMMUNITY_MISMATCH");
        }
        const gotra = await tx.gotra.findUnique({
          where: { id: cleanDto.gotraId },
        });
        if (!gotra || !gotra.isActive) {
          throw new Error("INVALID_GOTRA");
        }
        if (gotra.communityId !== null && gotra.communityId !== cleanDto.communityId) {
          throw new Error("GOTRA_COMMUNITY_MISMATCH");
        }
      }

      // 8. Upsert ProfileReligion
      const manglikVal = cleanDto.manglik ?? ManglikStatus.DONT_KNOW;
      const savedReligion = await tx.profileReligion.upsert({
        where: { profileId },
        update: {
          religionId: cleanDto.religionId,
          communityId: cleanDto.communityId,
          subCommunityId: cleanDto.subCommunityId,
          casteId: cleanDto.casteId,
          subCasteId: cleanDto.subCasteId,
          gotraId: cleanDto.gotraId,
          manglik: manglikVal,
          customReligion: cleanDto.customReligion,
          customCommunity: cleanDto.customCommunity,
          customCaste: cleanDto.customCaste,
          customSubCaste: cleanDto.customSubCaste,
        },
        create: {
          profileId,
          religionId: cleanDto.religionId,
          communityId: cleanDto.communityId,
          subCommunityId: cleanDto.subCommunityId,
          casteId: cleanDto.casteId,
          subCasteId: cleanDto.subCasteId,
          gotraId: cleanDto.gotraId,
          manglik: manglikVal,
          customReligion: cleanDto.customReligion,
          customCommunity: cleanDto.customCommunity,
          customCaste: cleanDto.customCaste,
          customSubCaste: cleanDto.customSubCaste,
        },
        include: {
          religion: { select: { id: true, name: true, slug: true } },
          community: { select: { id: true, name: true, slug: true } },
          subCommunity: { select: { id: true, name: true, slug: true } },
          caste: { select: { id: true, name: true, slug: true } },
          subCaste: { select: { id: true, name: true, slug: true } },
          gotra: { select: { id: true, name: true, slug: true } },
        },
      });

      // 9. Recalculate completion
      const profileSummary = await this.recalculateAndAudit(tx, profileId);

      return {
        success: true,
        status: 200,
        code: "RELIGION_DETAILS_UPDATED",
        message: "Religion and community details updated successfully.",
        data: {
          religion: savedReligion,
          profile: profileSummary,
        },
      };
    }).catch((err) => {
      const errorMap: Record<string, { code: string; message: string }> = {
        INVALID_RELIGION: { code: "INVALID_RELIGION", message: "Selected religion is invalid or inactive." },
        INVALID_CUSTOM_RELIGION: { code: "INVALID_CUSTOM_RELIGION", message: "Please specify your religion." },
        INVALID_COMMUNITY: { code: "INVALID_COMMUNITY", message: "Selected community is invalid or inactive." },
        INVALID_CUSTOM_COMMUNITY: { code: "INVALID_CUSTOM_COMMUNITY", message: "Please specify your community." },
        COMMUNITY_RELIGION_MISMATCH: { code: "COMMUNITY_RELIGION_MISMATCH", message: "Selected community does not belong to the chosen religion." },
        INVALID_SUB_COMMUNITY: { code: "INVALID_SUB_COMMUNITY", message: "Selected sub-community is invalid or inactive." },
        SUB_COMMUNITY_COMMUNITY_MISMATCH: { code: "SUB_COMMUNITY_COMMUNITY_MISMATCH", message: "Selected sub-community does not belong to the chosen community." },
        INVALID_CASTE: { code: "INVALID_CASTE", message: "Selected caste is invalid or inactive." },
        INVALID_CUSTOM_CASTE: { code: "INVALID_CUSTOM_CASTE", message: "Please specify your caste." },
        CASTE_COMMUNITY_MISMATCH: { code: "CASTE_COMMUNITY_MISMATCH", message: "Selected caste does not belong to the chosen community." },
        INVALID_SUB_CASTE: { code: "INVALID_SUB_CASTE", message: "Selected sub-caste is invalid or inactive." },
        INVALID_CUSTOM_SUB_CASTE: { code: "INVALID_CUSTOM_SUB_CASTE", message: "Please specify your sub-caste." },
        SUB_CASTE_CASTE_MISMATCH: { code: "SUB_CASTE_CASTE_MISMATCH", message: "Selected sub-caste does not belong to the chosen caste." },
        INVALID_GOTRA: { code: "INVALID_GOTRA", message: "Selected gotra is invalid or inactive." },
        GOTRA_COMMUNITY_MISMATCH: { code: "GOTRA_COMMUNITY_MISMATCH", message: "Selected gotra does not belong to the chosen community." },
        GOTRA_RELIGION_MISMATCH: { code: "GOTRA_RELIGION_MISMATCH", message: "Gotra is only applicable for Hindu religion." },
      };

      if (errorMap[err.message]) {
        return {
          success: false,
          status: 400,
          code: errorMap[err.message].code,
          message: errorMap[err.message].message,
        };
      }
      throw err;
    });
  }

  /**
   * SECTION D: Update Education & Career
   * Atomic optimistic concurrency protected. Upserts both education and career in single transaction.
   */
  async updateEducationCareer(
    profileId: string,
    adminUserId: string,
    dto: AdminUpdateEducationCareerDto
  ): Promise<AdminProfileMutationResult> {
    const existing = await prisma.profile.findUnique({
      where: { id: profileId },
      select: { id: true, updatedAt: true },
    });

    if (!existing) {
      return {
        success: false,
        status: 404,
        code: "PROFILE_NOT_FOUND",
        message: "Matrimonial profile not found.",
      };
    }

    return prisma.$transaction(async (tx) => {
      // 1. Atomic conditional update on Profile
      const updateResult = await tx.profile.updateMany({
        where: {
          id: profileId,
          updatedAt: new Date(dto.expectedUpdatedAt),
        },
        data: {
          lastEditedAt: new Date(),
          lastEditedByUserId: adminUserId,
        },
      });

      if (updateResult.count === 0) {
        return {
          success: false,
          status: 409,
          code: "PROFILE_EDIT_CONFLICT",
          message:
            "This profile was modified by another administrator since you loaded it. Please reload the latest changes to avoid overwriting them.",
          currentUpdatedAt: existing.updatedAt.toISOString(),
        };
      }

      // 2. Validate Education (Required)
      const education = await tx.education.findUnique({
        where: { id: dto.education.educationId.trim() },
      });
      if (!education || !education.isActive) {
        throw new Error("INVALID_EDUCATION");
      }

      // 3. Validate Specialization (Optional)
      if (dto.education.specializationId) {
        const spec = await tx.specialization.findUnique({
          where: { id: dto.education.specializationId.trim() },
        });
        if (!spec || !spec.isActive) {
          throw new Error("INVALID_SPECIALIZATION");
        }
        if (spec.educationId !== dto.education.educationId.trim()) {
          throw new Error("SPECIALIZATION_EDUCATION_MISMATCH");
        }
      }

      // 4. Validate Institution (Optional)
      if (dto.education.institutionId) {
        const inst = await tx.institution.findUnique({
          where: { id: dto.education.institutionId.trim() },
        });
        if (!inst || !inst.isActive) {
          throw new Error("INVALID_INSTITUTION");
        }
      }

      // 5. Validate Employment Status (Required)
      const employmentStatus = await tx.employmentStatus.findUnique({
        where: { id: dto.career.employmentStatusId.trim() },
      });
      if (!employmentStatus || !employmentStatus.isActive) {
        throw new Error("INVALID_EMPLOYMENT_STATUS");
      }

      // 6. Validate Occupation (Optional)
      if (dto.career.occupationId) {
        const occ = await tx.occupation.findUnique({
          where: { id: dto.career.occupationId.trim() },
        });
        if (!occ || !occ.isActive) {
          throw new Error("INVALID_OCCUPATION");
        }
        if (
          occ.employmentStatusId !== null &&
          occ.employmentStatusId !== dto.career.employmentStatusId.trim()
        ) {
          throw new Error("OCCUPATION_EMPLOYMENT_STATUS_MISMATCH");
        }
      }

      // 7. Upsert ProfileEducation
      const savedEducation = await tx.profileEducation.upsert({
        where: { profileId },
        update: {
          educationId: dto.education.educationId.trim(),
          specializationId: dto.education.specializationId ? dto.education.specializationId.trim() : null,
          institutionId: dto.education.institutionId ? dto.education.institutionId.trim() : null,
          institutionName: dto.education.institutionName ? dto.education.institutionName.trim() : null,
        },
        create: {
          profileId,
          educationId: dto.education.educationId.trim(),
          specializationId: dto.education.specializationId ? dto.education.specializationId.trim() : null,
          institutionId: dto.education.institutionId ? dto.education.institutionId.trim() : null,
          institutionName: dto.education.institutionName ? dto.education.institutionName.trim() : null,
        },
        include: {
          education: { select: { id: true, name: true, slug: true } },
          specialization: { select: { id: true, name: true, slug: true } },
          institution: { select: { id: true, name: true, normalizedName: true, type: true } },
        },
      });

      // 8. Upsert ProfileCareer
      const savedCareer = await tx.profileCareer.upsert({
        where: { profileId },
        update: {
          employmentStatusId: dto.career.employmentStatusId.trim(),
          occupationId: dto.career.occupationId ? dto.career.occupationId.trim() : null,
          companyName: dto.career.companyName ? dto.career.companyName.trim() : null,
          employmentType: dto.career.employmentType ?? null,
          annualIncomeRange: dto.career.annualIncomeRange ?? null,
        },
        create: {
          profileId,
          employmentStatusId: dto.career.employmentStatusId.trim(),
          occupationId: dto.career.occupationId ? dto.career.occupationId.trim() : null,
          companyName: dto.career.companyName ? dto.career.companyName.trim() : null,
          employmentType: dto.career.employmentType ?? null,
          annualIncomeRange: dto.career.annualIncomeRange ?? null,
        },
        include: {
          employmentStatus: { select: { id: true, name: true, slug: true } },
          occupation: { select: { id: true, name: true, slug: true } },
        },
      });

      // 9. Recalculate completion
      const profileSummary = await this.recalculateAndAudit(tx, profileId);

      return {
        success: true,
        status: 200,
        code: "EDUCATION_CAREER_UPDATED",
        message: "Education and career details updated successfully.",
        data: {
          education: savedEducation,
          career: savedCareer,
          profile: profileSummary,
        },
      };
    }).catch((err) => {
      const errorMap: Record<string, { code: string; message: string }> = {
        INVALID_EDUCATION: { code: "INVALID_EDUCATION", message: "Selected education level is invalid or inactive." },
        INVALID_SPECIALIZATION: { code: "INVALID_SPECIALIZATION", message: "Selected specialization is invalid or inactive." },
        SPECIALIZATION_EDUCATION_MISMATCH: { code: "SPECIALIZATION_EDUCATION_MISMATCH", message: "Selected specialization does not belong to the chosen education level." },
        INVALID_INSTITUTION: { code: "INVALID_INSTITUTION", message: "Selected institution is invalid or inactive." },
        INVALID_EMPLOYMENT_STATUS: { code: "INVALID_EMPLOYMENT_STATUS", message: "Selected employment status is invalid or inactive." },
        INVALID_OCCUPATION: { code: "INVALID_OCCUPATION", message: "Selected occupation is invalid or inactive." },
        OCCUPATION_EMPLOYMENT_STATUS_MISMATCH: { code: "OCCUPATION_EMPLOYMENT_STATUS_MISMATCH", message: "Selected occupation does not belong to the chosen employment status." },
      };

      if (errorMap[err.message]) {
        return {
          success: false,
          status: 400,
          code: errorMap[err.message].code,
          message: errorMap[err.message].message,
        };
      }
      throw err;
    });
  }

  /**
   * SECTION E: Update Partner Preferences
   * Atomic optimistic concurrency protected. Synchronizes scalar ranges and all 9 junction tables.
   */
  async updatePartnerPreferences(
    profileId: string,
    adminUserId: string,
    dto: AdminUpdatePartnerPreferencesDto
  ): Promise<AdminProfileMutationResult> {
    const existing = await prisma.profile.findUnique({
      where: { id: profileId },
      select: { id: true, updatedAt: true },
    });

    if (!existing) {
      return {
        success: false,
        status: 404,
        code: "PROFILE_NOT_FOUND",
        message: "Matrimonial profile not found.",
      };
    }

    // 1. Deduplicate multi-select arrays
    const religionIds = Array.from(new Set((dto.religionIds || []).map((id) => id.trim())));
    const communityIds = Array.from(new Set((dto.communityIds || []).map((id) => id.trim())));
    const subCommunityIds = Array.from(new Set((dto.subCommunityIds || []).map((id) => id.trim())));
    const casteIds = Array.from(new Set((dto.casteIds || []).map((id) => id.trim())));
    const gotraIds = Array.from(new Set((dto.gotraIds || []).map((id) => id.trim())));
    const educationIds = Array.from(new Set((dto.educationIds || []).map((id) => id.trim())));
    const occupationIds = Array.from(new Set((dto.occupationIds || []).map((id) => id.trim())));
    const manglikStatuses = Array.from(new Set(dto.manglikStatuses || []));
    const maritalStatuses = Array.from(new Set(dto.maritalStatuses || []));

    return prisma.$transaction(async (tx) => {
      // 2. Atomic conditional update on Profile
      const updateResult = await tx.profile.updateMany({
        where: {
          id: profileId,
          updatedAt: new Date(dto.expectedUpdatedAt),
        },
        data: {
          lastEditedAt: new Date(),
          lastEditedByUserId: adminUserId,
        },
      });

      if (updateResult.count === 0) {
        return {
          success: false,
          status: 409,
          code: "PROFILE_EDIT_CONFLICT",
          message:
            "This profile was modified by another administrator since you loaded it. Please reload the latest changes to avoid overwriting them.",
          currentUpdatedAt: existing.updatedAt.toISOString(),
        };
      }

      // 3. Validate Religions
      if (religionIds.length > 0) {
        const activeReligions = await tx.religion.findMany({
          where: { id: { in: religionIds }, isActive: true },
        });
        if (activeReligions.length !== religionIds.length) {
          throw new Error("INVALID_PARTNER_RELIGION");
        }
      }

      // 4. Validate Communities
      if (communityIds.length > 0) {
        const activeCommunities = await tx.community.findMany({
          where: { id: { in: communityIds }, isActive: true },
        });
        if (activeCommunities.length !== communityIds.length) {
          throw new Error("INVALID_PARTNER_COMMUNITY");
        }

        if (religionIds.length > 0) {
          for (const com of activeCommunities) {
            if (com.religionId !== null && !religionIds.includes(com.religionId)) {
              throw new Error("PARTNER_COMMUNITY_RELIGION_MISMATCH");
            }
          }
        }
      }

      // 5. Validate Sub-Communities
      if (subCommunityIds.length > 0) {
        if (communityIds.length === 0) {
          throw new Error("PARTNER_SUB_COMMUNITY_PARENT_MISMATCH");
        }
        const activeSubCommunities = await tx.subCommunity.findMany({
          where: { id: { in: subCommunityIds }, isActive: true },
        });
        if (activeSubCommunities.length !== subCommunityIds.length) {
          throw new Error("INVALID_PARTNER_SUB_COMMUNITY");
        }
        for (const sc of activeSubCommunities) {
          if (!communityIds.includes(sc.communityId)) {
            throw new Error("PARTNER_SUB_COMMUNITY_PARENT_MISMATCH");
          }
        }
      }

      // 6. Validate Castes
      if (casteIds.length > 0) {
        if (communityIds.length === 0) {
          throw new Error("PARTNER_CASTE_COMMUNITY_MISMATCH");
        }
        const activeCastes = await tx.caste.findMany({
          where: { id: { in: casteIds }, isActive: true },
        });
        if (activeCastes.length !== casteIds.length) {
          throw new Error("INVALID_PARTNER_CASTE");
        }
        for (const ca of activeCastes) {
          if (ca.communityId !== null && !communityIds.includes(ca.communityId)) {
            throw new Error("PARTNER_CASTE_COMMUNITY_MISMATCH");
          }
        }
      }

      // 7. Validate Gotras
      if (gotraIds.length > 0) {
        if (communityIds.length === 0) {
          throw new Error("PARTNER_GOTRA_COMMUNITY_MISMATCH");
        }
        const activeGotras = await tx.gotra.findMany({
          where: { id: { in: gotraIds }, isActive: true },
        });
        if (activeGotras.length !== gotraIds.length) {
          throw new Error("INVALID_PARTNER_GOTRA");
        }
        for (const g of activeGotras) {
          if (g.communityId !== null && !communityIds.includes(g.communityId)) {
            throw new Error("PARTNER_GOTRA_COMMUNITY_MISMATCH");
          }
        }
      }

      // 8. Validate Educations
      if (educationIds.length > 0) {
        const activeEducations = await tx.education.findMany({
          where: { id: { in: educationIds }, isActive: true },
        });
        if (activeEducations.length !== educationIds.length) {
          throw new Error("INVALID_PARTNER_EDUCATION");
        }
      }

      // 9. Validate Occupations
      if (occupationIds.length > 0) {
        const activeOccupations = await tx.occupation.findMany({
          where: { id: { in: occupationIds }, isActive: true },
        });
        if (activeOccupations.length !== occupationIds.length) {
          throw new Error("INVALID_PARTNER_OCCUPATION");
        }
      }

      // 10. Upsert PartnerPreference base record
      const prefRecord = await tx.partnerPreference.upsert({
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

      const partnerPreferenceId = prefRecord.id;

      // 11. Transactionally synchronize all junction tables
      await Promise.all([
        tx.partnerPreferenceReligion.deleteMany({ where: { partnerPreferenceId } }),
        tx.partnerPreferenceCommunity.deleteMany({ where: { partnerPreferenceId } }),
        tx.partnerPreferenceSubCommunity.deleteMany({ where: { partnerPreferenceId } }),
        tx.partnerPreferenceCaste.deleteMany({ where: { partnerPreferenceId } }),
        tx.partnerPreferenceGotra.deleteMany({ where: { partnerPreferenceId } }),
        tx.partnerPreferenceEducation.deleteMany({ where: { partnerPreferenceId } }),
        tx.partnerPreferenceOccupation.deleteMany({ where: { partnerPreferenceId } }),
        tx.partnerPreferenceManglik.deleteMany({ where: { partnerPreferenceId } }),
        tx.partnerPreferenceMaritalStatus.deleteMany({ where: { partnerPreferenceId } }),
      ]);

      if (religionIds.length > 0) {
        await tx.partnerPreferenceReligion.createMany({
          data: religionIds.map((religionId) => ({ partnerPreferenceId, religionId })),
        });
      }
      if (communityIds.length > 0) {
        await tx.partnerPreferenceCommunity.createMany({
          data: communityIds.map((communityId) => ({ partnerPreferenceId, communityId })),
        });
      }
      if (subCommunityIds.length > 0) {
        await tx.partnerPreferenceSubCommunity.createMany({
          data: subCommunityIds.map((subCommunityId) => ({ partnerPreferenceId, subCommunityId })),
        });
      }
      if (casteIds.length > 0) {
        await tx.partnerPreferenceCaste.createMany({
          data: casteIds.map((casteId) => ({ partnerPreferenceId, casteId })),
        });
      }
      if (gotraIds.length > 0) {
        await tx.partnerPreferenceGotra.createMany({
          data: gotraIds.map((gotraId) => ({ partnerPreferenceId, gotraId })),
        });
      }
      if (educationIds.length > 0) {
        await tx.partnerPreferenceEducation.createMany({
          data: educationIds.map((educationId) => ({ partnerPreferenceId, educationId })),
        });
      }
      if (occupationIds.length > 0) {
        await tx.partnerPreferenceOccupation.createMany({
          data: occupationIds.map((occupationId) => ({ partnerPreferenceId, occupationId })),
        });
      }
      if (manglikStatuses.length > 0) {
        await tx.partnerPreferenceManglik.createMany({
          data: manglikStatuses.map((manglik) => ({ partnerPreferenceId, manglik })),
        });
      }
      if (maritalStatuses.length > 0) {
        await tx.partnerPreferenceMaritalStatus.createMany({
          data: maritalStatuses.map((maritalStatus) => ({ partnerPreferenceId, maritalStatus })),
        });
      }

      // 12. Query complete updated preference record
      const updatedPreference = await tx.partnerPreference.findUnique({
        where: { id: partnerPreferenceId },
        include: {
          religions: { include: { religion: { select: { id: true, name: true, slug: true } } } },
          communities: { include: { community: { select: { id: true, name: true, slug: true } } } },
          subCommunities: { include: { subCommunity: { select: { id: true, name: true, slug: true } } } },
          castes: { include: { caste: { select: { id: true, name: true, slug: true } } } },
          gotras: { include: { gotra: { select: { id: true, name: true, slug: true } } } },
          educations: { include: { education: { select: { id: true, name: true, slug: true } } } },
          occupations: { include: { occupation: { select: { id: true, name: true, slug: true } } } },
          manglik: true,
          maritalStatuses: true,
        },
      });

      // 13. Recalculate completion
      const profileSummary = await this.recalculateAndAudit(tx, profileId);

      return {
        success: true,
        status: 200,
        code: "PARTNER_PREFERENCES_UPDATED",
        message: "Partner preferences updated successfully.",
        data: {
          partnerPreferences: updatedPreference,
          profile: profileSummary,
        },
      };
    }).catch((err) => {
      const errorMap: Record<string, { code: string; message: string }> = {
        INVALID_PARTNER_RELIGION: { code: "INVALID_PARTNER_RELIGION", message: "One or more selected partner religions are invalid or inactive." },
        INVALID_PARTNER_COMMUNITY: { code: "INVALID_PARTNER_COMMUNITY", message: "One or more selected partner communities are invalid or inactive." },
        PARTNER_COMMUNITY_RELIGION_MISMATCH: { code: "PARTNER_COMMUNITY_RELIGION_MISMATCH", message: "One or more selected communities do not belong to the selected religions." },
        PARTNER_SUB_COMMUNITY_PARENT_MISMATCH: { code: "PARTNER_SUB_COMMUNITY_PARENT_MISMATCH", message: "Selected sub-communities do not belong to any selected communities." },
        INVALID_PARTNER_SUB_COMMUNITY: { code: "INVALID_PARTNER_SUB_COMMUNITY", message: "One or more selected partner sub-communities are invalid or inactive." },
        PARTNER_CASTE_COMMUNITY_MISMATCH: { code: "PARTNER_CASTE_COMMUNITY_MISMATCH", message: "Selected castes do not belong to any selected communities." },
        INVALID_PARTNER_CASTE: { code: "INVALID_PARTNER_CASTE", message: "One or more selected partner castes are invalid or inactive." },
        PARTNER_GOTRA_COMMUNITY_MISMATCH: { code: "PARTNER_GOTRA_COMMUNITY_MISMATCH", message: "Selected gotras do not belong to any selected communities." },
        INVALID_PARTNER_GOTRA: { code: "INVALID_PARTNER_GOTRA", message: "One or more selected partner gotras are invalid or inactive." },
        INVALID_PARTNER_EDUCATION: { code: "INVALID_PARTNER_EDUCATION", message: "One or more selected partner education levels are invalid or inactive." },
        INVALID_PARTNER_OCCUPATION: { code: "INVALID_PARTNER_OCCUPATION", message: "One or more selected partner occupations are invalid or inactive." },
      };

      if (errorMap[err.message]) {
        return {
          success: false,
          status: 400,
          code: errorMap[err.message].code,
          message: errorMap[err.message].message,
        };
      }
      throw err;
    });
  }
}

export const adminProfilesService = new AdminProfilesService();
