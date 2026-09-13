import { prisma } from "../config/database";
import { ModerationStatus, PhotoType, Prisma } from "@prisma/client";
import { resolvePhotoPublicUrl } from "../providers/storage";
import { maskPhoneNumber } from "./admin-users.service";

export interface AdminPhotoListOptions {
  page?: number;
  pageSize?: number;
  q?: string;
  moderationStatus?: "ALL" | ModerationStatus;
  sort?: "newest" | "oldest";
}

export interface AdminPhotoListItem {
  id: string;
  url: string;
  moderationStatus: ModerationStatus;
  moderationReason: string | null;
  moderatedAt: Date | null;
  moderatedByUserId: string | null;
  photoType: PhotoType;
  isPrimary: boolean;
  sortOrder: number;
  width: number | null;
  height: number | null;
  fileSize: number;
  mimeType: string;
  createdAt: Date;
  updatedAt: Date;
  profile: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    gender: string | null;
    city: string | null;
    state: string | null;
    profileStatus: string;
    completionPercentage: number;
  };
  user: {
    id: string;
    email: string | null;
    maskedPhone: string | null;
    status: string;
  };
}

export interface AdminPhotoModerationStats {
  total: number;
  pending: number;
  approved: number;
  rejected: number;
}

export interface AdminPhotoListResponse {
  photos: AdminPhotoListItem[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };
  stats: AdminPhotoModerationStats;
}

export interface AdminPhotoDetail extends AdminPhotoListItem {
  moderator: {
    id: string;
    email: string | null;
  } | null;
}

export interface ModerationMutationResult {
  success: boolean;
  status: 200 | 400 | 404 | 409;
  code?: string;
  message: string;
  photo?: AdminPhotoDetail;
}

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class AdminPhotoModerationService {
  /**
   * Retrieves paginated, filtered, searchable list of photos in moderation queue.
   */
  async listPhotos(options: AdminPhotoListOptions): Promise<AdminPhotoListResponse> {
    const page = Math.max(1, options.page || 1);
    const pageSize = Math.min(100, Math.max(1, options.pageSize || 20));
    const skip = (page - 1) * pageSize;

    const where: Prisma.ProfilePhotoWhereInput = {};

    // 1. Moderation Status Filter
    if (options.moderationStatus && options.moderationStatus !== "ALL") {
      where.moderationStatus = options.moderationStatus;
    }

    // 2. Search query (email, phone, first name, last name, profileId, photoId)
    if (options.q && options.q.trim()) {
      const query = options.q.trim();
      const orConditions: Prisma.ProfilePhotoWhereInput[] = [
        {
          profile: {
            user: {
              email: { contains: query, mode: "insensitive" },
            },
          },
        },
        {
          profile: {
            user: {
              phone: { contains: query, mode: "insensitive" },
            },
          },
        },
        {
          profile: {
            personalDetails: {
              firstName: { contains: query, mode: "insensitive" },
            },
          },
        },
        {
          profile: {
            personalDetails: {
              lastName: { contains: query, mode: "insensitive" },
            },
          },
        },
      ];

      // If query is valid UUID format, match directly against photo id or profile id
      if (UUID_REGEX.test(query)) {
        orConditions.push({ id: query });
        orConditions.push({ profileId: query });
      }

      where.OR = orConditions;
    }

    // 3. Deterministic sort order
    let orderBy: Prisma.ProfilePhotoOrderByWithRelationInput[];
    switch (options.sort) {
      case "oldest":
        orderBy = [{ createdAt: "asc" }, { id: "asc" }];
        break;
      case "newest":
      default:
        orderBy = [{ createdAt: "desc" }, { id: "desc" }];
        break;
    }

    // 4. Parallel transaction: count, findMany, and real distribution counts
    const [total, photos, pendingCount, approvedCount, rejectedCount] = await prisma.$transaction([
      prisma.profilePhoto.count({ where }),
      prisma.profilePhoto.findMany({
        where,
        skip,
        take: pageSize,
        orderBy,
        include: {
          profile: {
            select: {
              id: true,
              profileStatus: true,
              completionPercentage: true,
              personalDetails: {
                select: {
                  firstName: true,
                  lastName: true,
                  gender: true,
                  city: true,
                  state: true,
                },
              },
              user: {
                select: {
                  id: true,
                  email: true,
                  phone: true,
                  status: true,
                },
              },
            },
          },
        },
      }),
      prisma.profilePhoto.count({ where: { moderationStatus: ModerationStatus.PENDING } }),
      prisma.profilePhoto.count({ where: { moderationStatus: ModerationStatus.APPROVED } }),
      prisma.profilePhoto.count({ where: { moderationStatus: ModerationStatus.REJECTED } }),
    ]);

    const totalPages = Math.ceil(total / pageSize);
    const allPhotosCount = pendingCount + approvedCount + rejectedCount;

    const formattedPhotos: AdminPhotoListItem[] = photos.map((p) => {
      const personal = p.profile?.personalDetails;
      const user = p.profile?.user;

      return {
        id: p.id,
        url: resolvePhotoPublicUrl(p.storageKey, p.id, p.storageProvider),
        moderationStatus: p.moderationStatus,
        moderationReason: p.moderationReason,
        moderatedAt: p.moderatedAt,
        moderatedByUserId: p.moderatedByUserId,
        photoType: p.photoType,
        isPrimary: p.photoType === PhotoType.PRIMARY,
        sortOrder: p.sortOrder,
        width: p.width,
        height: p.height,
        fileSize: p.fileSize,
        mimeType: p.mimeType,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
        profile: {
          id: p.profile.id,
          firstName: personal?.firstName || null,
          lastName: personal?.lastName || null,
          gender: personal?.gender || null,
          city: personal?.city || null,
          state: personal?.state || null,
          profileStatus: p.profile.profileStatus,
          completionPercentage: p.profile.completionPercentage,
        },
        user: {
          id: user?.id || "",
          email: user?.email || null,
          maskedPhone: maskPhoneNumber(user?.phone),
          status: user?.status || "ACTIVE",
        },
      };
    });

    return {
      photos: formattedPhotos,
      pagination: {
        page,
        pageSize,
        total,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
      stats: {
        total: allPhotosCount,
        pending: pendingCount,
        approved: approvedCount,
        rejected: rejectedCount,
      },
    };
  }

  /**
   * Retrieves full read-only inspection details for a single photo.
   */
  async getPhotoDetail(photoId: string): Promise<AdminPhotoDetail | null> {
    const photo = await prisma.profilePhoto.findUnique({
      where: { id: photoId },
      include: {
        profile: {
          select: {
            id: true,
            profileStatus: true,
            completionPercentage: true,
            personalDetails: {
              select: {
                firstName: true,
                lastName: true,
                gender: true,
                city: true,
                state: true,
              },
            },
            user: {
              select: {
                id: true,
                email: true,
                phone: true,
                status: true,
              },
            },
          },
        },
        moderatedByUser: {
          select: {
            id: true,
            email: true,
          },
        },
      },
    });

    if (!photo) return null;

    const personal = photo.profile?.personalDetails;
    const user = photo.profile?.user;

    return {
      id: photo.id,
      url: resolvePhotoPublicUrl(photo.storageKey, photo.id, photo.storageProvider),
      moderationStatus: photo.moderationStatus,
      moderationReason: photo.moderationReason,
      moderatedAt: photo.moderatedAt,
      moderatedByUserId: photo.moderatedByUserId,
      photoType: photo.photoType,
      isPrimary: photo.photoType === PhotoType.PRIMARY,
      sortOrder: photo.sortOrder,
      width: photo.width,
      height: photo.height,
      fileSize: photo.fileSize,
      mimeType: photo.mimeType,
      createdAt: photo.createdAt,
      updatedAt: photo.updatedAt,
      profile: {
        id: photo.profile.id,
        firstName: personal?.firstName || null,
        lastName: personal?.lastName || null,
        gender: personal?.gender || null,
        city: personal?.city || null,
        state: personal?.state || null,
        profileStatus: photo.profile.profileStatus,
        completionPercentage: photo.profile.completionPercentage,
      },
      user: {
        id: user?.id || "",
        email: user?.email || null,
        maskedPhone: maskPhoneNumber(user?.phone),
        status: user?.status || "ACTIVE",
      },
      moderator: photo.moderatedByUser
        ? {
            id: photo.moderatedByUser.id,
            email: photo.moderatedByUser.email,
          }
        : null,
    };
  }

  /**
   * Approves a photo awaiting moderation.
   * Concurrency-safe: only transitions PENDING photos, returns idempotent success for already APPROVED photos.
   */
  async approvePhoto(
    photoId: string,
    adminUserId: string
  ): Promise<ModerationMutationResult> {
    const existing = await prisma.profilePhoto.findUnique({
      where: { id: photoId },
    });

    if (!existing) {
      return {
        success: false,
        status: 404,
        code: "PHOTO_NOT_FOUND",
        message: "Photo not found.",
      };
    }

    // 1. Idempotency check: Already approved
    if (existing.moderationStatus === ModerationStatus.APPROVED) {
      const detail = await this.getPhotoDetail(photoId);
      return {
        success: true,
        status: 200,
        message: "Photo is already approved.",
        photo: detail || undefined,
      };
    }

    // 2. Conflict check: Photo was already rejected by another moderator
    if (existing.moderationStatus === ModerationStatus.REJECTED) {
      return {
        success: false,
        status: 409,
        code: "MODERATION_CONFLICT",
        message: "Photo has already been rejected and cannot be approved directly.",
      };
    }

    // 3. Atomic conditional transition from PENDING -> APPROVED
    const updateResult = await prisma.profilePhoto.updateMany({
      where: {
        id: photoId,
        moderationStatus: ModerationStatus.PENDING,
      },
      data: {
        moderationStatus: ModerationStatus.APPROVED,
        moderationReason: null,
        moderatedAt: new Date(),
        moderatedByUserId: adminUserId,
      },
    });

    if (updateResult.count === 0) {
      // Race condition caught: another concurrent action modified the state
      const current = await this.getPhotoDetail(photoId);
      return {
        success: false,
        status: 409,
        code: "MODERATION_CONFLICT",
        message: `Photo status was updated concurrently to ${current?.moderationStatus}.`,
        photo: current || undefined,
      };
    }

    const updatedDetail = await this.getPhotoDetail(photoId);
    return {
      success: true,
      status: 200,
      message: "Photo approved successfully.",
      photo: updatedDetail || undefined,
    };
  }

  /**
   * Rejects a photo with a mandatory reason.
   * Concurrency-safe: preserves physical image storage, records rejection reason and audit metadata.
   */
  async rejectPhoto(
    photoId: string,
    adminUserId: string,
    reason: string
  ): Promise<ModerationMutationResult> {
    // 1. Reason validation
    const trimmedReason = (reason || "").trim();
    if (!trimmedReason) {
      return {
        success: false,
        status: 400,
        code: "INVALID_REJECTION_REASON",
        message: "Rejection reason is required and cannot be empty.",
      };
    }

    if (trimmedReason.length > 500) {
      return {
        success: false,
        status: 400,
        code: "INVALID_REJECTION_REASON",
        message: "Rejection reason cannot exceed 500 characters.",
      };
    }

    const existing = await prisma.profilePhoto.findUnique({
      where: { id: photoId },
    });

    if (!existing) {
      return {
        success: false,
        status: 404,
        code: "PHOTO_NOT_FOUND",
        message: "Photo not found.",
      };
    }

    // 2. Idempotency check: Already rejected with identical reason
    if (
      existing.moderationStatus === ModerationStatus.REJECTED &&
      existing.moderationReason === trimmedReason
    ) {
      const detail = await this.getPhotoDetail(photoId);
      return {
        success: true,
        status: 200,
        message: "Photo is already rejected with this reason.",
        photo: detail || undefined,
      };
    }

    // 3. Conflict check: Photo was already approved
    if (existing.moderationStatus === ModerationStatus.APPROVED) {
      return {
        success: false,
        status: 409,
        code: "MODERATION_CONFLICT",
        message: "Photo has already been approved and cannot be rejected.",
      };
    }

    // 4. Atomic conditional transition from PENDING -> REJECTED
    const updateResult = await prisma.profilePhoto.updateMany({
      where: {
        id: photoId,
        moderationStatus: ModerationStatus.PENDING,
      },
      data: {
        moderationStatus: ModerationStatus.REJECTED,
        moderationReason: trimmedReason,
        moderatedAt: new Date(),
        moderatedByUserId: adminUserId,
      },
    });

    if (updateResult.count === 0) {
      // Race condition caught
      const current = await this.getPhotoDetail(photoId);
      return {
        success: false,
        status: 409,
        code: "MODERATION_CONFLICT",
        message: `Photo status was updated concurrently to ${current?.moderationStatus}.`,
        photo: current || undefined,
      };
    }

    const updatedDetail = await this.getPhotoDetail(photoId);
    return {
      success: true,
      status: 200,
      message: "Photo rejected successfully.",
      photo: updatedDetail || undefined,
    };
  }
}

export const adminPhotoModerationService = new AdminPhotoModerationService();
