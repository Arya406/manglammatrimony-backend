import { ManglikStatus, MaritalStatus } from "@prisma/client";

export { ManglikStatus, MaritalStatus };

export interface SavePartnerPreferencesDto {
  minAge?: number | null;
  maxAge?: number | null;
  minHeightCm?: number | null;
  maxHeightCm?: number | null;
  religionIds?: string[];
  communityIds?: string[];
  subCommunityIds?: string[];
  casteIds?: string[];
  gotraIds?: string[];
  educationIds?: string[];
  occupationIds?: string[];
  manglikStatuses?: ManglikStatus[];
  maritalStatuses?: MaritalStatus[];
}

export interface MasterDataItemDto {
  id: string;
  name: string;
  slug?: string;
  code?: string;
}

export interface PartnerPreferencesResponseDto {
  id: string;
  profileId: string;
  minAge: number | null;
  maxAge: number | null;
  minHeightCm: number | null;
  maxHeightCm: number | null;
  religions: MasterDataItemDto[];
  communities: MasterDataItemDto[];
  subCommunities: MasterDataItemDto[];
  castes: MasterDataItemDto[];
  gotras: MasterDataItemDto[];
  educations: MasterDataItemDto[];
  occupations: MasterDataItemDto[];
  manglikStatuses: ManglikStatus[];
  maritalStatuses: MaritalStatus[];
  createdAt: Date;
  updatedAt: Date;
}

export type PartnerPreferenceErrorCode =
  | "PROFILE_NOT_FOUND"
  | "INVALID_AGE_RANGE"
  | "INVALID_HEIGHT_RANGE"
  | "INVALID_PARTNER_RELIGION"
  | "INVALID_PARTNER_COMMUNITY"
  | "PARTNER_COMMUNITY_RELIGION_MISMATCH"
  | "INVALID_PARTNER_SUB_COMMUNITY"
  | "PARTNER_SUB_COMMUNITY_PARENT_MISMATCH"
  | "INVALID_PARTNER_CASTE"
  | "PARTNER_CASTE_COMMUNITY_MISMATCH"
  | "INVALID_PARTNER_GOTRA"
  | "PARTNER_GOTRA_COMMUNITY_MISMATCH"
  | "INVALID_PARTNER_EDUCATION"
  | "INVALID_PARTNER_OCCUPATION"
  | "INVALID_PARTNER_MANGLIK_STATUS"
  | "INVALID_PARTNER_MARITAL_STATUS"
  | "VALIDATION_ERROR"
  | "UNAUTHORIZED"
  | "INTERNAL_SERVER_ERROR";
