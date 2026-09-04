import { Request, Response } from "express";
import {
  partnerPreferenceService,
  PartnerPreferenceService,
} from "../services/partner-preference.service";

export class PartnerPreferenceController {
  constructor(
    private service: PartnerPreferenceService = partnerPreferenceService
  ) {}

  /**
   * PUT /api/profile/partner-preferences
   * Saves or replaces partner preferences for the authenticated user.
   */
  savePartnerPreferences = async (req: Request, res: Response): Promise<void> => {
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

      const result = await this.service.savePartnerPreferences(userId, req.body);

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
      console.error("[PARTNER PREFERENCE CONTROLLER ERROR - savePartnerPreferences]:", error);
      res.status(500).json({
        success: false,
        code: "INTERNAL_SERVER_ERROR",
        message: "An unexpected error occurred while saving partner preferences. Please try again.",
      });
    }
  };

  /**
   * GET /api/profile/partner-preferences
   * Retrieves partner preferences for the authenticated user.
   */
  getPartnerPreferences = async (req: Request, res: Response): Promise<void> => {
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

      const result = await this.service.getPartnerPreferences(userId);

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
      console.error("[PARTNER PREFERENCE CONTROLLER ERROR - getPartnerPreferences]:", error);
      res.status(500).json({
        success: false,
        code: "INTERNAL_SERVER_ERROR",
        message: "An unexpected error occurred while fetching partner preferences. Please try again.",
      });
    }
  };
}

export const partnerPreferenceController = new PartnerPreferenceController();
