import { Request, Response } from "express";
import {
  adminPhotoModerationService,
  AdminPhotoModerationService,
} from "../services/admin-photo-moderation.service";
import { ModerationStatus } from "@prisma/client";

const VALID_MODERATION_STATUSES = new Set([
  "ALL",
  ModerationStatus.PENDING,
  ModerationStatus.APPROVED,
  ModerationStatus.REJECTED,
]);

const VALID_SORTS = new Set(["newest", "oldest"]);

export class AdminPhotoModerationController {
  constructor(
    private service: AdminPhotoModerationService = adminPhotoModerationService
  ) {}

  /**
   * GET /api/admin/photos
   * Retrieves paginated, filtered, searchable photo moderation queue.
   */
  listPhotos = async (req: Request, res: Response): Promise<void> => {
    try {
      let page = 1;
      if (req.query.page !== undefined) {
        const parsed = parseInt(req.query.page as string, 10);
        if (isNaN(parsed) || parsed < 1) {
          res.status(400).json({
            success: false,
            code: "INVALID_PAGE",
            message: "Query parameter 'page' must be a positive integer.",
          });
          return;
        }
        page = parsed;
      }

      let pageSize = 20;
      if (req.query.pageSize !== undefined) {
        const parsed = parseInt(req.query.pageSize as string, 10);
        if (isNaN(parsed) || parsed < 1 || parsed > 100) {
          res.status(400).json({
            success: false,
            code: "INVALID_PAGE_SIZE",
            message: "Query parameter 'pageSize' must be between 1 and 100.",
          });
          return;
        }
        pageSize = parsed;
      }

      let moderationStatus: "ALL" | ModerationStatus | undefined = undefined;
      if (req.query.moderationStatus) {
        const normalized = (req.query.moderationStatus as string).trim().toUpperCase();
        if (!VALID_MODERATION_STATUSES.has(normalized)) {
          res.status(400).json({
            success: false,
            code: "INVALID_MODERATION_STATUS",
            message: `Invalid moderationStatus. Must be one of: ALL, PENDING, APPROVED, REJECTED.`,
          });
          return;
        }
        moderationStatus = normalized as "ALL" | ModerationStatus;
      }

      let sort: "newest" | "oldest" | undefined = undefined;
      if (req.query.sort) {
        const s = (req.query.sort as string).trim().toLowerCase();
        if (!VALID_SORTS.has(s)) {
          res.status(400).json({
            success: false,
            code: "INVALID_SORT",
            message: "Invalid sort option. Must be either 'newest' or 'oldest'.",
          });
          return;
        }
        sort = s as "newest" | "oldest";
      }

      const q = req.query.q ? (req.query.q as string) : undefined;

      const result = await this.service.listPhotos({
        page,
        pageSize,
        q,
        moderationStatus,
        sort,
      });

      res.status(200).json({
        success: true,
        message: "Photo moderation queue retrieved successfully.",
        data: result,
      });
    } catch (error: any) {
      console.error("[ADMIN PHOTO MODERATION CONTROLLER ERROR - listPhotos]:", error);
      res.status(500).json({
        success: false,
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to load photo moderation queue. Please try again.",
      });
    }
  };

  /**
   * GET /api/admin/photos/:photoId
   * Retrieves inspection details for a single photo.
   */
  getPhotoDetail = async (req: Request, res: Response): Promise<void> => {
    try {
      const { photoId } = req.params;
      if (!photoId) {
        res.status(400).json({
          success: false,
          code: "INVALID_PHOTO_ID",
          message: "Photo ID is required.",
        });
        return;
      }

      const photo = await this.service.getPhotoDetail(photoId);
      if (!photo) {
        res.status(404).json({
          success: false,
          code: "PHOTO_NOT_FOUND",
          message: `Photo with ID '${photoId}' not found.`,
        });
        return;
      }

      res.status(200).json({
        success: true,
        message: "Photo details retrieved successfully.",
        data: { photo },
      });
    } catch (error: any) {
      console.error("[ADMIN PHOTO MODERATION CONTROLLER ERROR - getPhotoDetail]:", error);
      res.status(500).json({
        success: false,
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to load photo details. Please try again.",
      });
    }
  };

  /**
   * POST /api/admin/photos/:photoId/approve
   * Approves a photo in the moderation queue.
   */
  approvePhoto = async (req: Request, res: Response): Promise<void> => {
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

      const { photoId } = req.params;
      if (!photoId) {
        res.status(400).json({
          success: false,
          code: "INVALID_PHOTO_ID",
          message: "Photo ID is required.",
        });
        return;
      }

      const result = await this.service.approvePhoto(photoId, adminUserId);

      res.status(result.status).json({
        success: result.success,
        code: result.code,
        message: result.message,
        data: result.photo ? { photo: result.photo } : undefined,
      });
    } catch (error: any) {
      console.error("[ADMIN PHOTO MODERATION CONTROLLER ERROR - approvePhoto]:", error);
      res.status(500).json({
        success: false,
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to approve photo. Please try again.",
      });
    }
  };

  /**
   * POST /api/admin/photos/:photoId/reject
   * Rejects a photo in the moderation queue with a mandatory reason.
   */
  rejectPhoto = async (req: Request, res: Response): Promise<void> => {
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

      const { photoId } = req.params;
      if (!photoId) {
        res.status(400).json({
          success: false,
          code: "INVALID_PHOTO_ID",
          message: "Photo ID is required.",
        });
        return;
      }

      const { reason } = req.body || {};
      if (typeof reason !== "string" || !reason.trim()) {
        res.status(400).json({
          success: false,
          code: "INVALID_REJECTION_REASON",
          message: "Rejection reason is required and cannot be empty.",
        });
        return;
      }

      if (reason.trim().length > 500) {
        res.status(400).json({
          success: false,
          code: "INVALID_REJECTION_REASON",
          message: "Rejection reason cannot exceed 500 characters.",
        });
        return;
      }

      const result = await this.service.rejectPhoto(photoId, adminUserId, reason);

      res.status(result.status).json({
        success: result.success,
        code: result.code,
        message: result.message,
        data: result.photo ? { photo: result.photo } : undefined,
      });
    } catch (error: any) {
      console.error("[ADMIN PHOTO MODERATION CONTROLLER ERROR - rejectPhoto]:", error);
      res.status(500).json({
        success: false,
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to reject photo. Please try again.",
      });
    }
  };
}

export const adminPhotoModerationController = new AdminPhotoModerationController();
