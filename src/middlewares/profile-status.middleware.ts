import { Request, Response, NextFunction } from "express";
import { prisma } from "../config/database";
import { ProfileStatus } from "@prisma/client";

/**
 * Centralized authorization middleware enforcing profile lifecycle permissions.
 *
 * ACTIVE + ACTIVE User -> next()
 * IN_REVIEW -> 403 PROFILE_UNDER_REVIEW
 * INCOMPLETE -> 403 PROFILE_INCOMPLETE
 * BLOCKED -> 403 ACCOUNT_BLOCKED
 * SUSPENDED -> 403 ACCOUNT_SUSPENDED
 */
export async function requireActiveProfile(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const userId = req.user?.userId;

  if (!userId) {
    res.status(401).json({
      success: false,
      code: "UNAUTHORIZED",
      message: "Authentication required. Please provide a valid session token.",
    });
    return;
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        status: true,
        profile: {
          select: {
            id: true,
            profileStatus: true,
          },
        },
      },
    });

    if (!user) {
      res.status(401).json({
        success: false,
        code: "UNAUTHORIZED",
        message: "User session is invalid. Please log in again.",
      });
      return;
    }

    // 1. Account status validation
    if (user.status === "BLOCKED") {
      res.status(403).json({
        success: false,
        code: "ACCOUNT_BLOCKED",
        message: "Your account has been blocked. Please contact support.",
      });
      return;
    }

    if (user.status === "SUSPENDED") {
      res.status(403).json({
        success: false,
        code: "ACCOUNT_SUSPENDED",
        message: "Your account is currently suspended. Please contact support.",
      });
      return;
    }

    if (user.status === "DELETED") {
      res.status(403).json({
        success: false,
        code: "ACCOUNT_DELETED",
        message: "This account is no longer available.",
      });
      return;
    }

    // 2. Profile existence & status validation
    if (!user.profile) {
      res.status(403).json({
        success: false,
        code: "PROFILE_INCOMPLETE",
        message: "Please complete and submit your profile before accessing discovery and messaging features.",
      });
      return;
    }

    if (user.profile.profileStatus === ProfileStatus.IN_REVIEW) {
      res.status(403).json({
        success: false,
        code: "PROFILE_UNDER_REVIEW",
        message: "Your profile is currently under review. Discovery, matching, and messaging features will be available once your profile is approved.",
      });
      return;
    }

    if (user.profile.profileStatus === ProfileStatus.INCOMPLETE) {
      res.status(403).json({
        success: false,
        code: "PROFILE_INCOMPLETE",
        message: "Please complete and submit your profile before accessing discovery and messaging features.",
      });
      return;
    }

    if (user.profile.profileStatus === ProfileStatus.REJECTED) {
      res.status(403).json({
        success: false,
        code: "PROFILE_REJECTED",
        message: "Your profile was rejected. Please review and update your profile details.",
      });
      return;
    }

    if (user.profile.profileStatus === ProfileStatus.ACTIVE && user.status === "ACTIVE") {
      next();
      return;
    }

    res.status(403).json({
      success: false,
      code: "PROFILE_NOT_ACTIVE",
      message: "An active verified profile is required to access this feature.",
    });
  } catch (error) {
    console.error("[AUTHORIZATION ERROR] requireActiveProfile failure:", error);
    res.status(500).json({
      success: false,
      code: "INTERNAL_SERVER_ERROR",
      message: "Failed to verify profile authorization. Please try again.",
    });
  }
}
