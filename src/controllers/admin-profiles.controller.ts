import { Request, Response } from "express";
import { adminProfilesService } from "../services/admin-profiles.service";
import { Gender, ProfileStatus, UserStatus } from "@prisma/client";

export class AdminProfilesController {
  /**
   * GET /api/admin/profiles
   * Paginated, searchable, filterable list of all matrimonial profiles.
   */
  async listProfiles(req: Request, res: Response): Promise<void> {
    try {
      const { page, pageSize, q, gender, profileStatus, userStatus, sort } = req.query;

      // Validate Gender Enum
      if (gender && !Object.values(Gender).includes(gender as Gender)) {
        res.status(400).json({
          success: false,
          code: "INVALID_FILTER",
          message: `Invalid gender filter. Supported values: ${Object.values(Gender).join(", ")}`,
        });
        return;
      }

      // Validate ProfileStatus Enum
      if (
        profileStatus &&
        !Object.values(ProfileStatus).includes(profileStatus as ProfileStatus)
      ) {
        res.status(400).json({
          success: false,
          code: "INVALID_FILTER",
          message: `Invalid profileStatus filter. Supported values: ${Object.values(ProfileStatus).join(", ")}`,
        });
        return;
      }

      // Validate UserStatus Enum
      if (
        userStatus &&
        !Object.values(UserStatus).includes(userStatus as UserStatus)
      ) {
        res.status(400).json({
          success: false,
          code: "INVALID_FILTER",
          message: `Invalid userStatus filter. Supported values: ${Object.values(UserStatus).join(", ")}`,
        });
        return;
      }

      // Validate Sort
      const validSorts = ["newest", "oldest", "name_asc", "name_desc"];
      if (sort && !validSorts.includes(sort as string)) {
        res.status(400).json({
          success: false,
          code: "INVALID_SORT",
          message: `Invalid sort option. Supported: ${validSorts.join(", ")}`,
        });
        return;
      }

      const result = await adminProfilesService.listProfiles({
        page: page ? parseInt(page as string, 10) : undefined,
        pageSize: pageSize ? parseInt(pageSize as string, 10) : undefined,
        q: q ? String(q) : undefined,
        gender: gender ? (gender as Gender) : undefined,
        profileStatus: profileStatus ? (profileStatus as ProfileStatus) : undefined,
        userStatus: userStatus ? (userStatus as UserStatus) : undefined,
        sort: sort ? (sort as "newest" | "oldest" | "name_asc" | "name_desc") : undefined,
      });

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      console.error("[ADMIN PROFILES ERROR]: Error listing profiles:", error);
      res.status(500).json({
        success: false,
        code: "INTERNAL_ERROR",
        message: "Failed to retrieve profiles list.",
      });
    }
  }

  /**
   * GET /api/admin/profiles/:profileId
   * Complete read-only profile detail for administrative inspection.
   */
  async getProfileDetail(req: Request, res: Response): Promise<void> {
    try {
      const { profileId } = req.params;

      if (!profileId) {
        res.status(400).json({
          success: false,
          code: "VALIDATION_ERROR",
          message: "Profile ID is required.",
        });
        return;
      }

      const profile = await adminProfilesService.getProfileDetail(profileId);

      if (!profile) {
        res.status(404).json({
          success: false,
          code: "NOT_FOUND",
          message: "Matrimonial profile not found.",
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: {
          profile,
        },
      });
    } catch (error) {
      console.error("[ADMIN PROFILES ERROR]: Error fetching profile detail:", error);
      res.status(500).json({
        success: false,
        code: "INTERNAL_ERROR",
        message: "Failed to retrieve profile detail.",
      });
    }
  }

  /**
   * PUT /api/admin/profiles/:profileId/profile-created-for
   * Section A: Update Profile Created For relationship.
   */
  async updateProfileCreatedFor(req: Request, res: Response): Promise<void> {
    try {
      const { profileId } = req.params;
      const adminUserId = req.admin?.id;

      if (!adminUserId) {
        res.status(401).json({
          success: false,
          code: "UNAUTHORIZED",
          message: "Admin authentication required.",
        });
        return;
      }

      const { profileCreatedFor, expectedUpdatedAt } = req.body;

      const result = await adminProfilesService.updateProfileCreatedFor(
        profileId,
        adminUserId,
        {
          profileCreatedFor,
          expectedUpdatedAt,
        }
      );

      if (!result.success) {
        res.status(result.status).json({
          success: false,
          code: result.code,
          message: result.message,
          ...(result.currentUpdatedAt ? { data: { currentUpdatedAt: result.currentUpdatedAt } } : {}),
        });
        return;
      }

      res.status(200).json({
        success: true,
        message: result.message,
        data: result.data,
      });
    } catch (error) {
      console.error("[ADMIN PROFILES ERROR]: Error updating profile created for:", error);
      res.status(500).json({
        success: false,
        code: "INTERNAL_ERROR",
        message: "Failed to update profile created for.",
      });
    }
  }

  /**
   * PUT /api/admin/profiles/:profileId/personal-details
   * Section B: Update Personal Details & Spoken Languages.
   */
  async updatePersonalDetails(req: Request, res: Response): Promise<void> {
    try {
      const { profileId } = req.params;
      const adminUserId = req.admin?.id;

      if (!adminUserId) {
        res.status(401).json({
          success: false,
          code: "UNAUTHORIZED",
          message: "Admin authentication required.",
        });
        return;
      }

      // Explicitly destructure permitted fields to prevent mass assignment
      const {
        firstName,
        lastName,
        gender,
        dateOfBirth,
        maritalStatus,
        heightCm,
        motherTongueId,
        languageIds,
        city,
        state,
        expectedUpdatedAt,
      } = req.body;

      const result = await adminProfilesService.updatePersonalDetails(
        profileId,
        adminUserId,
        {
          firstName,
          lastName,
          gender,
          dateOfBirth,
          maritalStatus,
          heightCm,
          motherTongueId,
          languageIds,
          city,
          state,
          expectedUpdatedAt,
        }
      );

      if (!result.success) {
        res.status(result.status).json({
          success: false,
          code: result.code,
          message: result.message,
          ...(result.currentUpdatedAt ? { data: { currentUpdatedAt: result.currentUpdatedAt } } : {}),
        });
        return;
      }

      res.status(200).json({
        success: true,
        message: result.message,
        data: result.data,
      });
    } catch (error) {
      console.error("[ADMIN PROFILES ERROR]: Error updating personal details:", error);
      res.status(500).json({
        success: false,
        code: "INTERNAL_ERROR",
        message: "Failed to update personal details.",
      });
    }
  }

  /**
   * PUT /api/admin/profiles/:profileId/religion
   * Section C: Update Religion & Cultural Hierarchy.
   */
  async updateReligion(req: Request, res: Response): Promise<void> {
    try {
      const { profileId } = req.params;
      const adminUserId = req.admin?.id;

      if (!adminUserId) {
        res.status(401).json({
          success: false,
          code: "UNAUTHORIZED",
          message: "Admin authentication required.",
        });
        return;
      }

      // Explicitly destructure permitted fields
      const {
        religionId,
        communityId,
        subCommunityId,
        casteId,
        subCasteId,
        gotraId,
        manglik,
        customReligion,
        customCommunity,
        customCaste,
        customSubCaste,
        expectedUpdatedAt,
      } = req.body;

      const result = await adminProfilesService.updateReligion(
        profileId,
        adminUserId,
        {
          religionId,
          communityId,
          subCommunityId,
          casteId,
          subCasteId,
          gotraId,
          manglik,
          customReligion,
          customCommunity,
          customCaste,
          customSubCaste,
          expectedUpdatedAt,
        }
      );

      if (!result.success) {
        res.status(result.status).json({
          success: false,
          code: result.code,
          message: result.message,
          ...(result.currentUpdatedAt ? { data: { currentUpdatedAt: result.currentUpdatedAt } } : {}),
        });
        return;
      }

      res.status(200).json({
        success: true,
        message: result.message,
        data: result.data,
      });
    } catch (error) {
      console.error("[ADMIN PROFILES ERROR]: Error updating religion details:", error);
      res.status(500).json({
        success: false,
        code: "INTERNAL_ERROR",
        message: "Failed to update religion details.",
      });
    }
  }

  /**
   * PUT /api/admin/profiles/:profileId/education-career
   * Section D: Update Education & Career.
   */
  async updateEducationCareer(req: Request, res: Response): Promise<void> {
    try {
      const { profileId } = req.params;
      const adminUserId = req.admin?.id;

      if (!adminUserId) {
        res.status(401).json({
          success: false,
          code: "UNAUTHORIZED",
          message: "Admin authentication required.",
        });
        return;
      }

      const { education, career, expectedUpdatedAt } = req.body;

      const result = await adminProfilesService.updateEducationCareer(
        profileId,
        adminUserId,
        {
          education,
          career,
          expectedUpdatedAt,
        }
      );

      if (!result.success) {
        res.status(result.status).json({
          success: false,
          code: result.code,
          message: result.message,
          ...(result.currentUpdatedAt ? { data: { currentUpdatedAt: result.currentUpdatedAt } } : {}),
        });
        return;
      }

      res.status(200).json({
        success: true,
        message: result.message,
        data: result.data,
      });
    } catch (error) {
      console.error("[ADMIN PROFILES ERROR]: Error updating education & career:", error);
      res.status(500).json({
        success: false,
        code: "INTERNAL_ERROR",
        message: "Failed to update education and career details.",
      });
    }
  }

  /**
   * PUT /api/admin/profiles/:profileId/partner-preferences
   * Section E: Update Partner Preferences.
   */
  async updatePartnerPreferences(req: Request, res: Response): Promise<void> {
    try {
      const { profileId } = req.params;
      const adminUserId = req.admin?.id;

      if (!adminUserId) {
        res.status(401).json({
          success: false,
          code: "UNAUTHORIZED",
          message: "Admin authentication required.",
        });
        return;
      }

      const {
        minAge,
        maxAge,
        minHeightCm,
        maxHeightCm,
        religionIds,
        communityIds,
        subCommunityIds,
        casteIds,
        gotraIds,
        educationIds,
        occupationIds,
        manglikStatuses,
        maritalStatuses,
        expectedUpdatedAt,
      } = req.body;

      const result = await adminProfilesService.updatePartnerPreferences(
        profileId,
        adminUserId,
        {
          minAge,
          maxAge,
          minHeightCm,
          maxHeightCm,
          religionIds,
          communityIds,
          subCommunityIds,
          casteIds,
          gotraIds,
          educationIds,
          occupationIds,
          manglikStatuses,
          maritalStatuses,
          expectedUpdatedAt,
        }
      );

      if (!result.success) {
        res.status(result.status).json({
          success: false,
          code: result.code,
          message: result.message,
          ...(result.currentUpdatedAt ? { data: { currentUpdatedAt: result.currentUpdatedAt } } : {}),
        });
        return;
      }

      res.status(200).json({
        success: true,
        message: result.message,
        data: result.data,
      });
    } catch (error) {
      console.error("[ADMIN PROFILES ERROR]: Error updating partner preferences:", error);
      res.status(500).json({
        success: false,
        code: "INTERNAL_ERROR",
        message: "Failed to update partner preferences.",
      });
    }
  }
}

export const adminProfilesController = new AdminProfilesController();
