import {
  ManglikStatus,
  MaritalStatus,
  ProfileStatus,
} from "@prisma/client";
import {
  partnerPreferenceRepository,
  PartnerPreferenceRepository,
} from "../repositories/partner-preference.repository";
import { profileRepository, ProfileRepository } from "../repositories/profile.repository";
import {
  SavePartnerPreferencesDto,
  PartnerPreferencesResponseDto,
  MasterDataItemDto,
} from "../types/partner-preference";
import { ApiResponse } from "../types/auth";
import { calculateProfileCompletion } from "./profile.completion";

export class PartnerPreferenceService {
  constructor(
    private preferences: PartnerPreferenceRepository = partnerPreferenceRepository,
    private profiles: ProfileRepository = profileRepository
  ) {}

  private mapToResponseDto(record: any): PartnerPreferencesResponseDto {
    return {
      id: record.id,
      profileId: record.profileId,
      minAge: record.minAge,
      maxAge: record.maxAge,
      minHeightCm: record.minHeightCm,
      maxHeightCm: record.maxHeightCm,
      religions: (record.religions || []).map((r: any): MasterDataItemDto => ({
        id: r.religion.id,
        name: r.religion.name,
        slug: r.religion.slug,
      })),
      communities: (record.communities || []).map((c: any): MasterDataItemDto => ({
        id: c.community.id,
        name: c.community.name,
        slug: c.community.slug,
      })),
      subCommunities: (record.subCommunities || []).map((sc: any): MasterDataItemDto => ({
        id: sc.subCommunity.id,
        name: sc.subCommunity.name,
        slug: sc.subCommunity.slug,
      })),
      castes: (record.castes || []).map((ca: any): MasterDataItemDto => ({
        id: ca.caste.id,
        name: ca.caste.name,
        slug: ca.caste.slug,
      })),
      gotras: (record.gotras || []).map((g: any): MasterDataItemDto => ({
        id: g.gotra.id,
        name: g.gotra.name,
        slug: g.gotra.slug,
      })),
      educations: (record.educations || []).map((e: any): MasterDataItemDto => ({
        id: e.education.id,
        name: e.education.name,
        slug: e.education.slug,
      })),
      occupations: (record.occupations || []).map((o: any): MasterDataItemDto => ({
        id: o.occupation.id,
        name: o.occupation.name,
        slug: o.occupation.slug,
      })),
      manglikStatuses: (record.manglik || []).map((m: any) => m.manglik as ManglikStatus),
      maritalStatuses: (record.maritalStatuses || []).map((ms: any) => ms.maritalStatus as MaritalStatus),
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }

  /**
   * Retrieves partner preferences for the authenticated user.
   */
  async getPartnerPreferences(
    userId: string
  ): Promise<ApiResponse<PartnerPreferencesResponseDto | null>> {
    const profile = await this.profiles.findByUserId(userId);
    if (!profile) {
      return {
        success: false,
        code: "PROFILE_NOT_FOUND",
        message: "No profile found for this user account. Please initialize your profile first.",
      };
    }

    const prefRecord = await this.preferences.findByProfileId(profile.id);
    if (!prefRecord) {
      return {
        success: true,
        message: "Partner preferences not configured.",
        data: null,
      };
    }

    return {
      success: true,
      message: "Partner preferences retrieved successfully.",
      data: this.mapToResponseDto(prefRecord),
    };
  }

  /**
   * Saves or replaces partner preferences atomically with full hierarchical validation.
   */
  async savePartnerPreferences(
    userId: string,
    dto: SavePartnerPreferencesDto
  ): Promise<
    ApiResponse<{
      partnerPreferences: PartnerPreferencesResponseDto;
      profile: { completionPercentage: number; profileStatus: ProfileStatus };
    }>
  > {
    // 1. Validate Scalar Age Range
    if (dto.minAge !== undefined && dto.minAge !== null && dto.maxAge !== undefined && dto.maxAge !== null) {
      if (dto.minAge > dto.maxAge) {
        return {
          success: false,
          code: "INVALID_AGE_RANGE",
          message: "Minimum age cannot be greater than maximum age.",
        };
      }
    }

    // 2. Validate Scalar Height Range
    if (
      dto.minHeightCm !== undefined &&
      dto.minHeightCm !== null &&
      dto.maxHeightCm !== undefined &&
      dto.maxHeightCm !== null
    ) {
      if (dto.minHeightCm > dto.maxHeightCm) {
        return {
          success: false,
          code: "INVALID_HEIGHT_RANGE",
          message: "Minimum height cannot be greater than maximum height.",
        };
      }
    }

    // 3. Deduplicate Multi-select Arrays
    const religionIds = Array.from(new Set((dto.religionIds || []).map((id) => id.trim())));
    const communityIds = Array.from(new Set((dto.communityIds || []).map((id) => id.trim())));
    const subCommunityIds = Array.from(new Set((dto.subCommunityIds || []).map((id) => id.trim())));
    const casteIds = Array.from(new Set((dto.casteIds || []).map((id) => id.trim())));
    const gotraIds = Array.from(new Set((dto.gotraIds || []).map((id) => id.trim())));
    const educationIds = Array.from(new Set((dto.educationIds || []).map((id) => id.trim())));
    const occupationIds = Array.from(new Set((dto.occupationIds || []).map((id) => id.trim())));
    const manglikStatuses = Array.from(new Set(dto.manglikStatuses || []));
    const maritalStatuses = Array.from(new Set(dto.maritalStatuses || []));

    // 4. Validate Religions
    if (religionIds.length > 0) {
      const activeReligions = await this.preferences.findActiveReligionsByIds(religionIds);
      if (activeReligions.length !== religionIds.length) {
        return {
          success: false,
          code: "INVALID_PARTNER_RELIGION",
          message: "One or more selected partner religions are invalid or inactive.",
        };
      }
    }

    // 5. Validate Communities
    if (communityIds.length > 0) {
      const activeCommunities = await this.preferences.findActiveCommunitiesByIds(communityIds);
      if (activeCommunities.length !== communityIds.length) {
        return {
          success: false,
          code: "INVALID_PARTNER_COMMUNITY",
          message: "One or more selected partner communities are invalid or inactive.",
        };
      }

      // Check community-religion compatibility if religionIds are specified
      if (religionIds.length > 0) {
        for (const com of activeCommunities) {
          if (com.religionId !== null && !religionIds.includes(com.religionId)) {
            return {
              success: false,
              code: "PARTNER_COMMUNITY_RELIGION_MISMATCH",
              message: `Community '${com.name}' does not belong to any of the selected partner religions.`,
            };
          }
        }
      }
    }

    // 6. Validate Sub-Communities (Hierarchy: Community -> SubCommunity)
    if (subCommunityIds.length > 0) {
      if (communityIds.length === 0) {
        return {
          success: false,
          code: "PARTNER_SUB_COMMUNITY_PARENT_MISMATCH",
          message: "You must select parent communities before specifying sub-community preferences.",
        };
      }

      const activeSubCommunities = await this.preferences.findActiveSubCommunitiesByIds(subCommunityIds);
      if (activeSubCommunities.length !== subCommunityIds.length) {
        return {
          success: false,
          code: "INVALID_PARTNER_SUB_COMMUNITY",
          message: "One or more selected partner sub-communities are invalid or inactive.",
        };
      }

      for (const sc of activeSubCommunities) {
        if (!communityIds.includes(sc.communityId)) {
          return {
            success: false,
            code: "PARTNER_SUB_COMMUNITY_PARENT_MISMATCH",
            message: `Sub-community '${sc.name}' does not belong to any of the selected partner communities.`,
          };
        }
      }
    }

    // 7. Validate Castes (Hierarchy: Community -> Caste)
    if (casteIds.length > 0) {
      if (communityIds.length === 0) {
        return {
          success: false,
          code: "PARTNER_CASTE_COMMUNITY_MISMATCH",
          message: "You must select parent communities before specifying caste preferences.",
        };
      }

      const activeCastes = await this.preferences.findActiveCastesByIds(casteIds);
      if (activeCastes.length !== casteIds.length) {
        return {
          success: false,
          code: "INVALID_PARTNER_CASTE",
          message: "One or more selected partner castes are invalid or inactive.",
        };
      }

      for (const ca of activeCastes) {
        if (ca.communityId !== null && !communityIds.includes(ca.communityId)) {
          return {
            success: false,
            code: "PARTNER_CASTE_COMMUNITY_MISMATCH",
            message: `Caste '${ca.name}' does not belong to any of the selected partner communities.`,
          };
        }
      }
    }

    // 8. Validate Gotras (Hierarchy: Community -> Gotra)
    if (gotraIds.length > 0) {
      if (communityIds.length === 0) {
        return {
          success: false,
          code: "PARTNER_GOTRA_COMMUNITY_MISMATCH",
          message: "You must select parent communities before specifying gotra preferences.",
        };
      }

      const activeGotras = await this.preferences.findActiveGotrasByIds(gotraIds);
      if (activeGotras.length !== gotraIds.length) {
        return {
          success: false,
          code: "INVALID_PARTNER_GOTRA",
          message: "One or more selected partner gotras are invalid or inactive.",
        };
      }

      for (const g of activeGotras) {
        if (g.communityId !== null && !communityIds.includes(g.communityId)) {
          return {
            success: false,
            code: "PARTNER_GOTRA_COMMUNITY_MISMATCH",
            message: `Gotra '${g.name}' does not belong to any of the selected partner communities.`,
          };
        }
      }
    }

    // 9. Validate Educations
    if (educationIds.length > 0) {
      const activeEducations = await this.preferences.findActiveEducationsByIds(educationIds);
      if (activeEducations.length !== educationIds.length) {
        return {
          success: false,
          code: "INVALID_PARTNER_EDUCATION",
          message: "One or more selected partner education qualifications are invalid or inactive.",
        };
      }
    }

    // 10. Validate Occupations
    if (occupationIds.length > 0) {
      const activeOccupations = await this.preferences.findActiveOccupationsByIds(occupationIds);
      if (activeOccupations.length !== occupationIds.length) {
        return {
          success: false,
          code: "INVALID_PARTNER_OCCUPATION",
          message: "One or more selected partner occupations are invalid or inactive.",
        };
      }
    }

    // 11. Validate Enums
    const allowedManglik = Object.values(ManglikStatus);
    for (const st of manglikStatuses) {
      if (!allowedManglik.includes(st)) {
        return {
          success: false,
          code: "INVALID_PARTNER_MANGLIK_STATUS",
          message: `Invalid Manglik status '${st}'. Must be one of: ${allowedManglik.join(", ")}.`,
        };
      }
    }

    const allowedMarital = Object.values(MaritalStatus);
    for (const ms of maritalStatuses) {
      if (!allowedMarital.includes(ms)) {
        return {
          success: false,
          code: "INVALID_PARTNER_MARITAL_STATUS",
          message: `Invalid marital status '${ms}'. Must be one of: ${allowedMarital.join(", ")}.`,
        };
      }
    }

    // 12. Check Profile Existence
    const profile = await this.profiles.findByUserId(userId);
    if (!profile) {
      return {
        success: false,
        code: "PROFILE_NOT_FOUND",
        message: "No profile found for this user account. Please initialize your profile first.",
      };
    }

    // 13. Persist in Database Transaction
    const savedRecord = await this.preferences.savePartnerPreferences(
      profile.id,
      dto,
      {
        religionIds,
        communityIds,
        subCommunityIds,
        casteIds,
        gotraIds,
        educationIds,
        occupationIds,
        manglikStatuses,
        maritalStatuses,
      }
    );

    // 14. Recalculate Profile Completion Percentage (90% -> 100%)
    const completeData = await this.profiles.getCompleteProfile(userId);
    const newCompletion = calculateProfileCompletion({
      profileCreatedFor: completeData?.profileCreatedFor,
      personalDetails: completeData?.personalDetails,
      languages: completeData?.languages,
      religion: completeData?.religion,
      education: completeData?.education,
      career: completeData?.career,
      photos: completeData?.photos,
      partnerPreference: completeData?.partnerPreference,
    });

    await this.profiles.updateCompletionPercentage(profile.id, newCompletion);

    return {
      success: true,
      message: "Partner preferences saved successfully.",
      data: {
        partnerPreferences: this.mapToResponseDto(savedRecord),
        profile: {
          completionPercentage: newCompletion,
          profileStatus: profile.profileStatus,
        },
      },
    };
  }
}

export const partnerPreferenceService = new PartnerPreferenceService();
