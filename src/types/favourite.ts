import { FormattedDiscoveryProfile } from "../services/matches.service";

export interface FavouriteToggleResponseDto {
  isFavourited: boolean;
  profileId: string;
}

export interface FavouriteStatusResponseDto {
  isFavourited: boolean;
  profileId: string;
}

export interface ReceivedLikesCountResponseDto {
  count: number;
}

export interface FavouritesListResponseDto {
  profiles: FormattedDiscoveryProfile[];
  total: number;
}

export interface ReceivedLikesListResponseDto {
  profiles: (FormattedDiscoveryProfile & { likedAt: string })[];
  total: number;
}
