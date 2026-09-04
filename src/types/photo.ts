import { PhotoType, ModerationStatus } from "@prisma/client";

export { PhotoType, ModerationStatus };

export interface PhotoResponseDto {
  id: string;
  profileId: string;
  photoType: PhotoType;
  moderationStatus: ModerationStatus;
  moderationReason: string | null;
  sortOrder: number;
  fileSize: number;
  mimeType: string;
  width: number | null;
  height: number | null;
  url: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface PhotoListResponseDto {
  photos: PhotoResponseDto[];
  primaryPhoto: PhotoResponseDto | null;
  totalCount: number;
  maxAllowed: number;
}

export interface ReorderPhotosDto {
  photoIds: string[];
}

export interface UploadPhotoDto {
  photoType?: PhotoType;
}

export interface ImageMetadata {
  width?: number;
  height?: number;
  mimeType: string;
  fileSize: number;
  originalFileName: string;
}

export type PhotoErrorCode =
  | "PROFILE_NOT_FOUND"
  | "PHOTO_NOT_FOUND"
  | "PHOTO_LIMIT_REACHED"
  | "INVALID_FILE"
  | "UNSUPPORTED_FILE_TYPE"
  | "UNSUPPORTED_IMAGE_FORMAT"
  | "FILE_TOO_LARGE"
  | "INVALID_IMAGE"
  | "IMAGE_TOO_SMALL"
  | "IMAGE_TOO_LARGE"
  | "IMAGE_DIMENSIONS_TOO_LARGE"
  | "IMAGE_PROCESSING_FAILED"
  | "IMAGE_STORAGE_FAILED"
  | "PHOTO_REJECTED"
  | "INVALID_PHOTO_TYPE"
  | "INVALID_PHOTO_ORDER"
  | "DUPLICATE_PHOTO_IDS"
  | "UNAUTHORIZED"
  | "VALIDATION_ERROR"
  | "INTERNAL_SERVER_ERROR";
