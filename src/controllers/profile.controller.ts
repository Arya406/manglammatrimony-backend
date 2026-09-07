import { Request, Response } from "express";
import { profileService, ProfileService } from "../services/profile.service";

export class ProfileController {
  constructor(private service: ProfileService = profileService) {}

  /**
   * POST /api/profile
   * Initializes or retrieves matrimonial profile for the authenticated user.
   */
  initializeProfile = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        res.status(401).json({
          success: false,
          code: "UNAUTHORIZED",
          message: "Authentication required.",
        });
        return;
      }

      const result = await this.service.initializeProfile(userId, req.body);
      const statusCode = result.data?.isNew ? 201 : 200;

      res.status(statusCode).json(result);
    } catch (error: any) {
      console.error("[PROFILE CONTROLLER ERROR - initializeProfile]:", error);
      res.status(500).json({
        success: false,
        code: "INTERNAL_SERVER_ERROR",
        message: "An unexpected error occurred while initializing your profile. Please try again.",
      });
    }
  };

  /**
   * GET /api/profile
   * Retrieves complete profile information for the authenticated user.
   */
  getProfile = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        res.status(401).json({
          success: false,
          code: "UNAUTHORIZED",
          message: "Authentication required.",
        });
        return;
      }

      const result = await this.service.getProfile(userId);
      if (!result.success) {
        res.status(404).json(result);
        return;
      }

      res.status(200).json(result);
    } catch (error: any) {
      console.error("[PROFILE CONTROLLER ERROR - getProfile]:", error);
      res.status(500).json({
        success: false,
        code: "INTERNAL_SERVER_ERROR",
        message: "An unexpected error occurred while fetching your profile. Please try again.",
      });
    }
  };

  /**
   * PUT /api/profile/personal-details
   * Saves or updates personal details and spoken languages for the authenticated user.
   */
  savePersonalDetails = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        res.status(401).json({
          success: false,
          code: "UNAUTHORIZED",
          message: "Authentication required.",
        });
        return;
      }

      const result = await this.service.savePersonalDetails(userId, req.body);
      if (!result.success) {
        if (result.code === "PROFILE_NOT_FOUND") {
          res.status(404).json(result);
          return;
        }
        res.status(400).json(result);
        return;
      }

      res.status(200).json(result);
    } catch (error: any) {
      console.error("[PROFILE CONTROLLER ERROR - savePersonalDetails]:", error);
      res.status(500).json({
        success: false,
        code: "INTERNAL_SERVER_ERROR",
        message: "An unexpected error occurred while saving your personal details. Please try again.",
      });
    }
  };

  /**
   * PUT /api/profile/religion
   * Saves or updates religion, community, caste, gotra, and manglik details for the authenticated user.
   */
  saveReligion = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        res.status(401).json({
          success: false,
          code: "UNAUTHORIZED",
          message: "Authentication required.",
        });
        return;
      }

      const result = await this.service.saveReligion(userId, req.body);
      if (!result.success) {
        if (result.code === "PROFILE_NOT_FOUND") {
          res.status(404).json(result);
          return;
        }
        res.status(400).json(result);
        return;
      }

      res.status(200).json(result);
    } catch (error: any) {
      console.error("[PROFILE CONTROLLER ERROR - saveReligion]:", error);
      res.status(500).json({
        success: false,
        code: "INTERNAL_SERVER_ERROR",
        message: "An unexpected error occurred while saving your religion and community details. Please try again.",
      });
    }
  };

  /**
   * PUT /api/profile/education-career
   * Saves or updates education and career details for the authenticated user.
   */
  saveEducationCareer = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        res.status(401).json({
          success: false,
          code: "UNAUTHORIZED",
          message: "Authentication required.",
        });
        return;
      }

      const result = await this.service.saveEducationCareer(userId, req.body);
      if (!result.success) {
        if (result.code === "PROFILE_NOT_FOUND") {
          res.status(404).json(result);
          return;
        }
        res.status(400).json(result);
        return;
      }

      res.status(200).json(result);
    } catch (error: any) {
      console.error("[PROFILE CONTROLLER ERROR - saveEducationCareer]:", error);
      res.status(500).json({
        success: false,
        code: "INTERNAL_SERVER_ERROR",
        message: "An unexpected error occurred while saving your education and career details. Please try again.",
      });
    }
  };

  /**
   * POST /api/profile/submit
   * Submits complete matrimonial profile for verification (INCOMPLETE -> IN_REVIEW).
   */
  submitProfile = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        res.status(401).json({
          success: false,
          code: "UNAUTHORIZED",
          message: "Authentication required.",
        });
        return;
      }

      const result = await this.service.submitProfile(userId);
      if (!result.success) {
        if (result.code === "PROFILE_NOT_FOUND") {
          res.status(404).json(result);
          return;
        }

        if (
          result.code === "PROFILE_ALREADY_SUBMITTED" ||
          result.code === "PROFILE_ALREADY_ACTIVE" ||
          result.code === "PROFILE_REJECTED" ||
          result.code === "PROFILE_SUSPENDED"
        ) {
          res.status(409).json(result);
          return;
        }

        res.status(400).json(result);
        return;
      }

      res.status(200).json(result);
    } catch (error: any) {
      console.error("[PROFILE CONTROLLER ERROR - submitProfile]:", error);
      res.status(500).json({
        success: false,
        code: "INTERNAL_SERVER_ERROR",
        message: "An unexpected error occurred while submitting your profile. Please try again.",
      });
    }
  };

  /**
   * GET /api/profile/languages
   * Retrieves all active languages for profile onboarding.
   */
  getActiveLanguages = async (_req: Request, res: Response): Promise<void> => {
    try {
      const languages = await this.service.getActiveLanguages();
      res.status(200).json({
        success: true,
        message: "Languages retrieved successfully.",
        data: languages,
      });
    } catch (error: any) {
      console.error("[PROFILE CONTROLLER ERROR - getActiveLanguages]:", error);
      res.status(500).json({
        success: false,
        code: "INTERNAL_SERVER_ERROR",
        message: "An unexpected error occurred while fetching languages.",
      });
    }
  };

  /**
   * GET /api/profile/religions
   */
  getActiveReligions = async (_req: Request, res: Response): Promise<void> => {
    try {
      const religions = await this.service.getActiveReligions();
      res.status(200).json({
        success: true,
        message: "Religions retrieved successfully.",
        data: religions,
      });
    } catch (error: any) {
      console.error("[PROFILE CONTROLLER ERROR - getActiveReligions]:", error);
      res.status(500).json({
        success: false,
        code: "INTERNAL_SERVER_ERROR",
        message: "An unexpected error occurred while fetching religions.",
      });
    }
  };

  /**
   * GET /api/profile/communities
   */
  getActiveCommunities = async (req: Request, res: Response): Promise<void> => {
    try {
      const religionId = req.query.religionId as string | undefined;
      const communities = await this.service.getActiveCommunities(religionId);
      res.status(200).json({
        success: true,
        message: "Communities retrieved successfully.",
        data: communities,
      });
    } catch (error: any) {
      console.error("[PROFILE CONTROLLER ERROR - getActiveCommunities]:", error);
      res.status(500).json({
        success: false,
        code: "INTERNAL_SERVER_ERROR",
        message: "An unexpected error occurred while fetching communities.",
      });
    }
  };

  /**
   * GET /api/profile/sub-communities
   */
  getActiveSubCommunities = async (req: Request, res: Response): Promise<void> => {
    try {
      const communityId = req.query.communityId as string | undefined;
      const subCommunities = await this.service.getActiveSubCommunities(communityId);
      res.status(200).json({
        success: true,
        message: "Sub-communities retrieved successfully.",
        data: subCommunities,
      });
    } catch (error: any) {
      console.error("[PROFILE CONTROLLER ERROR - getActiveSubCommunities]:", error);
      res.status(500).json({
        success: false,
        code: "INTERNAL_SERVER_ERROR",
        message: "An unexpected error occurred while fetching sub-communities.",
      });
    }
  };

  /**
   * GET /api/profile/castes
   */
  getActiveCastes = async (req: Request, res: Response): Promise<void> => {
    try {
      const communityId = req.query.communityId as string | undefined;
      const castes = await this.service.getActiveCastes(communityId);
      res.status(200).json({
        success: true,
        message: "Castes retrieved successfully.",
        data: castes,
      });
    } catch (error: any) {
      console.error("[PROFILE CONTROLLER ERROR - getActiveCastes]:", error);
      res.status(500).json({
        success: false,
        code: "INTERNAL_SERVER_ERROR",
        message: "An unexpected error occurred while fetching castes.",
      });
    }
  };

  /**
   * GET /api/profile/sub-castes
   */
  getActiveSubCastes = async (req: Request, res: Response): Promise<void> => {
    try {
      const casteId = req.query.casteId as string | undefined;
      const subCastes = await this.service.getActiveSubCastes(casteId);
      res.status(200).json({
        success: true,
        message: "Sub-castes retrieved successfully.",
        data: subCastes,
      });
    } catch (error: any) {
      console.error("[PROFILE CONTROLLER ERROR - getActiveSubCastes]:", error);
      res.status(500).json({
        success: false,
        code: "INTERNAL_SERVER_ERROR",
        message: "An unexpected error occurred while fetching sub-castes.",
      });
    }
  };

  /**
   * GET /api/profile/gotras
   */
  getActiveGotras = async (req: Request, res: Response): Promise<void> => {
    try {
      const communityId = req.query.communityId as string | undefined;
      const gotras = await this.service.getActiveGotras(communityId);
      res.status(200).json({
        success: true,
        message: "Gotras retrieved successfully.",
        data: gotras,
      });
    } catch (error: any) {
      console.error("[PROFILE CONTROLLER ERROR - getActiveGotras]:", error);
      res.status(500).json({
        success: false,
        code: "INTERNAL_SERVER_ERROR",
        message: "An unexpected error occurred while fetching gotras.",
      });
    }
  };

  /**
   * GET /api/profile/educations
   */
  getActiveEducations = async (_req: Request, res: Response): Promise<void> => {
    try {
      const educations = await this.service.getActiveEducations();
      res.status(200).json({
        success: true,
        message: "Educations retrieved successfully.",
        data: educations,
      });
    } catch (error: any) {
      console.error("[PROFILE CONTROLLER ERROR - getActiveEducations]:", error);
      res.status(500).json({
        success: false,
        code: "INTERNAL_SERVER_ERROR",
        message: "An unexpected error occurred while fetching educations.",
      });
    }
  };

  /**
   * GET /api/profile/specializations
   */
  getActiveSpecializations = async (req: Request, res: Response): Promise<void> => {
    try {
      const educationId = req.query.educationId as string | undefined;
      const specializations = await this.service.getActiveSpecializations(educationId);
      res.status(200).json({
        success: true,
        message: "Specializations retrieved successfully.",
        data: specializations,
      });
    } catch (error: any) {
      console.error("[PROFILE CONTROLLER ERROR - getActiveSpecializations]:", error);
      res.status(500).json({
        success: false,
        code: "INTERNAL_SERVER_ERROR",
        message: "An unexpected error occurred while fetching specializations.",
      });
    }
  };

  /**
   * GET /api/profile/institutions
   */
  getActiveInstitutions = async (req: Request, res: Response): Promise<void> => {
    try {
      const search = typeof req.query.search === "string" ? req.query.search : undefined;
      const limit = typeof req.query.limit === "string" ? parseInt(req.query.limit, 10) : undefined;
      const offset = typeof req.query.offset === "string" ? parseInt(req.query.offset, 10) : undefined;

      const institutions = await this.service.getActiveInstitutions({
        search,
        limit,
        offset,
      });
      res.status(200).json({
        success: true,
        message: "Institutions retrieved successfully.",
        data: institutions,
      });
    } catch (error: any) {
      console.error("[PROFILE CONTROLLER ERROR - getActiveInstitutions]:", error);
      res.status(500).json({
        success: false,
        code: "INTERNAL_SERVER_ERROR",
        message: "An unexpected error occurred while fetching institutions.",
      });
    }
  };

  /**
   * GET /api/profile/employment-statuses
   */
  getActiveEmploymentStatuses = async (_req: Request, res: Response): Promise<void> => {
    try {
      const statuses = await this.service.getActiveEmploymentStatuses();
      res.status(200).json({
        success: true,
        message: "Employment statuses retrieved successfully.",
        data: statuses,
      });
    } catch (error: any) {
      console.error("[PROFILE CONTROLLER ERROR - getActiveEmploymentStatuses]:", error);
      res.status(500).json({
        success: false,
        code: "INTERNAL_SERVER_ERROR",
        message: "An unexpected error occurred while fetching employment statuses.",
      });
    }
  };

  /**
   * GET /api/profile/occupations
   */
  getActiveOccupations = async (req: Request, res: Response): Promise<void> => {
    try {
      const employmentStatusId = req.query.employmentStatusId as string | undefined;
      const occupations = await this.service.getActiveOccupations(employmentStatusId);
      res.status(200).json({
        success: true,
        message: "Occupations retrieved successfully.",
        data: occupations,
      });
    } catch (error: any) {
      console.error("[PROFILE CONTROLLER ERROR - getActiveOccupations]:", error);
      res.status(500).json({
        success: false,
        code: "INTERNAL_SERVER_ERROR",
        message: "An unexpected error occurred while fetching occupations.",
      });
    }
  };

  /**
   * GET /api/profile/:profileId
   * Retrieves sanitized public profile for another candidate.
   * Safe for authenticated users to view without exposing sensitive contact/auth details.
   */
  getPublicProfile = async (req: Request, res: Response): Promise<void> => {
    try {
      const callerUserId = req.user?.userId;
      if (!callerUserId) {
        res.status(401).json({
          success: false,
          code: "UNAUTHORIZED",
          message: "Authentication required.",
        });
        return;
      }

      const { profileId } = req.params;
      if (!profileId) {
        res.status(400).json({
          success: false,
          code: "BAD_REQUEST",
          message: "Profile ID is required.",
        });
        return;
      }

      const result = await this.service.getPublicProfile(profileId, callerUserId);
      if (!result.success) {
        const statusCode = result.code === "PROFILE_NOT_FOUND" ? 404 : 400;
        res.status(statusCode).json(result);
        return;
      }

      res.status(200).json(result);
    } catch (error: any) {
      console.error("[PROFILE CONTROLLER ERROR - getPublicProfile]:", error);
      res.status(500).json({
        success: false,
        code: "INTERNAL_SERVER_ERROR",
        message: "An unexpected error occurred while fetching candidate profile.",
      });
    }
  };
}

export const profileController = new ProfileController();
