import {
  ProfileCreatedFor,
  ProfileStatus,
  Gender,
  MaritalStatus,
  ManglikStatus,
  EmploymentType,
  AnnualIncomeRange,
  ProfileReligion,
  ProfileEducation,
  ProfileCareer,
} from "@prisma/client";
import { PhotoResponseDto } from "./photo";
import { PartnerPreferencesResponseDto } from "./partner-preference";

export {
  ProfileCreatedFor,
  ProfileStatus,
  Gender,
  MaritalStatus,
  ManglikStatus,
  EmploymentType,
  AnnualIncomeRange,
  ProfileReligion,
  ProfileEducation,
  ProfileCareer,
};

export interface InitializeProfileDto {
  profileCreatedFor: ProfileCreatedFor;
}

export interface SavePersonalDetailsDto {
  firstName: string;
  lastName: string;
  gender: Gender;
  dateOfBirth: string; // ISO 8601 string: YYYY-MM-DD
  maritalStatus: MaritalStatus;
  heightCm: number;
  motherTongueId: string;
  city?: string | null;
  state?: string | null;
  languageIds?: string[];
}

export interface SaveReligionDto {
  religionId: string;
  communityId?: string | null;
  subCommunityId?: string | null;
  casteId?: string | null;
  subCasteId?: string | null;
  gotraId?: string | null;
  manglik?: ManglikStatus | null;
  customReligion?: string | null;
  customCommunity?: string | null;
  customCaste?: string | null;
  customSubCaste?: string | null;
}

export interface SaveEducationDto {
  educationId: string;
  specializationId?: string | null;
  institutionId?: string | null;
  institutionName?: string | null;
}

export interface SaveCareerDto {
  employmentStatusId: string;
  occupationId?: string | null;
  companyName?: string | null;
  employmentType?: EmploymentType | null;
  annualIncomeRange?: AnnualIncomeRange | null;
}

export interface SaveEducationCareerDto {
  education: SaveEducationDto;
  career: SaveCareerDto;
}

export interface ProfileSummaryDto {
  id: string;
  userId: string;
  profileCreatedFor: ProfileCreatedFor;
  profileStatus: ProfileStatus;
  completionPercentage: number;
  submittedAt?: Date | null;
  reviewedAt?: Date | null;
  rejectionReason?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProfileSubmissionResponseDto {
  id: string;
  profileStatus: ProfileStatus;
  completionPercentage: number;
  submittedAt: Date;
}

export interface ProfileCompletenessCheckResult {
  isComplete: boolean;
  missingSections: string[];
  hasApprovedPhoto: boolean;
  photoCount: number;
  approvedPhotoCount: number;
}

export interface PersonalDetailsDto {
  id: string;
  profileId: string;
  firstName: string;
  lastName: string;
  gender: Gender;
  dateOfBirth: Date;
  maritalStatus: MaritalStatus;
  heightCm: number;
  motherTongueId: string;
  city?: string | null;
  state?: string | null;
  motherTongue?: {
    id: string;
    name: string;
    code: string;
  };
  createdAt: Date;
  updatedAt: Date;
}

export interface ProfileLanguageDto {
  languageId: string;
  name: string;
  code: string;
}

export interface ReligionResponseDto {
  id: string;
  profileId: string;
  religionId: string;
  religion?: {
    id: string;
    name: string;
    slug: string;
  };
  communityId: string | null;
  community?: {
    id: string;
    name: string;
    slug: string;
  } | null;
  subCommunityId: string | null;
  subCommunity?: {
    id: string;
    name: string;
    slug: string;
  } | null;
  casteId: string | null;
  caste?: {
    id: string;
    name: string;
    slug: string;
  } | null;
  subCasteId: string | null;
  subCaste?: {
    id: string;
    name: string;
    slug: string;
  } | null;
  gotraId: string | null;
  gotra?: {
    id: string;
    name: string;
    slug: string;
  } | null;
  manglik: ManglikStatus | null;
  customReligion?: string | null;
  customCommunity?: string | null;
  customCaste?: string | null;
  customSubCaste?: string | null;
  effectiveReligion?: string | null;
  effectiveCommunity?: string | null;
  effectiveCaste?: string | null;
  effectiveSubCaste?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface EducationResponseDto {
  id: string;
  profileId: string;
  educationId: string;
  education?: {
    id: string;
    name: string;
    slug: string;
  };
  specializationId: string | null;
  specialization?: {
    id: string;
    name: string;
    slug: string;
  } | null;
  institutionId: string | null;
  institution?: {
    id: string;
    name: string;
    normalizedName: string;
    type: string | null;
  } | null;
  institutionName: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CareerResponseDto {
  id: string;
  profileId: string;
  employmentStatusId: string;
  employmentStatus?: {
    id: string;
    name: string;
    slug: string;
  };
  occupationId: string | null;
  occupation?: {
    id: string;
    name: string;
    slug: string;
  } | null;
  companyName: string | null;
  employmentType: EmploymentType | null;
  annualIncomeRange: AnnualIncomeRange | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CompleteProfileResponseDto {
  profile: ProfileSummaryDto;
  personalDetails: PersonalDetailsDto | null;
  languages: ProfileLanguageDto[];
  religion: ReligionResponseDto | null;
  education: EducationResponseDto | null;
  career: CareerResponseDto | null;
  photos: PhotoResponseDto[];
  partnerPreferences: PartnerPreferencesResponseDto | null;
}

export type ProfileSubmissionErrorCode =
  | "PROFILE_NOT_FOUND"
  | "PROFILE_INCOMPLETE"
  | "NO_APPROVED_PHOTO"
  | "PROFILE_ALREADY_SUBMITTED"
  | "PROFILE_ALREADY_ACTIVE"
  | "PROFILE_REJECTED"
  | "PROFILE_SUSPENDED"
  | "UNAUTHORIZED"
  | "INTERNAL_SERVER_ERROR";
