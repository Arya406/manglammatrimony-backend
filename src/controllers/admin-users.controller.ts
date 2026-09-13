import { Request, Response } from "express";
import { adminUsersService, AdminListUsersOptions } from "../services/admin-users.service";
import { photoService } from "../services/photo.service";
import { UserRole, UserStatus, AccountActivationStatus, ProfileCreatedFor, PhotoType } from "@prisma/client";

export class AdminUsersController {
  /**
   * GET /api/admin/users
   */
  async listUsers(req: Request, res: Response): Promise<void> {
    try {
      const options: AdminListUsersOptions = {};

      // 1. Page validation
      if (req.query.page !== undefined) {
        const pageNum = parseInt(req.query.page as string, 10);
        if (isNaN(pageNum) || pageNum < 1) {
          res.status(400).json({
            success: false,
            code: "INVALID_PAGE",
            message: "Page parameter must be a positive integer greater than or equal to 1.",
          });
          return;
        }
        options.page = pageNum;
      }

      // 2. PageSize validation
      if (req.query.pageSize !== undefined) {
        const pageSizeNum = parseInt(req.query.pageSize as string, 10);
        if (isNaN(pageSizeNum) || pageSizeNum < 1 || pageSizeNum > 100) {
          res.status(400).json({
            success: false,
            code: "INVALID_PAGE_SIZE",
            message: "Page size must be a positive integer between 1 and 100.",
          });
          return;
        }
        options.pageSize = pageSizeNum;
      }

      // 3. Status enum validation
      if (req.query.status !== undefined && req.query.status !== "ALL") {
        const statusVal = req.query.status as string;
        if (!Object.values(UserStatus).includes(statusVal as UserStatus)) {
          res.status(400).json({
            success: false,
            code: "INVALID_STATUS",
            message: `Invalid user status: "${statusVal}". Allowed: ${Object.values(UserStatus).join(", ")}.`,
          });
          return;
        }
        options.status = statusVal as UserStatus;
      }

      // 4. Role enum validation
      if (req.query.role !== undefined && req.query.role !== "ALL") {
        const roleVal = req.query.role as string;
        if (!Object.values(UserRole).includes(roleVal as UserRole)) {
          res.status(400).json({
            success: false,
            code: "INVALID_ROLE",
            message: `Invalid user role: "${roleVal}". Allowed: ${Object.values(UserRole).join(", ")}.`,
          });
          return;
        }
        options.role = roleVal as UserRole;
      }

      // 4.5. Activation status validation
      if (req.query.activationStatus !== undefined && req.query.activationStatus !== "ALL") {
        const actVal = req.query.activationStatus as string;
        if (!Object.values(AccountActivationStatus).includes(actVal as AccountActivationStatus)) {
          res.status(400).json({
            success: false,
            code: "INVALID_ACTIVATION_STATUS",
            message: `Invalid activation status: "${actVal}". Allowed: ${Object.values(AccountActivationStatus).join(", ")}.`,
          });
          return;
        }
        options.activationStatus = actVal as AccountActivationStatus;
      }

      // 5. Email verification validation
      if (req.query.emailVerified !== undefined && req.query.emailVerified !== "ALL") {
        const evVal = req.query.emailVerified as string;
        if (evVal !== "true" && evVal !== "false") {
          res.status(400).json({
            success: false,
            code: "INVALID_VERIFICATION_FILTER",
            message: "emailVerified parameter must be 'true' or 'false'.",
          });
          return;
        }
        options.emailVerified = evVal === "true";
      }

      // 6. Phone verification validation
      if (req.query.phoneVerified !== undefined && req.query.phoneVerified !== "ALL") {
        const pvVal = req.query.phoneVerified as string;
        if (pvVal !== "true" && pvVal !== "false") {
          res.status(400).json({
            success: false,
            code: "INVALID_VERIFICATION_FILTER",
            message: "phoneVerified parameter must be 'true' or 'false'.",
          });
          return;
        }
        options.phoneVerified = pvVal === "true";
      }

      // 7. Sort validation
      if (req.query.sort !== undefined) {
        const sortVal = req.query.sort as string;
        const allowedSorts = ["newest", "oldest", "name_asc", "name_desc"];
        if (!allowedSorts.includes(sortVal)) {
          res.status(400).json({
            success: false,
            code: "INVALID_SORT",
            message: `Invalid sort parameter: "${sortVal}". Allowed: ${allowedSorts.join(", ")}.`,
          });
          return;
        }
        options.sort = sortVal as any;
      }

      // 8. Search query string
      if (typeof req.query.q === "string") {
        options.q = req.query.q;
      }

      const result = await adminUsersService.listUsers(options);

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      console.error("[ADMIN USERS ERROR - listUsers]:", error);
      res.status(500).json({
        success: false,
        code: "INTERNAL_SERVER_ERROR",
        message: "An unexpected error occurred while retrieving users.",
      });
    }
  }

  /**
   * GET /api/admin/users/:userId
   */
  async getUserDetail(req: Request, res: Response): Promise<void> {
    try {
      const { userId } = req.params;

      if (!userId || !userId.trim()) {
        res.status(400).json({
          success: false,
          code: "INVALID_USER_ID",
          message: "User ID parameter is required.",
        });
        return;
      }

      const user = await adminUsersService.getUserDetail(userId.trim());

      if (!user) {
        res.status(404).json({
          success: false,
          code: "NOT_FOUND",
          message: "User account not found.",
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: { user },
      });
    } catch (error) {
      console.error("[ADMIN USERS ERROR - getUserDetail]:", error);
      res.status(500).json({
        success: false,
        code: "INTERNAL_SERVER_ERROR",
        message: "An unexpected error occurred while retrieving user details.",
      });
    }
  }

  /**
   * POST /api/admin/users/:userId/suspend
   */
  async suspendUser(req: Request, res: Response): Promise<void> {
    try {
      const adminUserId = req.admin?.id || (req as any).user?.userId;
      if (!adminUserId) {
        res.status(401).json({
          success: false,
          code: "UNAUTHORIZED",
          message: "Administrative authentication required.",
        });
        return;
      }

      const { userId } = req.params;
      if (!userId || !userId.trim()) {
        res.status(400).json({
          success: false,
          code: "INVALID_USER_ID",
          message: "User ID parameter is required.",
        });
        return;
      }

      const { currentStatus } = req.body || {};
      const result = await adminUsersService.updateUserStatus({
        userId: userId.trim(),
        desiredStatus: UserStatus.SUSPENDED,
        adminUserId,
        expectedCurrentStatus: currentStatus,
      });

      res.status(result.status).json({
        success: result.success,
        code: result.code,
        message: result.message,
        data: result.user ? { user: result.user } : undefined,
      });
    } catch (error) {
      console.error("[ADMIN USERS ERROR - suspendUser]:", error);
      res.status(500).json({
        success: false,
        code: "INTERNAL_SERVER_ERROR",
        message: "An unexpected error occurred while suspending the user.",
      });
    }
  }

  /**
   * POST /api/admin/users/:userId/block
   */
  async blockUser(req: Request, res: Response): Promise<void> {
    try {
      const adminUserId = req.admin?.id || (req as any).user?.userId;
      if (!adminUserId) {
        res.status(401).json({
          success: false,
          code: "UNAUTHORIZED",
          message: "Administrative authentication required.",
        });
        return;
      }

      const { userId } = req.params;
      if (!userId || !userId.trim()) {
        res.status(400).json({
          success: false,
          code: "INVALID_USER_ID",
          message: "User ID parameter is required.",
        });
        return;
      }

      const { currentStatus } = req.body || {};
      const result = await adminUsersService.updateUserStatus({
        userId: userId.trim(),
        desiredStatus: UserStatus.BLOCKED,
        adminUserId,
        expectedCurrentStatus: currentStatus,
      });

      res.status(result.status).json({
        success: result.success,
        code: result.code,
        message: result.message,
        data: result.user ? { user: result.user } : undefined,
      });
    } catch (error) {
      console.error("[ADMIN USERS ERROR - blockUser]:", error);
      res.status(500).json({
        success: false,
        code: "INTERNAL_SERVER_ERROR",
        message: "An unexpected error occurred while blocking the user.",
      });
    }
  }

  /**
   * POST /api/admin/users/:userId/restore
   */
  async restoreUser(req: Request, res: Response): Promise<void> {
    try {
      const adminUserId = req.admin?.id || (req as any).user?.userId;
      if (!adminUserId) {
        res.status(401).json({
          success: false,
          code: "UNAUTHORIZED",
          message: "Administrative authentication required.",
        });
        return;
      }

      const { userId } = req.params;
      if (!userId || !userId.trim()) {
        res.status(400).json({
          success: false,
          code: "INVALID_USER_ID",
          message: "User ID parameter is required.",
        });
        return;
      }

      const { currentStatus } = req.body || {};
      const result = await adminUsersService.updateUserStatus({
        userId: userId.trim(),
        desiredStatus: UserStatus.ACTIVE,
        adminUserId,
        expectedCurrentStatus: currentStatus,
      });

      res.status(result.status).json({
        success: result.success,
        code: result.code,
        message: result.message,
        data: result.user ? { user: result.user } : undefined,
      });
    } catch (error) {
      console.error("[ADMIN USERS ERROR - restoreUser]:", error);
      res.status(500).json({
        success: false,
        code: "INTERNAL_SERVER_ERROR",
        message: "An unexpected error occurred while restoring the user.",
      });
    }
  }

  /**
   * POST /api/admin/users/:userId/activate (alias of restore)
   */
  async activateUser(req: Request, res: Response): Promise<void> {
    return this.restoreUser(req, res);
  }

  /**
   * POST /api/admin/users
   * Admin creates a user account on behalf of someone.
   */
  async createUser(req: Request, res: Response): Promise<void> {
    try {
      const adminUserId = req.admin?.id || (req as any).user?.userId;
      if (!adminUserId) {
        res.status(401).json({
          success: false,
          code: "UNAUTHORIZED",
          message: "Administrative authentication required.",
        });
        return;
      }

      const { email, firstName, lastName, gender, profileCreatedFor } = req.body || {};

      if (!email || typeof email !== "string" || !email.trim()) {
        res.status(400).json({
          success: false,
          code: "INVALID_EMAIL",
          message: "Email address is required.",
        });
        return;
      }

      if (profileCreatedFor && !Object.values(ProfileCreatedFor).includes(profileCreatedFor)) {
        res.status(400).json({
          success: false,
          code: "INVALID_PROFILE_CREATED_FOR",
          message: `Invalid profileCreatedFor: "${profileCreatedFor}". Allowed: ${Object.values(ProfileCreatedFor).join(", ")}.`,
        });
        return;
      }

      const result = await adminUsersService.createAdminUser(adminUserId, {
        email: email.trim(),
        firstName: typeof firstName === "string" ? firstName.trim() : undefined,
        lastName: typeof lastName === "string" ? lastName.trim() : undefined,
        gender: typeof gender === "string" ? gender.trim() : undefined,
        profileCreatedFor,
      });

      res.status(result.status).json({
        success: result.success,
        code: result.code,
        message: result.message,
        warning: result.warning,
        data: result.user
          ? {
              user: result.user,
              debugOtp: result.debugOtp,
            }
          : undefined,
      });
    } catch (error) {
      console.error("[ADMIN USERS ERROR - createUser]:", error);
      res.status(500).json({
        success: false,
        code: "INTERNAL_SERVER_ERROR",
        message: "An unexpected error occurred while creating the user.",
      });
    }
  }

  /**
   * POST /api/admin/users/:userId/activation/resend
   * Admin triggers resending an activation email.
   */
  async resendActivation(req: Request, res: Response): Promise<void> {
    try {
      const adminUserId = req.admin?.id || (req as any).user?.userId;
      if (!adminUserId) {
        res.status(401).json({
          success: false,
          code: "UNAUTHORIZED",
          message: "Administrative authentication required.",
        });
        return;
      }

      const { userId } = req.params;
      if (!userId || !userId.trim()) {
        res.status(400).json({
          success: false,
          code: "INVALID_USER_ID",
          message: "User ID parameter is required.",
        });
        return;
      }

      const result = await adminUsersService.resendActivationEmail(adminUserId, userId.trim());

      res.status(result.status).json({
        success: result.success,
        code: result.code,
        message: result.message,
        data: result.debugOtp ? { debugOtp: result.debugOtp } : undefined,
      });
    } catch (error) {
      console.error("[ADMIN USERS ERROR - resendActivation]:", error);
      res.status(500).json({
        success: false,
        code: "INTERNAL_SERVER_ERROR",
        message: "An unexpected error occurred while resending the activation email.",
      });
    }
  }

  /**
   * POST /api/admin/users/:userId/activation/verify-otp
   * Admin enters the 6-digit OTP received by the user and immediately activates the user account.
   */
  async verifyActivationOtp(req: Request, res: Response): Promise<void> {
    try {
      const adminUserId = req.admin?.id || (req as any).user?.userId;
      if (!adminUserId) {
        res.status(401).json({
          success: false,
          code: "UNAUTHORIZED",
          message: "Administrative authentication required.",
        });
        return;
      }

      const { userId } = req.params;
      if (!userId || !userId.trim()) {
        res.status(400).json({
          success: false,
          code: "INVALID_USER_ID",
          message: "User ID parameter is required.",
        });
        return;
      }

      const { otp } = req.body || {};
      if (!otp || typeof otp !== "string" || !/^\d{6}$/.test(otp.trim())) {
        res.status(400).json({
          success: false,
          code: "VALIDATION_ERROR",
          message: "A valid 6-digit numeric verification code is required.",
        });
        return;
      }

      const result = await adminUsersService.verifyAdminActivationOtp(
        adminUserId,
        userId.trim(),
        otp.trim()
      );

      res.status(result.status).json({
        success: result.success,
        code: result.code,
        message: result.message,
        data: result.data,
      });
    } catch (error) {
      console.error("[ADMIN USERS ERROR - verifyActivationOtp]:", error);
      res.status(500).json({
        success: false,
        code: "INTERNAL_SERVER_ERROR",
        message: "An unexpected error occurred while verifying activation code.",
      });
    }
  }

  /**
   * DELETE /api/admin/users/:userId
   * Permanently deletes a user account and all owned data.
   */
  async permanentlyDeleteUser(req: Request, res: Response): Promise<void> {
    try {
      const adminUserId = req.admin?.id || (req as any).user?.userId;
      if (!adminUserId) {
        res.status(401).json({
          success: false,
          code: "UNAUTHORIZED",
          message: "Administrative authentication required.",
        });
        return;
      }

      const { userId } = req.params;
      if (!userId || !userId.trim()) {
        res.status(400).json({
          success: false,
          code: "INVALID_USER_ID",
          message: "User ID parameter is required.",
        });
        return;
      }

      const { confirmation } = req.body || {};
      if (confirmation !== "DELETE") {
        res.status(400).json({
          success: false,
          code: "VALIDATION_ERROR",
          message: "Explicit confirmation 'DELETE' is required to permanently delete an account.",
        });
        return;
      }

      const result = await adminUsersService.permanentlyDeleteUser(
        adminUserId,
        userId.trim(),
        confirmation
      );

      res.status(result.status).json({
        success: result.success,
        code: result.code,
        message: result.message,
        data: result.data,
      });
    } catch (error) {
      console.error("[ADMIN USERS ERROR - permanentlyDeleteUser]:", error);
      res.status(500).json({
        success: false,
        code: "INTERNAL_SERVER_ERROR",
        message: "An unexpected error occurred while permanently deleting the user account.",
      });
    }
  }

  /**
   * POST /api/admin/users/:userId/profile/photos
   * Allows an authenticated administrator to upload and attach photos directly to a user's matrimonial profile.
   */
  async uploadProfilePhoto(req: Request, res: Response): Promise<void> {
    try {
      const adminUserId = req.admin?.id || (req as any).user?.userId;
      if (!adminUserId) {
        res.status(401).json({
          success: false,
          code: "UNAUTHORIZED",
          message: "Administrative authentication required.",
        });
        return;
      }

      const { userId } = req.params;
      if (!userId || !userId.trim()) {
        res.status(400).json({
          success: false,
          code: "INVALID_USER_ID",
          message: "Target user ID parameter is required.",
        });
        return;
      }

      const file = req.file;
      if (!file) {
        res.status(400).json({
          success: false,
          code: "INVALID_FILE",
          message: "No photo file provided for upload.",
        });
        return;
      }

      let requestedPhotoType: PhotoType | undefined = undefined;
      const isPrimaryParam = req.body?.isPrimary;
      if (isPrimaryParam === true || isPrimaryParam === "true") {
        requestedPhotoType = PhotoType.PRIMARY;
      } else if (isPrimaryParam === false || isPrimaryParam === "false") {
        requestedPhotoType = PhotoType.ADDITIONAL;
      } else if (req.body?.photoType) {
        const pt = String(req.body.photoType).trim().toUpperCase();
        if (pt === "PRIMARY") {
          requestedPhotoType = PhotoType.PRIMARY;
        } else if (pt === "ADDITIONAL") {
          requestedPhotoType = PhotoType.ADDITIONAL;
        }
      }

      const result = await photoService.adminUploadPhoto(
        adminUserId,
        userId.trim(),
        file,
        requestedPhotoType
      );

      res.status(result.status).json({
        success: result.success,
        code: result.code,
        message: result.message,
        data: result.data,
      });
    } catch (error) {
      console.error("[ADMIN USERS ERROR - uploadProfilePhoto]:", error);
      res.status(500).json({
        success: false,
        code: "INTERNAL_SERVER_ERROR",
        message: "An unexpected error occurred while uploading profile photo.",
      });
    }
  }

  /**
   * POST /api/admin/users/:userId/profile/activate
   * Admin-side publication of a 100% complete matrimonial profile.
   */
  async activateProfile(req: Request, res: Response): Promise<void> {
    try {
      const adminUserId = req.admin?.id || (req as any).user?.userId;
      if (!adminUserId) {
        res.status(401).json({
          success: false,
          code: "UNAUTHORIZED",
          message: "Administrative authentication required.",
        });
        return;
      }

      const { userId } = req.params;
      if (!userId || typeof userId !== "string" || !userId.trim()) {
        res.status(400).json({
          success: false,
          code: "VALIDATION_ERROR",
          message: "User ID is required.",
        });
        return;
      }

      const result = await adminUsersService.activateUserProfile(adminUserId, userId.trim());

      res.status(result.status).json({
        success: result.success,
        code: result.code,
        message: result.message,
        ...(result.data ? { data: result.data } : {}),
        ...(result.error ? { error: result.error } : {}),
      });
    } catch (error) {
      console.error("[ADMIN USERS CONTROLLER ERROR - activateProfile]:", error);
      res.status(500).json({
        success: false,
        code: "INTERNAL_SERVER_ERROR",
        message: "An unexpected error occurred while activating and publishing profile.",
      });
    }
  }
}

export const adminUsersController = new AdminUsersController();
