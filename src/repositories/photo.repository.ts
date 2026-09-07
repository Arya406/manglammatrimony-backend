import {
  PrismaClient,
  ProfilePhoto,
  PhotoType,
  ModerationStatus,
} from "@prisma/client";
import { prisma as defaultPrisma } from "../config/database";

export interface CreatePhotoInput {
  profileId: string;
  storageKey: string;
  storageProvider?: string;
  originalFileName: string;
  mimeType: string;
  fileSize: number;
  width?: number | null;
  height?: number | null;
  photoType: PhotoType;
  sortOrder: number;
  moderationStatus?: ModerationStatus;
}

export class PhotoRepository {
  constructor(private prisma: PrismaClient = defaultPrisma) {}

  async countPhotosByProfileId(profileId: string): Promise<number> {
    return this.prisma.profilePhoto.count({
      where: { profileId },
    });
  }

  async getPhotosByProfileId(profileId: string): Promise<ProfilePhoto[]> {
    const photos = await this.prisma.profilePhoto.findMany({
      where: { profileId },
      orderBy: [
        { sortOrder: "asc" },
        { createdAt: "asc" },
      ],
    });

    // Ensure PRIMARY photo comes first, followed by sortOrder ascending
    return photos.sort((a, b) => {
      if (a.photoType === PhotoType.PRIMARY && b.photoType !== PhotoType.PRIMARY) return -1;
      if (b.photoType === PhotoType.PRIMARY && a.photoType !== PhotoType.PRIMARY) return 1;
      return a.sortOrder - b.sortOrder;
    });
  }

  async findPhotoByIdForProfile(
    photoId: string,
    profileId: string
  ): Promise<ProfilePhoto | null> {
    return this.prisma.profilePhoto.findFirst({
      where: {
        id: photoId,
        profileId,
      },
    });
  }

  async findPhotoById(photoId: string): Promise<ProfilePhoto | null> {
    return this.prisma.profilePhoto.findUnique({
      where: { id: photoId },
    });
  }

  async createPhoto(input: CreatePhotoInput): Promise<ProfilePhoto> {
    return this.prisma.$transaction(async (tx) => {
      if (input.photoType === PhotoType.PRIMARY) {
        // Demote existing primary photo(s) to ADDITIONAL
        await tx.profilePhoto.updateMany({
          where: {
            profileId: input.profileId,
            photoType: PhotoType.PRIMARY,
          },
          data: { photoType: PhotoType.ADDITIONAL },
        });
      }

      return tx.profilePhoto.create({
        data: {
          profileId: input.profileId,
          storageKey: input.storageKey,
          storageProvider: input.storageProvider || "local",
          originalFileName: input.originalFileName,
          mimeType: input.mimeType,
          fileSize: input.fileSize,
          width: input.width ?? null,
          height: input.height ?? null,
          photoType: input.photoType,
          moderationStatus: input.moderationStatus ?? ModerationStatus.APPROVED,
          sortOrder: input.sortOrder,
        },
      });
    });
  }

  async deletePhotoForProfile(
    photoId: string,
    profileId: string
  ): Promise<{ deletedPhoto: ProfilePhoto; newPrimaryPhoto: ProfilePhoto | null } | null> {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.profilePhoto.findFirst({
        where: { id: photoId, profileId },
      });

      if (!existing) return null;

      await tx.profilePhoto.delete({
        where: { id: photoId },
      });

      let newPrimary: ProfilePhoto | null = null;

      // If the deleted photo was PRIMARY, promote the next available photo to PRIMARY
      if (existing.photoType === PhotoType.PRIMARY) {
        const nextPhoto = await tx.profilePhoto.findFirst({
          where: { profileId },
          orderBy: [
            { sortOrder: "asc" },
            { createdAt: "asc" },
          ],
        });

        if (nextPhoto) {
          newPrimary = await tx.profilePhoto.update({
            where: { id: nextPhoto.id },
            data: { photoType: PhotoType.PRIMARY },
          });
        }
      }

      return {
        deletedPhoto: existing,
        newPrimaryPhoto: newPrimary,
      };
    });
  }

  async setPrimaryPhotoForProfile(
    photoId: string,
    profileId: string
  ): Promise<ProfilePhoto | null> {
    return this.prisma.$transaction(async (tx) => {
      const targetPhoto = await tx.profilePhoto.findFirst({
        where: { id: photoId, profileId },
      });

      if (!targetPhoto) return null;

      // Demote all existing PRIMARY photos for this profile
      await tx.profilePhoto.updateMany({
        where: {
          profileId,
          photoType: PhotoType.PRIMARY,
        },
        data: { photoType: PhotoType.ADDITIONAL },
      });

      // Promote target photo to PRIMARY
      return tx.profilePhoto.update({
        where: { id: photoId },
        data: { photoType: PhotoType.PRIMARY },
      });
    });
  }

  async reorderPhotosForProfile(
    profileId: string,
    photoIds: string[]
  ): Promise<ProfilePhoto[]> {
    return this.prisma.$transaction(async (tx) => {
      // 1. Verify all photos belong to this profile
      const userPhotos = await tx.profilePhoto.findMany({
        where: { profileId },
      });

      const userPhotoIds = new Set(userPhotos.map((p) => p.id));
      for (const id of photoIds) {
        if (!userPhotoIds.has(id)) {
          throw new Error("INVALID_PHOTO_ORDER");
        }
      }

      // 2. Update sortOrder for each submitted ID
      for (let i = 0; i < photoIds.length; i++) {
        await tx.profilePhoto.update({
          where: { id: photoIds[i] },
          data: { sortOrder: i },
        });
      }

      // 3. Return refreshed list
      const refreshed = await tx.profilePhoto.findMany({
        where: { profileId },
        orderBy: [
          { sortOrder: "asc" },
          { createdAt: "asc" },
        ],
      });

      return refreshed.sort((a, b) => {
        if (a.photoType === PhotoType.PRIMARY && b.photoType !== PhotoType.PRIMARY) return -1;
        if (b.photoType === PhotoType.PRIMARY && a.photoType !== PhotoType.PRIMARY) return 1;
        return a.sortOrder - b.sortOrder;
      });
    });
  }

  async updateModerationStatus(
    photoId: string,
    profileId: string,
    status: ModerationStatus,
    reason?: string | null
  ): Promise<ProfilePhoto | null> {
    const photo = await this.prisma.profilePhoto.findFirst({
      where: { id: photoId, profileId },
    });
    if (!photo) return null;

    return this.prisma.profilePhoto.update({
      where: { id: photoId },
      data: {
        moderationStatus: status,
        moderationReason: reason ?? null,
        updatedAt: new Date(),
      },
    });
  }
}

export const photoRepository = new PhotoRepository();
