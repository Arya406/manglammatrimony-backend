import { PrismaClient, ProfileStatus, UserStatus } from "@prisma/client";
import { prisma as defaultPrisma } from "../config/database";

export class FavouriteRepository {
  constructor(private prisma: PrismaClient = defaultPrisma) {}

  /**
   * Creates or updates a favourite record idempotently.
   */
  async addFavourite(userId: string, targetProfileId: string) {
    try {
      return await this.prisma.profileFavourite.upsert({
        where: {
          userId_targetProfileId: { userId, targetProfileId },
        },
        create: {
          userId,
          targetProfileId,
        },
        update: {},
      });
    } catch (err: any) {
      if (err.code === "P2002") {
        return await this.prisma.profileFavourite.findUnique({
          where: { userId_targetProfileId: { userId, targetProfileId } },
        });
      }
      throw err;
    }
  }

  /**
   * Deletes a favourite record idempotently.
   */
  async removeFavourite(userId: string, targetProfileId: string): Promise<boolean> {
    const deleted = await this.prisma.profileFavourite.deleteMany({
      where: {
        userId,
        targetProfileId,
      },
    });
    return deleted.count > 0;
  }

  /**
   * Checks if user has favourited target profile.
   */
  async isFavourited(userId: string, targetProfileId: string): Promise<boolean> {
    const fav = await this.prisma.profileFavourite.findUnique({
      where: {
        userId_targetProfileId: { userId, targetProfileId },
      },
    });
    return !!fav;
  }

  /**
   * Batch lookup of target profile IDs favourited by user.
   */
  async getFavouritedProfileIds(userId: string, targetProfileIds: string[]): Promise<Set<string>> {
    if (!targetProfileIds.length) return new Set();
    const records = await this.prisma.profileFavourite.findMany({
      where: {
        userId,
        targetProfileId: { in: targetProfileIds },
      },
      select: { targetProfileId: true },
    });
    return new Set(records.map((r) => r.targetProfileId));
  }

  /**
   * Retrieves active profiles that the user has favourited (sent favourites).
   */
  async getSentFavourites(
    userId: string,
    options: { page?: number; pageSize?: number } = {}
  ) {
    const page = Math.max(1, options.page || 1);
    const pageSize = Math.min(50, Math.max(1, options.pageSize || 20));
    const skip = (page - 1) * pageSize;

    const where = {
      userId,
      targetProfile: {
        profileStatus: ProfileStatus.ACTIVE,
        user: { status: UserStatus.ACTIVE },
      },
    };

    const [favourites, total] = await Promise.all([
      this.prisma.profileFavourite.findMany({
        where,
        include: {
          targetProfile: {
            include: {
              personalDetails: true,
              religion: { include: { religion: true, community: true } },
              education: { include: { education: true } },
              career: { include: { occupation: true } },
              photos: { orderBy: { sortOrder: "asc" }, take: 5 },
            },
          },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: pageSize,
      }),
      this.prisma.profileFavourite.count({ where }),
    ]);

    return { favourites, total, page, pageSize };
  }

  /**
   * Retrieves active profiles that have favourited the user's profile (received likes).
   */
  async getReceivedLikes(
    targetProfileId: string,
    options: { page?: number; pageSize?: number } = {}
  ) {
    const page = Math.max(1, options.page || 1);
    const pageSize = Math.min(50, Math.max(1, options.pageSize || 20));
    const skip = (page - 1) * pageSize;

    const where = {
      targetProfileId,
      user: {
        status: UserStatus.ACTIVE,
        profile: {
          profileStatus: ProfileStatus.ACTIVE,
        },
      },
    };

    const [likes, total] = await Promise.all([
      this.prisma.profileFavourite.findMany({
        where,
        include: {
          user: {
            include: {
              profile: {
                include: {
                  personalDetails: true,
                  religion: { include: { religion: true, community: true } },
                  education: { include: { education: true } },
                  career: { include: { occupation: true } },
                  photos: { orderBy: { sortOrder: "asc" }, take: 5 },
                },
              },
            },
          },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: pageSize,
      }),
      this.prisma.profileFavourite.count({ where }),
    ]);

    return { likes, total, page, pageSize };
  }

  /**
   * Counts incoming likes from active accounts.
   */
  async getReceivedLikesCount(targetProfileId: string): Promise<number> {
    return this.prisma.profileFavourite.count({
      where: {
        targetProfileId,
        user: {
          status: UserStatus.ACTIVE,
          profile: {
            profileStatus: ProfileStatus.ACTIVE,
          },
        },
      },
    });
  }
}

export const favouriteRepository = new FavouriteRepository();
