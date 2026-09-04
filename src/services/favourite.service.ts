import { FavouriteRepository, favouriteRepository } from "../repositories/favourite.repository";
import { ProfileRepository, profileRepository } from "../repositories/profile.repository";
import { prisma } from "../config/database";
import { formatDiscoveryProfile } from "./matches.service";
import { ApiResponse } from "../types/auth";
import {
  FavouriteToggleResponseDto,
  FavouriteStatusResponseDto,
  ReceivedLikesCountResponseDto,
  FavouritesListResponseDto,
  ReceivedLikesListResponseDto,
} from "../types/favourite";
import { ProfileStatus, UserStatus } from "@prisma/client";

const UUID_REGEX = /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|profile-sample-[a-z0-9-]+)$/i;

export class FavouriteService {
  constructor(
    private favouriteRepo: FavouriteRepository = favouriteRepository,
    private profileRepo: ProfileRepository = profileRepository
  ) {}

  /**
   * Adds target profile to current user's favourites (outgoing like).
   */
  async addFavourite(
    userId: string,
    targetProfileId: string
  ): Promise<ApiResponse<FavouriteToggleResponseDto>> {
    if (!targetProfileId || !UUID_REGEX.test(targetProfileId)) {
      return {
        success: false,
        code: "INVALID_PROFILE_ID",
        message: "Target profile ID is missing or invalid format.",
      };
    }

    // Target profile lookup & eligibility check
    const targetProfile = await prisma.profile.findUnique({
      where: { id: targetProfileId },
      include: { user: true },
    });

    if (
      !targetProfile ||
      targetProfile.profileStatus !== ProfileStatus.ACTIVE ||
      targetProfile.user.status !== UserStatus.ACTIVE
    ) {
      return {
        success: false,
        code: "TARGET_PROFILE_NOT_FOUND",
        message: "The requested profile does not exist or is no longer active.",
      };
    }

    // Prevent self-favouriting
    if (targetProfile.userId === userId) {
      return {
        success: false,
        code: "CANNOT_FAVOURITE_SELF",
        message: "You cannot favourite your own profile.",
      };
    }

    const callerProfile = await this.profileRepo.findByUserId(userId);
    if (callerProfile && callerProfile.id === targetProfileId) {
      return {
        success: false,
        code: "CANNOT_FAVOURITE_SELF",
        message: "You cannot favourite your own profile.",
      };
    }

    await this.favouriteRepo.addFavourite(userId, targetProfileId);

    return {
      success: true,
      message: "Profile added to your favourites.",
      data: {
        isFavourited: true,
        profileId: targetProfileId,
      },
    };
  }

  /**
   * Removes target profile from current user's favourites (idempotent).
   */
  async removeFavourite(
    userId: string,
    targetProfileId: string
  ): Promise<ApiResponse<FavouriteToggleResponseDto>> {
    if (!targetProfileId || !UUID_REGEX.test(targetProfileId)) {
      return {
        success: false,
        code: "INVALID_PROFILE_ID",
        message: "Target profile ID is missing or invalid format.",
      };
    }

    await this.favouriteRepo.removeFavourite(userId, targetProfileId);

    return {
      success: true,
      message: "Profile removed from your favourites.",
      data: {
        isFavourited: false,
        profileId: targetProfileId,
      },
    };
  }

  /**
   * Checks whether the current user has favourited the target profile.
   */
  async getFavouriteStatus(
    userId: string,
    targetProfileId: string
  ): Promise<ApiResponse<FavouriteStatusResponseDto>> {
    if (!targetProfileId || !UUID_REGEX.test(targetProfileId)) {
      return {
        success: false,
        code: "INVALID_PROFILE_ID",
        message: "Target profile ID is missing or invalid format.",
      };
    }

    const isFav = await this.favouriteRepo.isFavourited(userId, targetProfileId);

    return {
      success: true,
      message: "Favourite status retrieved successfully.",
      data: {
        isFavourited: isFav,
        profileId: targetProfileId,
      },
    };
  }

  /**
   * Retrieves profiles that the current user has favourited (Sent Favourites).
   */
  async getSentFavourites(
    userId: string,
    options: { page?: number; pageSize?: number } = {}
  ): Promise<ApiResponse<FavouritesListResponseDto>> {
    const { favourites, total } = await this.favouriteRepo.getSentFavourites(userId, options);

    const profiles = favourites.map((f) => formatDiscoveryProfile(f.targetProfile, true));

    return {
      success: true,
      message: "Sent favourites retrieved successfully.",
      data: {
        profiles,
        total,
      },
    };
  }

  /**
   * Retrieves profiles that have favourited the current user (Received Likes).
   */
  async getReceivedLikes(
    userId: string,
    options: { page?: number; pageSize?: number } = {}
  ): Promise<ApiResponse<ReceivedLikesListResponseDto>> {
    const callerProfile = await this.profileRepo.findByUserId(userId);
    if (!callerProfile) {
      return {
        success: true,
        message: "No profile found for user.",
        data: {
          profiles: [],
          total: 0,
        },
      };
    }

    const { likes, total } = await this.favouriteRepo.getReceivedLikes(
      callerProfile.id,
      options
    );

    // Identify which of these incoming admirers the current user has also favourited back
    const senderProfileIds = likes
      .map((l) => l.user.profile?.id)
      .filter(Boolean) as string[];
    const favouritedBackSet = await this.favouriteRepo.getFavouritedProfileIds(
      userId,
      senderProfileIds
    );

    const profiles = likes
      .filter((l) => l.user.profile)
      .map((l) => {
        const p = l.user.profile!;
        const formatted = formatDiscoveryProfile(p, favouritedBackSet.has(p.id));
        return {
          ...formatted,
          likedAt: l.createdAt.toISOString(),
        };
      });

    return {
      success: true,
      message: "Received likes retrieved successfully.",
      data: {
        profiles,
        total,
      },
    };
  }

  /**
   * Retrieves the count of incoming likes (people who liked the current user).
   */
  async getReceivedLikesCount(
    userId: string
  ): Promise<ApiResponse<ReceivedLikesCountResponseDto>> {
    const callerProfile = await this.profileRepo.findByUserId(userId);
    if (!callerProfile) {
      return {
        success: true,
        message: "Received likes count retrieved.",
        data: { count: 0 },
      };
    }

    const count = await this.favouriteRepo.getReceivedLikesCount(callerProfile.id);

    return {
      success: true,
      message: "Received likes count retrieved successfully.",
      data: { count },
    };
  }
}

export const favouriteService = new FavouriteService();
