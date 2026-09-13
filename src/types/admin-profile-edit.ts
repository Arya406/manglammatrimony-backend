import {
  ProfileCreatedFor,
  ProfileStatus,
  Gender,
  MaritalStatus,
  ManglikStatus,
  EmploymentType,
  AnnualIncomeRange,
} from "@prisma/client";
import { SavePersonalDetailsDto, SaveReligionDto, SaveEducationCareerDto } from "./profile";
import { SavePartnerPreferencesDto } from "./partner-preference";

export interface AdminUpdateProfileCreatedForDto {
  profileCreatedFor: ProfileCreatedFor;
  expectedUpdatedAt: string;
}

export interface AdminUpdatePersonalDetailsDto extends SavePersonalDetailsDto {
  expectedUpdatedAt: string;
}

export interface AdminUpdateReligionDto extends SaveReligionDto {
  expectedUpdatedAt: string;
}

export interface AdminUpdateEducationCareerDto extends SaveEducationCareerDto {
  expectedUpdatedAt: string;
}

export interface AdminUpdatePartnerPreferencesDto extends SavePartnerPreferencesDto {
  expectedUpdatedAt: string;
}

export interface AdminProfileEditResponseDto {
  id: string;
  userId: string;
  profileCreatedFor: ProfileCreatedFor;
  profileStatus: ProfileStatus;
  completionPercentage: number;
  submittedAt: Date | null;
  reviewedAt: Date | null;
  rejectionReason: string | null;
  lastEditedAt: Date | null;
  lastEditedByUserId: string | null;
  lastEditedByUser?: {
    id: string;
    email: string | null;
  } | null;
  createdAt: Date;
  updatedAt: Date;
}
