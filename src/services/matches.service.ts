import { prisma } from "../config/database";
import { ProfileStatus, UserStatus } from "@prisma/client";
import { favouriteRepository } from "../repositories/favourite.repository";

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
  religion: string;
  community?: string;
  location: string;
  education: string;
  occupation: string;
  incomeRange: string;
  isVerified: boolean;
  isOnline: boolean;
  photos: string[];
  isFavourited?: boolean;
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
      const oppositeGender =
        currentUserProfile.personalDetails.gender === "MALE" ? "FEMALE" : "MALE";
      baseWhere.personalDetails = {
        gender: oppositeGender,
      };
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
        const religionIds = pref.religions.map((r) => r.religionId);
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
          personalDetails: true,
          religion: {
            include: {
              religion: true,
              community: true,
            },
          },
          education: {
            include: {
              education: true,
            },
          },
          career: {
            include: {
              occupation: true,
            },
          },
          photos: {
            orderBy: { sortOrder: "asc" },
            take: 5,
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
    const candidateProfileIds = profiles.map((p) => p.id);
    const favouritedSet = await favouriteRepository.getFavouritedProfileIds(
      currentUserId,
      candidateProfileIds
    );

    // Format profiles for frontend ProfileCard consumption
    const formattedProfiles: FormattedDiscoveryProfile[] = profiles.map((p) =>
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

  // Calculate age from dateOfBirth
  let age = 28;
  if (pd?.dateOfBirth) {
    const diffMs = Date.now() - new Date(pd.dateOfBirth).getTime();
    age = Math.floor(diffMs / (1000 * 60 * 60 * 24 * 365.25));
  }

  // Format photos array from candidate's actual uploaded photos
  const photoUrls: string[] = (p.photos || []).map(
    (photo: any) => `/api/profile/photos/${photo.id}/file`
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

  // Construct dynamic location from candidate's actual database values
  let location = "Location not provided";
  if (pd?.city && pd?.state) {
    location = `${pd.city}, ${pd.state}`;
  } else if (pd?.city) {
    location = pd.city;
  } else if (pd?.state) {
    location = pd.state;
  }

  return {
    id: p.id,
    name: pd ? `${pd.firstName}${pd.lastName ? " " + pd.lastName : ""}`.trim() : "Member",
    age,
    gender: pd?.gender ? (genderMap[pd.gender] || "Other") : "Not specified",
    maritalStatus: maritalStatusMap[pd?.maritalStatus || "NEVER_MARRIED"] || "Never Married",
    religion:
      rel?.religion?.slug === "other"
        ? rel.customReligion || "Not specified"
        : rel?.religion?.name || "Not specified",
    community:
      rel?.community?.slug === "other"
        ? rel.customCommunity || undefined
        : rel?.customCommunity || rel?.community?.name || undefined,
    location,
    education: edu?.education?.name || edu?.institutionName || "Not specified",
    occupation: car?.occupation?.name || car?.companyName || "Not specified",
    incomeRange: car?.annualIncomeRange ? (incomeMap[car.annualIncomeRange] || "Not specified") : "Not specified",
    isVerified: p.profileStatus === ProfileStatus.ACTIVE,
    isOnline: true,
    photos: photoUrls,
    isFavourited,
  };
}

export const matchesService = new MatchesService();
