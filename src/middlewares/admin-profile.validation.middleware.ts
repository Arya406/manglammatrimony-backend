import { Request, Response, NextFunction } from "express";
import {
  validatePersonalDetails,
  validateReligionDetails,
  validateEducationCareerDetails,
  validatePartnerPreferences,
} from "./profile.validation.middleware";
import { ProfileCreatedFor } from "@prisma/client";

const ALLOWED_PROFILE_CREATED_FOR = Object.values(ProfileCreatedFor);

/**
 * Validates that expectedUpdatedAt is strictly present, a string, and a valid ISO 8601 date.
 */
export function validateExpectedUpdatedAt(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const { expectedUpdatedAt } = req.body;

  if (
    !expectedUpdatedAt ||
    typeof expectedUpdatedAt !== "string" ||
    isNaN(Date.parse(expectedUpdatedAt))
  ) {
    res.status(400).json({
      success: false,
      code: "VALIDATION_ERROR",
      message:
        "expectedUpdatedAt is required and must be a valid ISO 8601 date string for optimistic concurrency control.",
    });
    return;
  }

  next();
}

/**
 * Validates ProfileCreatedFor update payload.
 */
export function validateAdminProfileCreatedFor(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const { profileCreatedFor } = req.body;

  if (!profileCreatedFor || typeof profileCreatedFor !== "string") {
    res.status(400).json({
      success: false,
      code: "INVALID_PROFILE_CREATED_FOR",
      message: "Please specify who this profile is being created for.",
    });
    return;
  }

  const normalized = profileCreatedFor.trim().toUpperCase() as ProfileCreatedFor;
  if (!ALLOWED_PROFILE_CREATED_FOR.includes(normalized)) {
    res.status(400).json({
      success: false,
      code: "INVALID_PROFILE_CREATED_FOR",
      message: `Invalid profile created for value. Must be one of: ${ALLOWED_PROFILE_CREATED_FOR.join(
        ", "
      )}`,
    });
    return;
  }

  req.body.profileCreatedFor = normalized;
  next();
}

export {
  validatePersonalDetails as validateAdminPersonalDetails,
  validateReligionDetails as validateAdminReligionDetails,
  validateEducationCareerDetails as validateAdminEducationCareerDetails,
  validatePartnerPreferences as validateAdminPartnerPreferences,
};
