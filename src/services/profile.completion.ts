export interface ProfileDataForCompletion {
  profileCreatedFor?: string | null;
  personalDetails?: {
    firstName?: string | null;
    lastName?: string | null;
    gender?: string | null;
    dateOfBirth?: Date | string | null;
    maritalStatus?: string | null;
    heightCm?: number | null;
    motherTongueId?: string | null;
  } | null;
  languages?: Array<unknown> | null;
  religion?: {
    religionId?: string | null;
    manglik?: string | null;
  } | null;
  education?: {
    educationId?: string | null;
  } | null;
  career?: {
    employmentStatusId?: string | null;
  } | null;
  photos?: Array<unknown> | null;
  partnerPreference?: {
    id?: string | null;
  } | null;
}

export interface SectionWeights {
  profileCreatedFor: number;
  personalDetails: number;
  languages: number;
  religion: number;
  educationAndCareer: number;
  photos: number;
  partnerPreferences: number;
}

export const DEFAULT_SECTION_WEIGHTS: SectionWeights = {
  profileCreatedFor: 10,
  personalDetails: 25,
  languages: 5,
  religion: 20,
  educationAndCareer: 20,
  photos: 10,
  partnerPreferences: 10,
};

/**
 * Calculates the current profile completion percentage based on actual stored database records.
 * Rules:
 * - Profile Created For: 10%
 * - Personal Details: 25%
 * - Spoken Languages: 5%
 * - Religion & Community: 20%
 * - Education & Career: 20%
 * - Photos: 10%
 * - Partner Preferences: 10%
 * Total = 100%
 */
export function calculateProfileCompletion(
  data: ProfileDataForCompletion,
  weights: SectionWeights = DEFAULT_SECTION_WEIGHTS
): number {
  let score = 0;

  // 1. Profile Created For
  if (data.profileCreatedFor) {
    score += weights.profileCreatedFor;
  }

  // 2. Personal Details
  if (
    data.personalDetails &&
    data.personalDetails.firstName &&
    data.personalDetails.lastName &&
    data.personalDetails.gender &&
    data.personalDetails.dateOfBirth &&
    data.personalDetails.maritalStatus &&
    data.personalDetails.heightCm &&
    data.personalDetails.motherTongueId
  ) {
    score += weights.personalDetails;
  }

  // 3. Languages
  if (data.languages && data.languages.length > 0) {
    score += weights.languages;
  }

  // 4. Religion & Community
  if (data.religion && data.religion.religionId && data.religion.manglik) {
    score += weights.religion;
  }

  // 5. Education & Career
  const hasEducation = Boolean(data.education && data.education.educationId);
  const hasCareer = Boolean(data.career && data.career.employmentStatusId);
  if (hasEducation && hasCareer) {
    score += weights.educationAndCareer;
  } else if (hasEducation || hasCareer) {
    score += Math.floor(weights.educationAndCareer / 2);
  }

  // 6. Photos
  if (data.photos && data.photos.length > 0) {
    score += weights.photos;
  }

  // 7. Partner Preferences
  if (data.partnerPreference && data.partnerPreference.id) {
    score += weights.partnerPreferences;
  }

  return Math.min(100, Math.max(0, score));
}
