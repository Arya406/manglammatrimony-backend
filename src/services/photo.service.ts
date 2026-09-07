import crypto from "crypto";
import {
  ProfilePhoto,
  PhotoType,
  ModerationStatus,
  ProfileStatus,
} from "@prisma/client";
import { config } from "../config/env";
import { photoRepository, PhotoRepository } from "../repositories/photo.repository";
import { profileRepository, ProfileRepository } from "../repositories/profile.repository";
import {
  StorageProvider,
} from "../providers/storage/StorageProvider.interface";
import { getStorageProvider, defaultStorageProvider, resolvePhotoPublicUrl } from "../providers/storage";
import {
  imageProcessorService,
  ImageProcessorService,
  ImageProcessingError,
  ProcessedImageResult,
} from "./image-processor.service";
import {
  PhotoResponseDto,
  PhotoListResponseDto,
  PhotoErrorCode,
} from "../types/photo";
import { ApiResponse } from "../types/auth";
import { calculateProfileCompletion } from "./profile.completion";

export class PhotoService {
  constructor(
    private photos: PhotoRepository = photoRepository,
    private profiles: ProfileRepository = profileRepository,
    private storage: StorageProvider = getStorageProvider(),
    private imageProcessor: ImageProcessorService = imageProcessorService
  ) {}

  private mapToResponseDto(photo: ProfilePhoto): PhotoResponseDto {
    // In current phase, moderation does not gate users; any PENDING photo is treated/displayed as APPROVED
    const effectiveModerationStatus =
      photo.moderationStatus === ModerationStatus.PENDING
        ? ModerationStatus.APPROVED
        : photo.moderationStatus;

    return {
      id: photo.id,
      profileId: photo.profileId,
      photoType: photo.photoType,
      moderationStatus: effectiveModerationStatus,
      moderationReason: photo.moderationReason,
      sortOrder: photo.sortOrder,
      fileSize: photo.fileSize,
      mimeType: photo.mimeType,
      width: photo.width,
      height: photo.height,
      url: resolvePhotoPublicUrl(photo.storageKey, photo.id, photo.storageProvider),
      createdAt: photo.createdAt,
      updatedAt: photo.updatedAt,
    };
  }

  /**
   * Uploads, safely processes/normalizes, and attaches a photo to the authenticated user's profile.
   */
  async uploadPhoto(
    userId: string,
    file?: Express.Multer.File,
    requestedPhotoType?: PhotoType
  ): Promise<
    ApiResponse<{
      photo: PhotoResponseDto;
      profile: { completionPercentage: number; profileStatus: ProfileStatus };
    }>
  > {
    // 1. Validate file existence
    if (!file || !file.buffer || file.buffer.length === 0) {
      return {
        success: false,
        code: "INVALID_FILE",
        message: "No photo file provided for upload.",
      };
    }

    // 2. Validate file size pre-check
    const maxSizeBytes = config.photo.maxSizeMb * 1024 * 1024;
    if (file.size > maxSizeBytes || file.buffer.length > maxSizeBytes) {
      return {
        success: false,
        code: "FILE_TOO_LARGE",
        message: `Photo size exceeds maximum allowed limit of ${config.photo.maxSizeMb} MB.`,
      };
    }

    // 3. Process, decode, auto-orient EXIF, strip metadata, and normalize to canonical WebP
    let processed: ProcessedImageResult;
    try {
      processed = await this.imageProcessor.processProfileImage(
        file.buffer,
        file.originalname
      );
    } catch (err: any) {
      if (err instanceof ImageProcessingError) {
        return {
          success: false,
          code: err.code as PhotoErrorCode,
          message: err.message,
        };
      }
      console.error("[IMAGE PROCESSING UNEXPECTED ERROR]:", err);
      return {
        success: false,
        code: "IMAGE_PROCESSING_FAILED",
        message: "We couldn't process this photo. Please try another image.",
      };
    }

    // 4. Validate profile existence
    const profile = await this.profiles.findByUserId(userId);
    if (!profile) {
      return {
        success: false,
        code: "PROFILE_NOT_FOUND",
        message: "No profile found for this user account. Please initialize your profile first.",
      };
    }

    // 5. Validate photo count limit
    const currentCount = await this.photos.countPhotosByProfileId(profile.id);
    if (currentCount >= config.photo.maxCount) {
      return {
        success: false,
        code: "PHOTO_LIMIT_REACHED",
        message: `You have reached the maximum allowed limit of ${config.photo.maxCount} photos.`,
      };
    }

    // 6. Determine PhotoType
    let targetPhotoType: PhotoType = PhotoType.ADDITIONAL;
    if (currentCount === 0 || requestedPhotoType === PhotoType.PRIMARY) {
      targetPhotoType = PhotoType.PRIMARY;
    }

    const photoId = `pho_${crypto.randomBytes(12).toString("hex")}`;

    // 7. Upload canonical normalized derivative to storage provider
    let storedMetadata;
    let actualStorageProvider = config.photo.storageProvider;
    try {
      storedMetadata = await this.storage.upload(processed.buffer, {
        profileId: profile.id,
        photoId,
        originalFileName: file.originalname || "photo",
        mimeType: processed.mimeType,
      });
    } catch (storageError) {
      console.error("[STORAGE UPLOAD ERROR]:", storageError);
      // If remote upload (e.g. R2 network timeout in local dev) fails, fallback to local storage
      if (this.storage !== defaultStorageProvider) {
        try {
          console.warn("[STORAGE FALLBACK]: Falling back to local storage provider...");
          storedMetadata = await defaultStorageProvider.upload(processed.buffer, {
            profileId: profile.id,
            photoId,
            originalFileName: file.originalname || "photo",
            mimeType: processed.mimeType,
          });
          actualStorageProvider = "local";
        } catch (fallbackError) {
          console.error("[STORAGE FALLBACK ERROR]:", fallbackError);
          return {
            success: false,
            code: "IMAGE_STORAGE_FAILED",
            message: "Failed to securely store image file. Please try again.",
          };
        }
      } else {
        return {
          success: false,
          code: "IMAGE_STORAGE_FAILED",
          message: "Failed to securely store image file. Please try again.",
        };
      }
    }

    // 8. Save metadata in database with transactional rollback safeguard
    let createdPhoto: ProfilePhoto;
    try {
      createdPhoto = await this.photos.createPhoto({
        profileId: profile.id,
        storageKey: storedMetadata.storageKey,
        storageProvider: actualStorageProvider,
        originalFileName: file.originalname || "photo",
        mimeType: processed.mimeType,
        fileSize: processed.fileSize,
        width: processed.width,
        height: processed.height,
        photoType: targetPhotoType,
        sortOrder: currentCount,
        moderationStatus: ModerationStatus.APPROVED,
      });
    } catch (dbError) {
      console.error("[DATABASE PHOTO CREATION ERROR]:", dbError);
      // Clean up orphaned storage file immediately
      const activeProvider =
        actualStorageProvider === config.photo.storageProvider
          ? this.storage
          : actualStorageProvider === "local"
          ? defaultStorageProvider
          : getStorageProvider(actualStorageProvider);
      await activeProvider.delete(storedMetadata.storageKey).catch((e: unknown) =>
        console.warn("[CLEANUP WARNING]:", e)
      );
      return {
        success: false,
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to record photo metadata. Please try again.",
      };
    }

    // 9. Recalculate profile completion
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
      message: "Photo uploaded successfully.",
      data: {
        photo: this.mapToResponseDto(createdPhoto),
        profile: {
          completionPercentage: newCompletion,
          profileStatus: profile.profileStatus,
        },
      },
    };
  }

  /**
   * Retrieves all photos belonging to the authenticated user.
   */
  async getPhotos(
    userId: string
  ): Promise<ApiResponse<PhotoListResponseDto>> {
    const profile = await this.profiles.findByUserId(userId);
    if (!profile) {
      return {
        success: false,
        code: "PROFILE_NOT_FOUND",
        message: "No profile found for this user account. Please initialize your profile first.",
      };
    }

    const photoList = await this.photos.getPhotosByProfileId(profile.id);
    const dtos = photoList.map((p) => this.mapToResponseDto(p));
    const primary = dtos.find((p) => p.photoType === PhotoType.PRIMARY) || null;

    return {
      success: true,
      message: "Photos retrieved successfully.",
      data: {
        photos: dtos,
        primaryPhoto: primary,
        totalCount: dtos.length,
        maxAllowed: config.photo.maxCount,
      },
    };
  }

  /**
   * Deletes a specific photo belonging to the authenticated user.
   */
  async deletePhoto(
    userId: string,
    photoId: string
  ): Promise<
    ApiResponse<{
      deletedPhotoId: string;
      promotedPrimaryPhotoId: string | null;
      profile: { completionPercentage: number; profileStatus: ProfileStatus };
    }>
  > {
    const profile = await this.profiles.findByUserId(userId);
    if (!profile) {
      return {
        success: false,
        code: "PROFILE_NOT_FOUND",
        message: "No profile found for this user account.",
      };
    }

    const result = await this.photos.deletePhotoForProfile(photoId, profile.id);
    if (!result) {
      return {
        success: false,
        code: "PHOTO_NOT_FOUND",
        message: "Photo not found or does not belong to your profile.",
      };
    }

    // Clean up physical file from storage provider
    const photoProvider = getStorageProvider(result.deletedPhoto.storageProvider);
    await photoProvider.delete(result.deletedPhoto.storageKey).catch((err: unknown) => {
      console.warn(`[STORAGE DELETE WARNING]: Failed to remove file ${result.deletedPhoto.storageKey}:`, err);
    });

    // Recalculate profile completion
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
      message: "Photo deleted successfully.",
      data: {
        deletedPhotoId: photoId,
        promotedPrimaryPhotoId: result.newPrimaryPhoto?.id ?? null,
        profile: {
          completionPercentage: newCompletion,
          profileStatus: profile.profileStatus,
        },
      },
    };
  }

  /**
   * Sets an existing photo as the PRIMARY profile photo.
   */
  async setPrimaryPhoto(
    userId: string,
    photoId: string
  ): Promise<ApiResponse<{ photo: PhotoResponseDto }>> {
    const profile = await this.profiles.findByUserId(userId);
    if (!profile) {
      return {
        success: false,
        code: "PROFILE_NOT_FOUND",
        message: "No profile found for this user account.",
      };
    }

    const photo = await this.photos.findPhotoByIdForProfile(photoId, profile.id);
    if (!photo) {
      return {
        success: false,
        code: "PHOTO_NOT_FOUND",
        message: "Photo not found or does not belong to your profile.",
      };
    }

    if (photo.moderationStatus === ModerationStatus.REJECTED) {
      return {
        success: false,
        code: "PHOTO_REJECTED",
        message: "A rejected photo cannot be set as your primary profile photo.",
      };
    }

    const updated = await this.photos.setPrimaryPhotoForProfile(photoId, profile.id);
    if (!updated) {
      return {
        success: false,
        code: "PHOTO_NOT_FOUND",
        message: "Unable to update primary photo.",
      };
    }

    return {
      success: true,
      message: "Primary photo updated successfully.",
      data: {
        photo: this.mapToResponseDto(updated),
      },
    };
  }

  /**
   * Reorders photos for the authenticated user's profile.
   */
  async reorderPhotos(
    userId: string,
    photoIds: string[]
  ): Promise<ApiResponse<{ photos: PhotoResponseDto[] }>> {
    const profile = await this.profiles.findByUserId(userId);
    if (!profile) {
      return {
        success: false,
        code: "PROFILE_NOT_FOUND",
        message: "No profile found for this user account.",
      };
    }

    if (!photoIds || !Array.isArray(photoIds) || photoIds.length === 0) {
      return {
        success: false,
        code: "INVALID_PHOTO_ORDER",
        message: "Please provide a valid list of photo IDs to reorder.",
      };
    }

    // Check duplicates
    const uniqueIds = new Set(photoIds);
    if (uniqueIds.size !== photoIds.length) {
      return {
        success: false,
        code: "DUPLICATE_PHOTO_IDS",
        message: "Photo IDs list contains duplicate entries.",
      };
    }

    try {
      const reordered = await this.photos.reorderPhotosForProfile(profile.id, photoIds);
      return {
        success: true,
        message: "Photos reordered successfully.",
        data: {
          photos: reordered.map((p) => this.mapToResponseDto(p)),
        },
      };
    } catch (error: any) {
      if (error.message === "INVALID_PHOTO_ORDER") {
        return {
          success: false,
          code: "INVALID_PHOTO_ORDER",
          message: "One or more photo IDs do not belong to your profile.",
        };
      }
      throw error;
    }
  }

  /**
   * Retrieves serving info for photo (direct CDN redirect or local/R2 stream).
   */
  async getPhotoForServing(photoId: string) {
    const photo = await this.photos.findPhotoById(photoId);
    if (!photo) return null;

    if (photo.storageProvider === "r2" && config.photo.r2.publicBaseUrl) {
      return {
        redirectUrl: `${config.photo.r2.publicBaseUrl}/${photo.storageKey}`,
      };
    }

    const provider =
      photo.storageProvider === config.photo.storageProvider
        ? this.storage
        : getStorageProvider(photo.storageProvider);
    const streamResult = await provider.getFileStream(photo.storageKey);
    if (!streamResult) return null;

    return {
      streamResult,
    };
  }

  /**
   * Retrieves the physical file stream for secure photo serving.
   */
  async getPhotoStream(
    photoId: string,
    _userId?: string
  ) {
    const photo = await this.photos.findPhotoById(photoId);
    if (!photo) return null;

    const provider =
      photo.storageProvider === config.photo.storageProvider
        ? this.storage
        : getStorageProvider(photo.storageProvider);
    return provider.getFileStream(photo.storageKey);
  }

  /**
   * Development-only endpoint to approve a pending photo for testing.
   */
  async devApprovePhoto(
    userId: string,
    photoId: string
  ): Promise<
    ApiResponse<{
      photoId: string;
      moderationStatus: ModerationStatus;
    }>
  > {
    // 1. Guard check: Both non-production and DEV_PHOTO_APPROVAL_ENABLED === true must be met
    if (config.nodeEnv === "production" || !config.devPhotoApprovalEnabled) {
      return {
        success: false,
        code: "DEV_FEATURE_DISABLED",
        message: "Development photo approval is disabled.",
      };
    }

    // 2. Validate profile existence
    const profile = await this.profiles.findByUserId(userId);
    if (!profile) {
      return {
        success: false,
        code: "PROFILE_NOT_FOUND",
        message: "No profile found for this user account. Please initialize your profile first.",
      };
    }

    // 3. Find photo and verify ownership
    const photo = await this.photos.findPhotoByIdForProfile(photoId, profile.id);
    if (!photo) {
      return {
        success: false,
        code: "PHOTO_NOT_FOUND",
        message: "Photo not found or does not belong to your profile.",
      };
    }

    // 4. Handle REJECTED state
    if (photo.moderationStatus === ModerationStatus.REJECTED) {
      return {
        success: false,
        code: "PHOTO_REJECTED",
        message: "A rejected photo cannot be approved for development.",
      };
    }

    // 5. Idempotent check if already approved
    if (photo.moderationStatus === ModerationStatus.APPROVED) {
      return {
        success: true,
        message: "Photo is already approved.",
        data: {
          photoId: photo.id,
          moderationStatus: ModerationStatus.APPROVED,
        },
      };
    }

    // 6. Update status to APPROVED
    const updated = await this.photos.updateModerationStatus(
      photoId,
      profile.id,
      ModerationStatus.APPROVED
    );

    return {
      success: true,
      message: "Photo approved for development testing.",
      data: {
        photoId: updated!.id,
        moderationStatus: ModerationStatus.APPROVED,
      },
    };
  }
}

export const photoService = new PhotoService();
