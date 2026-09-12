import { prisma } from "../config/database";
import { ProfileStatus, UserStatus, Gender, Prisma } from "@prisma/client";
import { favouriteRepository } from "../repositories/favourite.repository";
import { resolvePhotoPublicUrl } from "../providers/storage";

type CandidateProfilePayload = Prisma.ProfileGetPayload<{
  include: {
    personalDetails: {
      include: {
        motherTongue: true;
      };
    };
    religion: {
      include: {
        religion: true;
        community: true;
        subCommunity: true;
        caste: true;
        subCaste: true;
        gotra: true;
      };
    };
    education: {
      include: {
        education: true;
        specialization: true;
        institution: true;
      };
    };
    career: {
      include: {
        employmentStatus: true;
        occupation: true;
      };
    };
    photos: true;
    partnerPreference: {
      include: {
        religions: { include: { religion: true } };
        communities: { include: { community: true } };
        castes: { include: { caste: true } };
        gotras: { include: { gotra: true } };
        educations: { include: { education: true } };
        occupations: { include: { occupation: true } };
        maritalStatuses: true;
        manglik: true;
      };
    };
  };
}>;

export interface DiscoveryPagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage?: boolean;
}

export interface FormattedDiscoveryProfile {
  id: string;
  name: string;
  age: number;
  gender: string;
  maritalStatus: string;
  profileCreatedFor?: string;
  heightCm?: number | null;
  heightFormatted?: string;
  motherTongue?: string;
  religion: string;
  community?: string;
  subCommunity?: string;
  caste?: string;
  subCaste?: string;
  gotra?: string;
  manglik?: string;
  location: string;
  city?: string | null;
  state?: string | null;
  education: string;
  specialization?: string;
  institution?: string;
  occupation: string;
  employmentStatus?: string;
  employmentType?: string;
  incomeRange: string;
  isVerified: boolean;
  isOnline: boolean;
  photos: string[];
  isFavourited?: boolean;
  partnerPreference?: {
    minAge?: number | null;
    maxAge?: number | null;
    minHeightCm?: number | null;
    maxHeightCm?: number | null;
    religions?: string[];
    communities?: string[];
    castes?: string[];
    gotras?: string[];
    educations?: string[];
    occupations?: string[];
    maritalStatuses?: string[];
    manglik?: string[];
  };
}

export class MatchesService {
  /**
   * Discovers compatible matrimonial profiles with central visibility rules:
   * 1. Authenticated user derived strictly from JWT (currentUserId)
   * 2. Excludes current user's own profile (userId != currentUserId)
   * 3. Authoritative filter: profileStatus === ACTIVE and completionPercentage === 100
   * 4. User account must be active (user.status === ACTIVE)
   * 5. Database-level pagination with deterministic ordering
   */
  async getDiscoveryMatches(
    currentUserId: string,
    options: {
      category?: string;
      page?: number;
      pageSize?: number;
    } = {}
  ): Promise<{
    profiles: FormattedDiscoveryProfile[];
    pagination: DiscoveryPagination;
  }> {
    const page = Math.max(1, options.page || 1);
    const pageSize = Math.min(50, Math.max(1, options.pageSize || 20));
    const skip = (page - 1) * pageSize;

    // Fetch current user's profile and partner preferences if available
    const currentUserProfile = await prisma.profile.findUnique({
      where: { userId: currentUserId },
      include: {
        personalDetails: true,
        partnerPreference: {
          include: {
            religions: true,
            communities: true,
          },
        },
      },
    });

    // Central Visibility Rule:
    // profileStatus = ACTIVE, completionPercentage = 100, userId != currentUserId, user.status = ACTIVE
    const baseWhere: any = {
      profileStatus: ProfileStatus.ACTIVE,
      completionPercentage: 100,
      userId: { not: currentUserId },
      user: {
        status: UserStatus.ACTIVE,
      },
    };

    // If current user is MALE, prioritize FEMALE (and vice versa) if specified in personalDetails
    if (currentUserProfile?.personalDetails?.gender) {
      const userGender = currentUserProfile.personalDetails.gender;
      if (userGender === Gender.MALE) {
        baseWhere.personalDetails = {
          gender: Gender.FEMALE,
        };
      } else if (userGender === Gender.FEMALE) {
        baseWhere.personalDetails = {
          gender: Gender.MALE,
        };
      }
      // For OTHER or unspecified cases, do not restrict by opposite gender
    }

    // Apply category-specific matching criteria if requested
    if (options.category === "preferences" && currentUserProfile?.partnerPreference) {
      const pref = currentUserProfile.partnerPreference;
      const conditions: any[] = [];

      if (pref.minAge || pref.maxAge) {
        const now = new Date();
        const ageFilter: any = {};
        if (pref.maxAge) {
          const minDob = new Date(now.getFullYear() - pref.maxAge - 1, now.getMonth(), now.getDate());
          ageFilter.gte = minDob;
        }
        if (pref.minAge) {
          const maxDob = new Date(now.getFullYear() - pref.minAge, now.getMonth(), now.getDate());
          ageFilter.lte = maxDob;
        }
        conditions.push({ personalDetails: { dateOfBirth: ageFilter } });
      }

      if (pref.religions && pref.religions.length > 0) {
        const religionIds = pref.religions.map((r: { religionId: string }) => r.religionId);
        conditions.push({ religion: { religionId: { in: religionIds } } });
      }

      if (conditions.length > 0) {
        baseWhere.AND = conditions;
      }
    }

    // Execute paginated database queries
    const [profiles, total] = await Promise.all([
      prisma.profile.findMany({
        where: baseWhere,
        include: {
          personalDetails: {
            include: {
              motherTongue: true,
            },
          },
          religion: {
            include: {
              religion: true,
              community: true,
              subCommunity: true,
              caste: true,
              subCaste: true,
              gotra: true,
            },
          },
          education: {
            include: {
              education: true,
              specialization: true,
              institution: true,
            },
          },
          career: {
            include: {
              employmentStatus: true,
              occupation: true,
            },
          },
          photos: {
            where: { moderationStatus: "APPROVED" },
            orderBy: { sortOrder: "asc" },
            take: 6,
          },
          partnerPreference: {
            include: {
              religions: { include: { religion: true } },
              communities: { include: { community: true } },
              castes: { include: { caste: true } },
              gotras: { include: { gotra: true } },
              educations: { include: { education: true } },
              occupations: { include: { occupation: true } },
              maritalStatuses: true,
              manglik: true,
            },
          },
        },
        orderBy: [
          { updatedAt: "desc" },
          { createdAt: "desc" },
        ],
        skip,
        take: pageSize,
      }),
      prisma.profile.count({ where: baseWhere }),
    ]);

    // Batch query favourite status for all candidate profiles to prevent N+1 queries
    const candidateProfileIds = profiles.map((p: CandidateProfilePayload) => p.id);
    const favouritedSet = await favouriteRepository.getFavouritedProfileIds(
      currentUserId,
      candidateProfileIds
    );

    // Format profiles for frontend ProfileCard consumption
    const formattedProfiles: FormattedDiscoveryProfile[] = profiles.map((p: CandidateProfilePayload) =>
      formatDiscoveryProfile(p, favouritedSet.has(p.id))
    );

    return {
      profiles: formattedProfiles,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
        hasNextPage: skip + profiles.length < total,
        hasPrevPage: page > 1,
      },
    };
  }
}

/**
 * Reusable utility to format a Profile entity with relations into a FormattedDiscoveryProfile.
 */
export function formatDiscoveryProfile(
  p: any,
  isFavourited: boolean = false
): FormattedDiscoveryProfile {
  const pd = p.personalDetails;
  const rel = p.religion;
  const edu = p.education;
  const car = p.career;
  const pp = p.partnerPreference;

  // Calculate age from dateOfBirth
  let age = 28;
  if (pd?.dateOfBirth) {
    const diffMs = Date.now() - new Date(pd.dateOfBirth).getTime();
    age = Math.floor(diffMs / (1000 * 60 * 60 * 24 * 365.25));
  }

  // Format height string
  let heightFormatted: string | undefined = undefined;
  if (pd?.heightCm && pd.heightCm > 0) {
    const totalInches = Math.round(pd.heightCm / 2.54);
    const feet = Math.floor(totalInches / 12);
    const inches = totalInches % 12;
    heightFormatted = `${feet}' ${inches}" (${pd.heightCm} cm)`;
  }

  // Format photos array from candidate's actual approved photos
  const photoUrls: string[] = (p.photos || []).map(
    (photo: any) => resolvePhotoPublicUrl(photo.storageKey, photo.id, photo.storageProvider)
  );

  // Centralized income range mapping (truthful representation)
  const incomeMap: Record<string, string> = {
    BELOW_2_LAKH: "Below ₹2 Lakh",
    TWO_TO_FIVE_LAKH: "₹2–5 Lakh",
    FIVE_TO_TEN_LAKH: "₹5–10 Lakh",
    TEN_TO_FIFTEEN_LAKH: "₹10–15 Lakh",
    FIFTEEN_TO_TWENTY_LAKH: "₹15–20 Lakh",
    TWENTY_TO_THIRTY_LAKH: "₹20–30 Lakh",
    THIRTY_TO_FIFTY_LAKH: "₹30–50 Lakh",
    FIFTY_LAKH_TO_ONE_CRORE: "₹50 Lakh–1 Crore",
    ABOVE_ONE_CRORE: "Above ₹1 Crore",
    PREFER_NOT_TO_SAY: "Prefer not to say",
  };

  const maritalStatusMap: Record<string, string> = {
    NEVER_MARRIED: "Never Married",
    DIVORCED: "Divorced",
    WIDOWED: "Widowed",
    AWAITING_DIVORCE: "Awaiting Divorce",
    ANNULLED: "Annulled",
  };

  const genderMap: Record<string, string> = {
    MALE: "Male",
    FEMALE: "Female",
    OTHER: "Other",
  };

  const manglikMap: Record<string, string> = {
    MANGLIK: "Manglik",
    NON_MANGLIK: "Non-Manglik",
    ANSHIK_MANGLIK: "Anshik Manglik",
    DONT_KNOW: "Don't Know",
  };

  const employmentTypeMap: Record<string, string> = {
    PRIVATE_SECTOR: "Private Sector",
    GOVERNMENT_PUBLIC_SECTOR: "Government / Public Sector",
    DEFENSE_CIVIL_SERVICES: "Defense / Civil Services",
    BUSINESS_ENTREPRENEUR: "Business / Entrepreneur",
    SELF_EMPLOYED_FREELANCER: "Self Employed / Freelancer",
    NOT_WORKING: "Not Working",
  };

  const createdForMap: Record<string, string> = {
    SELF: "Self",
    SON: "Son",
    DAUGHTER: "Daughter",
    BROTHER: "Brother",
    SISTER: "Sister",
    FRIEND: "Friend",
    RELATIVE: "Relative",
  };

  // Construct dynamic location from candidate's actual database values
  let location = "Location not provided";
  if (pd?.city && pd?.state) {
    location = `${pd.city}, ${pd.state}`;
  } else if (pd?.city) {
    location = pd.city;
  } else if (pd?.state) {
    location = pd.state;
  }

  let partnerPreference = undefined;
  if (pp) {
    partnerPreference = {
      minAge: pp.minAge || null,
      maxAge: pp.maxAge || null,
      minHeightCm: pp.minHeightCm || null,
      maxHeightCm: pp.maxHeightCm || null,
      religions: (pp.religions || []).map((r: any) => r.religion?.name).filter(Boolean),
      communities: (pp.communities || []).map((c: any) => c.community?.name).filter(Boolean),
      castes: (pp.castes || []).map((c: any) => c.caste?.name).filter(Boolean),
      gotras: (pp.gotras || []).map((g: any) => g.gotra?.name).filter(Boolean),
      educations: (pp.educations || []).map((e: any) => e.education?.name).filter(Boolean),
      occupations: (pp.occupations || []).map((o: any) => o.occupation?.name).filter(Boolean),
      maritalStatuses: (pp.maritalStatuses || []).map((m: any) => maritalStatusMap[m.maritalStatus] || m.maritalStatus).filter(Boolean),
      manglik: (pp.manglik || []).map((m: any) => manglikMap[m.manglik] || m.manglik).filter(Boolean),
    };
  }

  return {
    id: p.id,
    name: pd ? `${pd.firstName}${pd.lastName ? " " + pd.lastName : ""}`.trim() : "Member",
    age,
    gender: pd?.gender ? (genderMap[pd.gender] || "Other") : "Not specified",
    maritalStatus: maritalStatusMap[pd?.maritalStatus || "NEVER_MARRIED"] || "Never Married",
    profileCreatedFor: p.profileCreatedFor ? (createdForMap[p.profileCreatedFor] || p.profileCreatedFor) : undefined,
    heightCm: pd?.heightCm || null,
    heightFormatted,
    motherTongue: pd?.motherTongue?.name || undefined,
    religion:
      rel?.religion?.slug === "other"
        ? rel.customReligion || "Not specified"
        : rel?.religion?.name || "Not specified",
    community:
      rel?.community?.slug === "other"
        ? rel.customCommunity || undefined
        : rel?.customCommunity || rel?.community?.name || undefined,
    subCommunity: rel?.subCommunity?.name || undefined,
    caste:
      rel?.caste?.slug === "other"
        ? rel.customCaste || undefined
        : rel?.customCaste || rel?.caste?.name || undefined,
    subCaste:
      rel?.subCaste?.slug === "other"
        ? rel.customSubCaste || undefined
        : rel?.customSubCaste || rel?.subCaste?.name || undefined,
    gotra: rel?.gotra?.name || undefined,
    manglik: rel?.manglik ? (manglikMap[rel.manglik] || rel.manglik) : undefined,
    location,
    city: pd?.city || null,
    state: pd?.state || null,
    education: edu?.education?.name || edu?.institutionName || "Not specified",
    specialization: edu?.specialization?.name || undefined,
    institution: edu?.institution?.name || edu?.institutionName || undefined,
    occupation: car?.occupation?.name || car?.companyName || "Not specified",
    employmentStatus: car?.employmentStatus?.name || undefined,
    employmentType: car?.employmentType ? (employmentTypeMap[car.employmentType] || car.employmentType) : undefined,
    incomeRange: car?.annualIncomeRange ? (incomeMap[car.annualIncomeRange] || "Not specified") : "Not specified",
    isVerified: p.profileStatus === ProfileStatus.ACTIVE,
    isOnline: false,
    photos: photoUrls,
    isFavourited,
    partnerPreference,
  };
}

export const matchesService = new MatchesService();
