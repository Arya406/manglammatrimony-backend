import { Request, Response } from "express";
import { photoService, PhotoService } from "../services/photo.service";
import { PhotoType } from "@prisma/client";

export class PhotoController {
  constructor(private service: PhotoService = photoService) {}

  /**
   * POST /api/profile/photos
   * Uploads a new photo for the authenticated user.
   */
  uploadPhoto = async (req: Request, res: Response): Promise<void> => {
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

      let requestedPhotoType: PhotoType | undefined;
      if (req.body.photoType) {
        const normalized = req.body.photoType.toString().trim().toUpperCase();
        if (normalized === "PRIMARY" || normalized === "ADDITIONAL") {
          requestedPhotoType = normalized as PhotoType;
        } else {
          res.status(400).json({
            success: false,
            code: "INVALID_PHOTO_TYPE",
            message: "photoType must be either PRIMARY or ADDITIONAL.",
          });
          return;
        }
      }

      const result = await this.service.uploadPhoto(
        userId,
        req.file,
        requestedPhotoType
      );

      if (!result.success) {
        if (result.code === "PROFILE_NOT_FOUND") {
          res.status(404).json(result);
          return;
        }
        res.status(400).json(result);
        return;
      }

      res.status(201).json(result);
    } catch (error: any) {
      console.error("[PHOTO CONTROLLER ERROR - uploadPhoto]:", error);
      res.status(500).json({
        success: false,
        code: "INTERNAL_SERVER_ERROR",
        message: "An unexpected error occurred while uploading your photo. Please try again.",
      });
    }
  };

  /**
   * GET /api/profile/photos
   * Retrieves all photos belonging to the authenticated user.
   */
  getPhotos = async (req: Request, res: Response): Promise<void> => {
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

      const result = await this.service.getPhotos(userId);
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
      console.error("[PHOTO CONTROLLER ERROR - getPhotos]:", error);
      res.status(500).json({
        success: false,
        code: "INTERNAL_SERVER_ERROR",
        message: "An unexpected error occurred while fetching photos. Please try again.",
      });
    }
  };

  /**
   * DELETE /api/profile/photos/:photoId
   * Deletes a specific photo belonging to the authenticated user.
   */
  deletePhoto = async (req: Request, res: Response): Promise<void> => {
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

      const { photoId } = req.params;
      if (!photoId) {
        res.status(400).json({
          success: false,
          code: "VALIDATION_ERROR",
          message: "Photo ID is required.",
        });
        return;
      }

      const result = await this.service.deletePhoto(userId, photoId);
      if (!result.success) {
        if (result.code === "PROFILE_NOT_FOUND" || result.code === "PHOTO_NOT_FOUND") {
          res.status(404).json(result);
          return;
        }
        res.status(400).json(result);
        return;
      }

      res.status(200).json(result);
    } catch (error: any) {
      console.error("[PHOTO CONTROLLER ERROR - deletePhoto]:", error);
      res.status(500).json({
        success: false,
        code: "INTERNAL_SERVER_ERROR",
        message: "An unexpected error occurred while deleting the photo. Please try again.",
      });
    }
  };

  /**
   * PUT /api/profile/photos/:photoId/primary
   * Promotes an existing photo to PRIMARY status.
   */
  setPrimaryPhoto = async (req: Request, res: Response): Promise<void> => {
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

      const { photoId } = req.params;
      if (!photoId) {
        res.status(400).json({
          success: false,
          code: "VALIDATION_ERROR",
          message: "Photo ID is required.",
        });
        return;
      }

      const result = await this.service.setPrimaryPhoto(userId, photoId);
      if (!result.success) {
        if (result.code === "PROFILE_NOT_FOUND" || result.code === "PHOTO_NOT_FOUND") {
          res.status(404).json(result);
          return;
        }
        res.status(400).json(result);
        return;
      }

      res.status(200).json(result);
    } catch (error: any) {
      console.error("[PHOTO CONTROLLER ERROR - setPrimaryPhoto]:", error);
      res.status(500).json({
        success: false,
        code: "INTERNAL_SERVER_ERROR",
        message: "An unexpected error occurred while setting primary photo. Please try again.",
      });
    }
  };

  /**
   * PUT /api/profile/photos/reorder
   * Reorders photos for the authenticated user's profile.
   */
  reorderPhotos = async (req: Request, res: Response): Promise<void> => {
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

      const { photoIds } = req.body;
      if (!photoIds || !Array.isArray(photoIds)) {
        res.status(400).json({
          success: false,
          code: "INVALID_PHOTO_ORDER",
          message: "photoIds array is required.",
        });
        return;
      }

      const result = await this.service.reorderPhotos(userId, photoIds);
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
      console.error("[PHOTO CONTROLLER ERROR - reorderPhotos]:", error);
      res.status(500).json({
        success: false,
        code: "INTERNAL_SERVER_ERROR",
        message: "An unexpected error occurred while reordering photos. Please try again.",
      });
    }
  };

  /**
   * GET /api/profile/photos/:photoId/file
   * Streams the photo file securely.
   */
  servePhotoFile = async (req: Request, res: Response): Promise<void> => {
    try {
      const { photoId } = req.params;
      const fileResult = await this.service.getPhotoStream(photoId);

      if (!fileResult) {
        res.status(404).json({
          success: false,
          code: "PHOTO_NOT_FOUND",
          message: "Requested photo file could not be found.",
        });
        return;
      }

      res.setHeader("Content-Type", fileResult.mimeType);
      res.setHeader("Content-Length", fileResult.fileSize);
      res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
      res.setHeader("Cache-Control", "public, max-age=86400"); // 1 day client cache
      fileResult.stream.pipe(res);
    } catch (error: any) {
      console.error("[PHOTO CONTROLLER ERROR - servePhotoFile]:", error);
      res.status(500).json({
        success: false,
        code: "INTERNAL_SERVER_ERROR",
        message: "Unable to retrieve photo file.",
      });
    }
  };

  /**
   * POST /api/profile/photos/:photoId/dev-approve
   * Development-only endpoint to approve a pending photo for testing.
   */
  devApprovePhoto = async (req: Request, res: Response): Promise<void> => {
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

      const { photoId } = req.params;
      if (!photoId) {
        res.status(400).json({
          success: false,
          code: "INVALID_PARAMS",
          message: "photoId is required.",
        });
        return;
      }

      const result = await this.service.devApprovePhoto(userId, photoId);

      if (!result.success) {
        if (result.code === "DEV_FEATURE_DISABLED") {
          res.status(403).json(result);
          return;
        }
        if (result.code === "PROFILE_NOT_FOUND" || result.code === "PHOTO_NOT_FOUND") {
          res.status(404).json(result);
          return;
        }
        if (result.code === "PHOTO_REJECTED") {
          res.status(400).json(result);
          return;
        }
        res.status(400).json(result);
        return;
      }

      res.status(200).json(result);
    } catch (error: any) {
      console.error("[PHOTO CONTROLLER ERROR - devApprovePhoto]:", error);
      res.status(500).json({
        success: false,
        code: "INTERNAL_SERVER_ERROR",
        message: "An unexpected error occurred while approving photo. Please try again.",
      });
    }
  };
}

export const photoController = new PhotoController();
