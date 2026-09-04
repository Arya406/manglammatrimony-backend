import {
  ProfileCreatedFor,
  ProfileStatus,
  ModerationStatus,
  ManglikStatus,
  EmploymentType,
  AnnualIncomeRange,
} from "@prisma/client";
import { prisma } from "../config/database";
import { config } from "../config/env";
import { profileRepository, ProfileRepository } from "../repositories/profile.repository";
import { photoRepository, PhotoRepository } from "../repositories/photo.repository";
import { defaultStorageProvider } from "../providers/storage/LocalStorageProvider";
import {
  InitializeProfileDto,
  SavePersonalDetailsDto,
  SaveReligionDto,
  SaveEducationCareerDto,
  CompleteProfileResponseDto,
  ProfileSummaryDto,
  ReligionResponseDto,
  EducationResponseDto,
  CareerResponseDto,
  ProfileSubmissionResponseDto,
  ProfileCompletenessCheckResult,
} from "../types/profile";
import { ApiResponse } from "../types/auth";
import { calculateProfileCompletion } from "./profile.completion";

export class ProfileService {
  constructor(
    private profiles: ProfileRepository = profileRepository,
    private photos: PhotoRepository = photoRepository
  ) {}

  /**
   * Initializes or retrieves an existing profile for the authenticated user.
   */
  async initializeProfile(
    userId: string,
    dto: InitializeProfileDto
  ): Promise<ApiResponse<{ profile: ProfileSummaryDto; isNew: boolean }>> {
    // 1. Ensure user exists in Prisma database for FK constraint compatibility
    const dbUser = await prisma.user.findUnique({ where: { id: userId } });
    if (!dbUser) {
      // Create user record in PostgreSQL if coming from in-memory authentication
      await prisma.user.upsert({
        where: { id: userId },
        update: {},
        create: {
          id: userId,
          status: "ACTIVE",
        },
      });
    }

    // 2. Create or find existing profile
    const { profile, isNew } = await this.profiles.createOrGetProfile(
      userId,
      dto.profileCreatedFor
    );

    // 3. Compute completion percentage
    if (isNew || profile.completionPercentage === 0) {
      const completion = calculateProfileCompletion({
        profileCreatedFor: profile.profileCreatedFor,
      });
      if (completion !== profile.completionPercentage) {
        await this.profiles.updateCompletionPercentage(profile.id, completion);
        profile.completionPercentage = completion;
      }
    }

    return {
      success: true,
      message: isNew
        ? "Profile initialized successfully."
        : "Existing profile retrieved.",
      data: {
        profile: {
          id: profile.id,
          userId: profile.userId,
          profileCreatedFor: profile.profileCreatedFor,
          profileStatus: profile.profileStatus,
          completionPercentage: profile.completionPercentage,
          createdAt: profile.createdAt,
          updatedAt: profile.updatedAt,
        },
        isNew,
      },
    };
  }

  /**
   * Retrieves the complete profile and all onboarding sub-sections for the authenticated user.
   */
  async getProfile(
    userId: string
  ): Promise<ApiResponse<CompleteProfileResponseDto | null>> {
    const profile = await this.profiles.getCompleteProfile(userId);

    if (!profile) {
      return {
        success: false,
        code: "PROFILE_NOT_FOUND",
        message: "No profile found for this user account. Please initialize your profile.",
      };
    }

    const responseData: CompleteProfileResponseDto = {
      profile: {
        id: profile.id,
        userId: profile.userId,
        profileCreatedFor: profile.profileCreatedFor,
        profileStatus: profile.profileStatus,
        completionPercentage: profile.completionPercentage,
        createdAt: profile.createdAt,
        updatedAt: profile.updatedAt,
      },
      personalDetails: profile.personalDetails
        ? {
            id: profile.personalDetails.id,
            profileId: profile.personalDetails.profileId,
            firstName: profile.personalDetails.firstName,
            lastName: profile.personalDetails.lastName,
            gender: profile.personalDetails.gender,
            dateOfBirth: profile.personalDetails.dateOfBirth,
            maritalStatus: profile.personalDetails.maritalStatus,
            heightCm: profile.personalDetails.heightCm,
            motherTongueId: profile.personalDetails.motherTongueId,
            city: profile.personalDetails.city,
            state: profile.personalDetails.state,
            motherTongue: profile.personalDetails.motherTongue,
            createdAt: profile.personalDetails.createdAt,
            updatedAt: profile.personalDetails.updatedAt,
          }
        : null,
      languages: profile.languages.map((l) => ({
        languageId: l.language.id,
        name: l.language.name,
        code: l.language.code,
      })),
      religion: profile.religion
        ? {
            id: profile.religion.id,
            profileId: profile.religion.profileId,
            religionId: profile.religion.religionId,
            religion: profile.religion.religion,
            communityId: profile.religion.communityId,
            community: profile.religion.community,
            subCommunityId: profile.religion.subCommunityId,
            subCommunity: profile.religion.subCommunity,
            casteId: profile.religion.casteId,
            caste: profile.religion.caste,
            subCasteId: profile.religion.subCasteId,
            subCaste: profile.religion.subCaste,
            gotraId: profile.religion.gotraId,
            gotra: profile.religion.gotra,
            manglik: profile.religion.manglik,
            customReligion: profile.religion.customReligion,
            customCommunity: profile.religion.customCommunity,
            customCaste: profile.religion.customCaste,
            customSubCaste: profile.religion.customSubCaste,
            effectiveReligion:
              profile.religion.religion?.slug === "other"
                ? profile.religion.customReligion || null
                : profile.religion.religion?.name || null,
            effectiveCommunity:
              profile.religion.community?.slug === "other"
                ? profile.religion.customCommunity || null
                : profile.religion.customCommunity || profile.religion.community?.name || null,
            effectiveCaste:
              profile.religion.caste?.slug === "other"
                ? profile.religion.customCaste || null
                : profile.religion.customCaste || profile.religion.caste?.name || null,
            effectiveSubCaste:
              profile.religion.subCaste?.slug === "other"
                ? profile.religion.customSubCaste || null
                : profile.religion.customSubCaste || profile.religion.subCaste?.name || null,
            createdAt: profile.religion.createdAt,
            updatedAt: profile.religion.updatedAt,
          }
        : null,
      education: profile.education
        ? {
            id: profile.education.id,
            profileId: profile.education.profileId,
            educationId: profile.education.educationId,
            education: profile.education.education,
            specializationId: profile.education.specializationId,
            specialization: profile.education.specialization,
            institutionId: profile.education.institutionId,
            institution: profile.education.institution,
            institutionName: profile.education.institutionName,
            createdAt: profile.education.createdAt,
            updatedAt: profile.education.updatedAt,
          }
        : null,
      career: profile.career
        ? {
            id: profile.career.id,
            profileId: profile.career.profileId,
            employmentStatusId: profile.career.employmentStatusId,
            employmentStatus: profile.career.employmentStatus,
            occupationId: profile.career.occupationId,
            occupation: profile.career.occupation,
            companyName: profile.career.companyName,
            employmentType: profile.career.employmentType,
            annualIncomeRange: profile.career.annualIncomeRange,
            createdAt: profile.career.createdAt,
            updatedAt: profile.career.updatedAt,
          }
        : null,
      photos: (profile.photos || []).map((photo) => ({
        id: photo.id,
        profileId: photo.profileId,
        photoType: photo.photoType,
        moderationStatus: photo.moderationStatus,
        moderationReason: photo.moderationReason,
        sortOrder: photo.sortOrder,
        fileSize: photo.fileSize,
        mimeType: photo.mimeType,
        width: photo.width,
        height: photo.height,
        url: defaultStorageProvider.getUrl(photo.storageKey, photo.id),
        createdAt: photo.createdAt,
        updatedAt: photo.updatedAt,
      })),
      partnerPreferences: profile.partnerPreference
        ? {
            id: profile.partnerPreference.id,
            profileId: profile.partnerPreference.profileId,
            minAge: profile.partnerPreference.minAge,
            maxAge: profile.partnerPreference.maxAge,
            minHeightCm: profile.partnerPreference.minHeightCm,
            maxHeightCm: profile.partnerPreference.maxHeightCm,
            religions: (profile.partnerPreference.religions || []).map((r: any) => ({
              id: r.religion.id,
              name: r.religion.name,
              slug: r.religion.slug,
            })),
            communities: (profile.partnerPreference.communities || []).map((c: any) => ({
              id: c.community.id,
              name: c.community.name,
              slug: c.community.slug,
            })),
            subCommunities: (profile.partnerPreference.subCommunities || []).map((sc: any) => ({
              id: sc.subCommunity.id,
              name: sc.subCommunity.name,
              slug: sc.subCommunity.slug,
            })),
            castes: (profile.partnerPreference.castes || []).map((ca: any) => ({
              id: ca.caste.id,
              name: ca.caste.name,
              slug: ca.caste.slug,
            })),
            gotras: (profile.partnerPreference.gotras || []).map((g: any) => ({
              id: g.gotra.id,
              name: g.gotra.name,
              slug: g.gotra.slug,
            })),
            educations: (profile.partnerPreference.educations || []).map((e: any) => ({
              id: e.education.id,
              name: e.education.name,
              slug: e.education.slug,
            })),
            occupations: (profile.partnerPreference.occupations || []).map((o: any) => ({
              id: o.occupation.id,
              name: o.occupation.name,
              slug: o.occupation.slug,
            })),
            manglikStatuses: (profile.partnerPreference.manglik || []).map((m: any) => m.manglik),
            maritalStatuses: (profile.partnerPreference.maritalStatuses || []).map((ms: any) => ms.maritalStatus),
            createdAt: profile.partnerPreference.createdAt,
            updatedAt: profile.partnerPreference.updatedAt,
          }
        : null,
    };

    return {
      success: true,
      message: "Profile retrieved successfully.",
      data: responseData,
    };
  }

  /**
   * Saves or updates personal details and synchronizes spoken languages atomically.
   */
  async savePersonalDetails(
    userId: string,
    dto: SavePersonalDetailsDto
  ): Promise<ApiResponse<{ personalDetails: unknown; languages: unknown[]; completionPercentage: number }>> {
    // 1. Find user's profile
    const profile = await this.profiles.findByUserId(userId);
    if (!profile) {
      return {
        success: false,
        code: "PROFILE_NOT_FOUND",
        message: "No profile found for this user account. Please initialize your profile first.",
      };
    }

    // 2. Validate motherTongueId against active master data
    const validMotherTongue = await this.profiles.verifyActiveLanguage(dto.motherTongueId);
    if (!validMotherTongue) {
      return {
        success: false,
        code: "INVALID_MOTHER_TONGUE",
        message: "The selected mother tongue is invalid or inactive.",
      };
    }

    // 3. Deduplicate and validate languageIds
    const rawLanguageIds = dto.languageIds || [];
    const uniqueLanguageIds = Array.from(new Set(rawLanguageIds.map((id) => id.trim())));

    if (uniqueLanguageIds.length > 0) {
      const activeLanguages = await this.profiles.verifyActiveLanguages(uniqueLanguageIds);
      if (activeLanguages.length !== uniqueLanguageIds.length) {
        return {
          success: false,
          code: "INVALID_LANGUAGE_ID",
          message: "One or more selected spoken languages are invalid or inactive.",
        };
      }
    }

    // 4. Save personal details & sync languages atomically
    const { personalDetails, languages } =
      await this.profiles.savePersonalDetailsAndLanguages(
        profile.id,
        dto,
        uniqueLanguageIds
      );

    // 5. Recalculate profile completion
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
      message: "Personal details saved successfully.",
      data: {
        personalDetails,
        languages,
        completionPercentage: newCompletion,
      },
    };
  }

  /**
   * Saves or updates Religion, Community, Caste, Gotra, and Manglik details with strict hierarchical validation.
   */
  async saveReligion(
    userId: string,
    dto: SaveReligionDto
  ): Promise<
    ApiResponse<{
      religion: ReligionResponseDto;
      profile: { completionPercentage: number; profileStatus: ProfileStatus };
    }>
  > {
    // Sanitize and trim custom text inputs
    const cleanDto: SaveReligionDto = {
      ...dto,
      customReligion: dto.customReligion ? dto.customReligion.trim() : null,
      customCommunity: dto.customCommunity ? dto.customCommunity.trim() : null,
      customCaste: dto.customCaste ? dto.customCaste.trim() : null,
      customSubCaste: dto.customSubCaste ? dto.customSubCaste.trim() : null,
    };

    // 1. Find user's profile
    const profile = await this.profiles.findByUserId(userId);
    if (!profile) {
      return {
        success: false,
        code: "PROFILE_NOT_FOUND",
        message: "No profile found for this user account. Please initialize your profile first.",
      };
    }

    // 2. Validate Religion
    const religion = await this.profiles.findReligionById(cleanDto.religionId);
    if (!religion) {
      return {
        success: false,
        code: "INVALID_RELIGION",
        message: "Selected religion is invalid or inactive.",
      };
    }

    if (religion.slug === "other" && (!cleanDto.customReligion || cleanDto.customReligion.length === 0)) {
      return {
        success: false,
        code: "INVALID_CUSTOM_RELIGION",
        message: "Please specify your religion.",
      };
    }

    // 3. Validate Community (Optional)
    if (cleanDto.communityId) {
      const community = await this.profiles.findCommunityById(cleanDto.communityId);
      if (!community) {
        return {
          success: false,
          code: "INVALID_COMMUNITY",
          message: "Selected community is invalid or inactive.",
        };
      }

      if (community.slug === "other" && (!cleanDto.customCommunity || cleanDto.customCommunity.length === 0)) {
        return {
          success: false,
          code: "INVALID_CUSTOM_COMMUNITY",
          message: "Please specify your community.",
        };
      }

      // If community is linked to a religion, it must match religionId
      if (community.religionId !== null && community.religionId !== cleanDto.religionId) {
        return {
          success: false,
          code: "COMMUNITY_RELIGION_MISMATCH",
          message: "Selected community does not belong to the chosen religion.",
        };
      }
    }

    // 4. Validate Sub-Community (Optional)
    if (dto.subCommunityId) {
      if (!dto.communityId) {
        return {
          success: false,
          code: "SUB_COMMUNITY_COMMUNITY_MISMATCH",
          message: "A community must be selected when specifying a sub-community.",
        };
      }

      const subCommunity = await this.profiles.findSubCommunityById(dto.subCommunityId);
      if (!subCommunity) {
        return {
          success: false,
          code: "INVALID_SUB_COMMUNITY",
          message: "Selected sub-community is invalid or inactive.",
        };
      }

      if (subCommunity.communityId !== dto.communityId) {
        return {
          success: false,
          code: "SUB_COMMUNITY_COMMUNITY_MISMATCH",
          message: "Selected sub-community does not belong to the chosen community.",
        };
      }
    }

    // 5. Validate Caste (Optional)
    if (dto.casteId) {
      if (!dto.communityId) {
        return {
          success: false,
          code: "CASTE_COMMUNITY_MISMATCH",
          message: "A community must be selected when specifying a caste.",
        };
      }

      const caste = await this.profiles.findCasteById(dto.casteId);
      if (!caste) {
        return {
          success: false,
          code: "INVALID_CASTE",
          message: "Selected caste is invalid or inactive.",
        };
      }

      if (caste.communityId !== null && caste.communityId !== dto.communityId) {
        return {
          success: false,
          code: "CASTE_COMMUNITY_MISMATCH",
          message: "Selected caste does not belong to the chosen community.",
        };
      }
    }

    // 6. Validate Sub-Caste (Optional)
    if (dto.subCasteId) {
      if (!dto.casteId) {
        return {
          success: false,
          code: "SUB_CASTE_CASTE_MISMATCH",
          message: "A caste must be selected when specifying a sub-caste.",
        };
      }

      const subCaste = await this.profiles.findSubCasteById(dto.subCasteId);
      if (!subCaste) {
        return {
          success: false,
          code: "INVALID_SUB_CASTE",
          message: "Selected sub-caste is invalid or inactive.",
        };
      }

      if (subCaste.casteId !== dto.casteId) {
        return {
          success: false,
          code: "SUB_CASTE_CASTE_MISMATCH",
          message: "Selected sub-caste does not belong to the chosen caste.",
        };
      }
    }

    // 7. Validate Gotra (Optional)
    if (dto.gotraId) {
      if (!dto.communityId) {
        return {
          success: false,
          code: "GOTRA_COMMUNITY_MISMATCH",
          message: "A community must be selected when specifying a gotra.",
        };
      }

      const gotra = await this.profiles.findGotraById(dto.gotraId);
      if (!gotra) {
        return {
          success: false,
          code: "INVALID_GOTRA",
          message: "Selected gotra is invalid or inactive.",
        };
      }

      if (gotra.communityId !== null && gotra.communityId !== dto.communityId) {
        return {
          success: false,
          code: "GOTRA_COMMUNITY_MISMATCH",
          message: "Selected gotra does not belong to the chosen community.",
        };
      }
    }

    // 8. Validate Manglik (Optional)
    if (dto.manglik && !Object.values(ManglikStatus).includes(dto.manglik)) {
      return {
        success: false,
        code: "INVALID_MANGLIK_STATUS",
        message: `Manglik status must be one of: ${Object.values(ManglikStatus).join(", ")}.`,
      };
    }

    // 9. Persist Religion details via repository upsert
    const savedReligion = await this.profiles.upsertReligion(profile.id, cleanDto);

    // 10. Recalculate profile completion
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
      message: "Religion and community details saved successfully.",
      data: {
        religion: (completeData?.religion || savedReligion) as unknown as ReligionResponseDto,
        profile: {
          completionPercentage: newCompletion,
          profileStatus: profile.profileStatus,
        },
      },
    };
  }

  /**
   * Saves or updates Education and Career details with hierarchical integrity and atomic transaction.
   */
  async saveEducationCareer(
    userId: string,
    dto: SaveEducationCareerDto
  ): Promise<
    ApiResponse<{
      education: EducationResponseDto;
      career: CareerResponseDto;
      profile: { completionPercentage: number; profileStatus: ProfileStatus };
    }>
  > {
    // 1. Find user's profile
    const profile = await this.profiles.findByUserId(userId);
    if (!profile) {
      return {
        success: false,
        code: "PROFILE_NOT_FOUND",
        message: "No profile found for this user account. Please initialize your profile first.",
      };
    }

    // 2. Validate Education (Required)
    const education = await this.profiles.findEducationById(dto.education.educationId);
    if (!education) {
      return {
        success: false,
        code: "INVALID_EDUCATION",
        message: "Selected education level is invalid or inactive.",
      };
    }

    // 3. Validate Specialization (Optional, Hierarchy: Education -> Specialization)
    if (dto.education.specializationId) {
      const specialization = await this.profiles.findSpecializationById(
        dto.education.specializationId
      );
      if (!specialization) {
        return {
          success: false,
          code: "INVALID_SPECIALIZATION",
          message: "Selected specialization is invalid or inactive.",
        };
      }

      if (specialization.educationId !== dto.education.educationId) {
        return {
          success: false,
          code: "SPECIALIZATION_EDUCATION_MISMATCH",
          message: "Selected specialization does not belong to the chosen education level.",
        };
      }
    }

    // 4. Validate Institution (Optional)
    if (dto.education.institutionId) {
      const institution = await this.profiles.findInstitutionById(
        dto.education.institutionId
      );
      if (!institution) {
        return {
          success: false,
          code: "INVALID_INSTITUTION",
          message: "Selected institution is invalid or inactive.",
        };
      }
    }

    // 5. Validate Employment Status (Required)
    const employmentStatus = await this.profiles.findEmploymentStatusById(
      dto.career.employmentStatusId
    );
    if (!employmentStatus) {
      return {
        success: false,
        code: "INVALID_EMPLOYMENT_STATUS",
        message: "Selected employment status is invalid or inactive.",
      };
    }

    // 6. Validate Occupation (Optional, Hierarchy: EmploymentStatus -> Occupation)
    if (dto.career.occupationId) {
      const occupation = await this.profiles.findOccupationById(
        dto.career.occupationId
      );
      if (!occupation) {
        return {
          success: false,
          code: "INVALID_OCCUPATION",
          message: "Selected occupation is invalid or inactive.",
        };
      }

      if (
        occupation.employmentStatusId !== null &&
        occupation.employmentStatusId !== dto.career.employmentStatusId
      ) {
        return {
          success: false,
          code: "OCCUPATION_EMPLOYMENT_STATUS_MISMATCH",
          message: "Selected occupation does not belong to the chosen employment status.",
        };
      }
    }

    // 7. Validate Employment Type (Optional)
    if (
      dto.career.employmentType &&
      !Object.values(EmploymentType).includes(dto.career.employmentType)
    ) {
      return {
        success: false,
        code: "INVALID_EMPLOYMENT_TYPE",
        message: `Employment type must be one of: ${Object.values(EmploymentType).join(", ")}.`,
      };
    }

    // 8. Validate Annual Income Range (Optional)
    if (
      dto.career.annualIncomeRange &&
      !Object.values(AnnualIncomeRange).includes(dto.career.annualIncomeRange)
    ) {
      return {
        success: false,
        code: "INVALID_ANNUAL_INCOME_RANGE",
        message: `Annual income range must be one of: ${Object.values(AnnualIncomeRange).join(", ")}.`,
      };
    }

    // 9. Atomic Transaction Upsert for Education + Career
    const { education: savedEducation, career: savedCareer } =
      await this.profiles.upsertEducationCareer(
        profile.id,
        dto.education,
        dto.career
      );

    // 10. Recalculate profile completion
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
      message: "Education and career details saved successfully.",
      data: {
        education: savedEducation as unknown as EducationResponseDto,
        career: savedCareer as unknown as CareerResponseDto,
        profile: {
          completionPercentage: newCompletion,
          profileStatus: profile.profileStatus,
        },
      },
    };
  }

  /**
   * Validates internal database completeness and photo moderation status for profile submission.
   */
  private validateProfileCompleteness(profileState: any): ProfileCompletenessCheckResult {
    const missingSections: string[] = [];

    // 1. Personal Details
    const pd = profileState.personalDetails;
    if (
      !pd ||
      !pd.firstName ||
      !pd.lastName ||
      !pd.gender ||
      !pd.dateOfBirth ||
      !pd.maritalStatus ||
      !pd.heightCm ||
      !pd.motherTongueId
    ) {
      missingSections.push("PERSONAL_DETAILS");
    }

    // 2. Religion & Community
    const rel = profileState.religion;
    if (!rel || !rel.religionId || !rel.manglik) {
      missingSections.push("RELIGION");
    }

    // 3. Education
    const edu = profileState.education;
    if (!edu || !edu.educationId) {
      missingSections.push("EDUCATION");
    }

    // 4. Career
    const car = profileState.career;
    if (!car || !car.employmentStatusId) {
      missingSections.push("CAREER");
    }

    // 5. Photos
    const photos = profileState.photos || [];
    if (photos.length === 0) {
      missingSections.push("PHOTOS");
    }

    // 6. Partner Preferences
    const pref = profileState.partnerPreference;
    if (!pref || !pref.id) {
      missingSections.push("PARTNER_PREFERENCES");
    }

    const approvedPhotos = photos.filter(
      (p: any) => p.moderationStatus === "APPROVED"
    );

    return {
      isComplete: missingSections.length === 0,
      missingSections,
      hasApprovedPhoto: approvedPhotos.length > 0,
      photoCount: photos.length,
      approvedPhotoCount: approvedPhotos.length,
    };
  }

  /**
   * Submits an incomplete profile for verification and changes status to IN_REVIEW.
   */
  async submitProfile(
    userId: string
  ): Promise<
    ApiResponse<{
      profile: ProfileSubmissionResponseDto;
    }>
  > {
    // 1. Resolve profile state
    const profile = await this.profiles.getProfileSubmissionState(userId);
    if (!profile) {
      return {
        success: false,
        code: "PROFILE_NOT_FOUND",
        message: "No profile found for this user account. Please initialize your profile first.",
      };
    }

    // 2. Validate current status
    if (profile.profileStatus === ProfileStatus.IN_REVIEW) {
      return {
        success: true,
        code: "PROFILE_ALREADY_SUBMITTED",
        message: "Your profile has already been submitted and is currently under review.",
        data: {
          profile: {
            id: profile.id,
            profileStatus: profile.profileStatus,
            completionPercentage: profile.completionPercentage,
            submittedAt: profile.submittedAt || new Date(),
          },
        },
      };
    }

    if (profile.profileStatus === ProfileStatus.ACTIVE) {
      return {
        success: true,
        code: "PROFILE_ALREADY_ACTIVE",
        message: "Your profile is already active and verified.",
        data: {
          profile: {
            id: profile.id,
            profileStatus: profile.profileStatus,
            completionPercentage: profile.completionPercentage,
            submittedAt: profile.submittedAt || new Date(),
          },
        },
      };
    }

    if (profile.profileStatus === ProfileStatus.REJECTED) {
      return {
        success: false,
        code: "PROFILE_REJECTED",
        message: "Your profile was rejected. Please address the feedback before resubmitting.",
      };
    }

    if (profile.profileStatus === ProfileStatus.SUSPENDED) {
      return {
        success: false,
        code: "PROFILE_SUSPENDED",
        message: "Your profile account has been suspended.",
      };
    }

    // 3. Validate database completeness
    const completeness = this.validateProfileCompleteness(profile);
    if (!completeness.isComplete || profile.completionPercentage < 100) {
      return {
        success: false,
        code: "PROFILE_INCOMPLETE",
        message: "Please complete all required profile sections before submitting.",
        error: {
          code: "PROFILE_INCOMPLETE",
          missingSections: completeness.missingSections,
        },
      };
    }

    // 4. Validate photo presence (At least one uploaded photo is required)
    if (!profile.photos || profile.photos.length === 0) {
      return {
        success: false,
        code: "PROFILE_INCOMPLETE",
        message: "At least one profile photo is required before submitting for review.",
        error: {
          code: "PROFILE_INCOMPLETE",
          missingSections: ["PHOTOS"],
        },
      };
    }

    // 5. Atomic conditional status transition to IN_REVIEW
    const updatedProfile = await this.profiles.submitProfile(profile.id);
    if (!updatedProfile) {
      // Race condition check: retrieve latest status
      const latest = await this.profiles.findById(profile.id);
      if (latest?.profileStatus === ProfileStatus.IN_REVIEW) {
        return {
          success: true,
          code: "PROFILE_ALREADY_SUBMITTED",
          message: "Your profile has already been submitted and is currently under review.",
          data: {
            profile: {
              id: latest.id,
              profileStatus: latest.profileStatus,
              completionPercentage: latest.completionPercentage,
              submittedAt: latest.submittedAt || new Date(),
            },
          },
        };
      }

      if (latest?.profileStatus === ProfileStatus.ACTIVE) {
        return {
          success: true,
          code: "PROFILE_ALREADY_ACTIVE",
          message: "Your profile is already active.",
          data: {
            profile: {
              id: latest.id,
              profileStatus: latest.profileStatus,
              completionPercentage: latest.completionPercentage,
              submittedAt: latest.submittedAt || new Date(),
            },
          },
        };
      }

      return {
        success: false,
        code: "INTERNAL_SERVER_ERROR",
        message: "Unable to process profile submission. Please try again.",
      };
    }

    return {
      success: true,
      message: "Your profile has been submitted successfully and is now under review.",
      data: {
        profile: {
          id: updatedProfile.id,
          profileStatus: updatedProfile.profileStatus,
          completionPercentage: updatedProfile.completionPercentage,
          submittedAt: updatedProfile.submittedAt || new Date(),
        },
      },
    };
  }

  /**
   * Retrieves all active languages for onboarding master data selection.
   */
  async getActiveLanguages() {
    const languages = await this.profiles.getAllActiveLanguages();
    return languages.map((l) => ({
      id: l.id,
      name: l.name,
      code: l.code,
      sortOrder: l.sortOrder,
    }));
  }

  /**
   * Retrieves all active religions.
   */
  async getActiveReligions() {
    const religions = await this.profiles.getAllActiveReligions();
    return religions.map((r) => ({
      id: r.id,
      name: r.name,
      slug: r.slug,
      sortOrder: r.sortOrder,
    }));
  }

  /**
   * Retrieves active communities (optionally filtered by religion).
   */
  async getActiveCommunities(religionId?: string) {
    const communities = await this.profiles.getActiveCommunities(religionId);
    return communities.map((c) => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      religionId: c.religionId,
      sortOrder: c.sortOrder,
    }));
  }

  /**
   * Retrieves active sub-communities.
   */
  async getActiveSubCommunities(communityId?: string) {
    const subCommunities = await this.profiles.getActiveSubCommunities(communityId);
    return subCommunities.map((sc) => ({
      id: sc.id,
      name: sc.name,
      slug: sc.slug,
      communityId: sc.communityId,
      sortOrder: sc.sortOrder,
    }));
  }

  /**
   * Retrieves active castes.
   */
  async getActiveCastes(communityId?: string) {
    const castes = await this.profiles.getActiveCastes(communityId);
    return castes.map((c) => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      communityId: c.communityId,
      sortOrder: c.sortOrder,
    }));
  }

  /**
   * Retrieves active sub-castes.
   */
  async getActiveSubCastes(casteId?: string) {
    const subCastes = await this.profiles.getActiveSubCastes(casteId);
    return subCastes.map((sc) => ({
      id: sc.id,
      name: sc.name,
      slug: sc.slug,
      casteId: sc.casteId,
      sortOrder: sc.sortOrder,
    }));
  }

  /**
   * Retrieves active gotras.
   */
  async getActiveGotras(communityId?: string) {
    const gotras = await this.profiles.getActiveGotras(communityId);
    return gotras.map((g) => ({
      id: g.id,
      name: g.name,
      slug: g.slug,
      communityId: g.communityId,
      sortOrder: g.sortOrder,
    }));
  }

  /**
   * Retrieves all active educations.
   */
  async getActiveEducations() {
    const educations = await this.profiles.getAllActiveEducations();
    return educations.map((e) => ({
      id: e.id,
      name: e.name,
      slug: e.slug,
      sortOrder: e.sortOrder,
    }));
  }

  /**
   * Retrieves active specializations (optionally filtered by education).
   */
  async getActiveSpecializations(educationId?: string) {
    const specializations = await this.profiles.getActiveSpecializations(educationId);
    return specializations.map((s) => ({
      id: s.id,
      name: s.name,
      slug: s.slug,
      educationId: s.educationId,
      sortOrder: s.sortOrder,
    }));
  }

  /**
   * Retrieves active institutions.
   */
  async getActiveInstitutions() {
    const institutions = await this.profiles.getAllActiveInstitutions();
    return institutions.map((inst) => ({
      id: inst.id,
      name: inst.name,
      type: inst.type,
    }));
  }

  /**
   * Retrieves active employment statuses.
   */
  async getActiveEmploymentStatuses() {
    const statuses = await this.profiles.getAllActiveEmploymentStatuses();
    return statuses.map((st) => ({
      id: st.id,
      name: st.name,
      slug: st.slug,
      sortOrder: st.sortOrder,
    }));
  }

  /**
   * Retrieves active occupations (optionally filtered by employment status).
   */
  async getActiveOccupations(employmentStatusId?: string) {
    const occupations = await this.profiles.getActiveOccupations(employmentStatusId);
    return occupations.map((occ) => ({
      id: occ.id,
      name: occ.name,
      slug: occ.slug,
      employmentStatusId: occ.employmentStatusId,
      sortOrder: occ.sortOrder,
    }));
  }
}

export const profileService = new ProfileService();
