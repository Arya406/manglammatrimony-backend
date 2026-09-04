import { Request, Response, NextFunction } from "express";
import {
  ProfileCreatedFor,
  Gender,
  MaritalStatus,
  ManglikStatus,
  EmploymentType,
  AnnualIncomeRange,
} from "@prisma/client";

const ALLOWED_PROFILE_CREATED_FOR = Object.values(ProfileCreatedFor);
const ALLOWED_GENDERS = Object.values(Gender);
const ALLOWED_MARITAL_STATUSES = Object.values(MaritalStatus);
const ALLOWED_MANGLIK_STATUSES = Object.values(ManglikStatus);
const ALLOWED_EMPLOYMENT_TYPES = Object.values(EmploymentType);
const ALLOWED_INCOME_RANGES = Object.values(AnnualIncomeRange);

export function validateInitializeProfile(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const { profileCreatedFor } = req.body;

  if (!profileCreatedFor || typeof profileCreatedFor !== "string") {
    res.status(400).json({
      success: false,
      code: "INVALID_PROFILE_CREATED_FOR",
      message: "Please specify who this profile is being created for.",
    });
    return;
  }

  const normalized = profileCreatedFor.trim().toUpperCase() as ProfileCreatedFor;
  if (!ALLOWED_PROFILE_CREATED_FOR.includes(normalized)) {
    res.status(400).json({
      success: false,
      code: "INVALID_PROFILE_CREATED_FOR",
      message: `Invalid profile created for value. Must be one of: ${ALLOWED_PROFILE_CREATED_FOR.join(
        ", "
      )}`,
    });
    return;
  }

  req.body.profileCreatedFor = normalized;
  next();
}

export function validatePersonalDetails(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const {
    firstName,
    lastName,
    gender,
    dateOfBirth,
    maritalStatus,
    heightCm,
    motherTongueId,
    city,
    state,
    languageIds,
  } = req.body;

  const errors: Array<{ field: string; message: string }> = [];

  // 1. First Name
  if (
    !firstName ||
    typeof firstName !== "string" ||
    firstName.trim().length === 0
  ) {
    errors.push({
      field: "firstName",
      message: "First name is required and cannot be empty.",
    });
  } else if (firstName.trim().length > 100) {
    errors.push({
      field: "firstName",
      message: "First name cannot exceed 100 characters.",
    });
  }

  // 2. Last Name
  if (
    !lastName ||
    typeof lastName !== "string" ||
    lastName.trim().length === 0
  ) {
    errors.push({
      field: "lastName",
      message: "Last name is required and cannot be empty.",
    });
  } else if (lastName.trim().length > 100) {
    errors.push({
      field: "lastName",
      message: "Last name cannot exceed 100 characters.",
    });
  }

  // 3. Gender
  if (!gender || !ALLOWED_GENDERS.includes(gender)) {
    errors.push({
      field: "gender",
      message: `Gender must be one of: ${ALLOWED_GENDERS.join(", ")}.`,
    });
  }

  // 4. Date of Birth
  if (!dateOfBirth || typeof dateOfBirth !== "string") {
    errors.push({
      field: "dateOfBirth",
      message: "A valid date of birth (YYYY-MM-DD) is required.",
    });
  } else {
    const dob = new Date(dateOfBirth);
    if (isNaN(dob.getTime())) {
      errors.push({
        field: "dateOfBirth",
        message: "Invalid date of birth format.",
      });
    } else {
      const now = new Date();
      if (dob > now) {
        errors.push({
          field: "dateOfBirth",
          message: "Date of birth cannot be in the future.",
        });
      } else {
        // Minimum age verification (18 years)
        const eighteenYearsAgo = new Date();
        eighteenYearsAgo.setFullYear(now.getFullYear() - 18);

        const hundredYearsAgo = new Date();
        hundredYearsAgo.setFullYear(now.getFullYear() - 110);

        if (dob > eighteenYearsAgo) {
          errors.push({
            field: "dateOfBirth",
            message: "Candidate must be at least 18 years old to register on Manglam Matrimony.",
          });
        } else if (dob < hundredYearsAgo) {
          errors.push({
            field: "dateOfBirth",
            message: "Please enter a realistic date of birth.",
          });
        }
      }
    }
  }

  // 5. Marital Status
  if (!maritalStatus || !ALLOWED_MARITAL_STATUSES.includes(maritalStatus)) {
    errors.push({
      field: "maritalStatus",
      message: `Marital status must be one of: ${ALLOWED_MARITAL_STATUSES.join(", ")}.`,
    });
  }

  // 6. Height (cm)
  const numHeight = Number(heightCm);
  if (
    heightCm === undefined ||
    heightCm === null ||
    isNaN(numHeight) ||
    !Number.isInteger(numHeight) ||
    numHeight < 100 ||
    numHeight > 250
  ) {
    errors.push({
      field: "heightCm",
      message: "Height must be an integer between 100 cm and 250 cm.",
    });
  }

  // 7. Mother Tongue ID
  if (
    !motherTongueId ||
    typeof motherTongueId !== "string" ||
    motherTongueId.trim().length === 0
  ) {
    errors.push({
      field: "motherTongueId",
      message: "Mother tongue is required.",
    });
  }

  // 8. Spoken Languages (optional array)
  if (languageIds !== undefined && !Array.isArray(languageIds)) {
    errors.push({
      field: "languageIds",
      message: "Languages must be an array of language IDs.",
    });
  }

  // 9. City (optional string, max 100 chars)
  if (city !== undefined && city !== null) {
    if (typeof city !== "string") {
      errors.push({
        field: "city",
        message: "City must be a text value.",
      });
    } else if (city.trim().length > 100) {
      errors.push({
        field: "city",
        message: "City cannot exceed 100 characters.",
      });
    }
  }

  // 10. State (optional string, max 100 chars)
  if (state !== undefined && state !== null) {
    if (typeof state !== "string") {
      errors.push({
        field: "state",
        message: "State must be a text value.",
      });
    } else if (state.trim().length > 100) {
      errors.push({
        field: "state",
        message: "State cannot exceed 100 characters.",
      });
    }
  }

  if (errors.length > 0) {
    res.status(400).json({
      success: false,
      code: "VALIDATION_ERROR",
      message: errors[0].message,
      error: {
        code: "VALIDATION_ERROR",
        details: errors,
      },
    });
    return;
  }

  // Sanitize values
  req.body.firstName = firstName.trim();
  req.body.lastName = lastName.trim();
  req.body.heightCm = numHeight;
  req.body.motherTongueId = motherTongueId.trim();
  if (city && typeof city === "string") {
    req.body.city = city.trim();
  } else if (city === null) {
    req.body.city = null;
  }
  if (state && typeof state === "string") {
    req.body.state = state.trim();
  } else if (state === null) {
    req.body.state = null;
  }

  next();
}

export function validateReligionDetails(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const {
    religionId,
    communityId,
    subCommunityId,
    casteId,
    subCasteId,
    gotraId,
    manglik,
  } = req.body;

  // 1. Religion ID is Required
  if (!religionId || typeof religionId !== "string" || religionId.trim().length === 0) {
    res.status(400).json({
      success: false,
      code: "INVALID_RELIGION",
      message: "Religion is required. Please select a valid religion.",
    });
    return;
  }

  // 2. Validate optional string ID formats if provided
  if (communityId !== undefined && communityId !== null && typeof communityId !== "string") {
    res.status(400).json({
      success: false,
      code: "INVALID_COMMUNITY",
      message: "Community ID must be a string or null.",
    });
    return;
  }

  if (subCommunityId !== undefined && subCommunityId !== null && typeof subCommunityId !== "string") {
    res.status(400).json({
      success: false,
      code: "INVALID_SUB_COMMUNITY",
      message: "Sub-community ID must be a string or null.",
    });
    return;
  }

  if (casteId !== undefined && casteId !== null && typeof casteId !== "string") {
    res.status(400).json({
      success: false,
      code: "INVALID_CASTE",
      message: "Caste ID must be a string or null.",
    });
    return;
  }

  if (subCasteId !== undefined && subCasteId !== null && typeof subCasteId !== "string") {
    res.status(400).json({
      success: false,
      code: "INVALID_SUB_CASTE",
      message: "Sub-caste ID must be a string or null.",
    });
    return;
  }

  if (gotraId !== undefined && gotraId !== null && typeof gotraId !== "string") {
    res.status(400).json({
      success: false,
      code: "INVALID_GOTRA",
      message: "Gotra ID must be a string or null.",
    });
    return;
  }

  // 3. Validate Custom Fields (Optional, but if provided must be non-empty string <= 100 chars)
  const { customReligion, customCommunity, customCaste, customSubCaste } = req.body;

  if (customReligion !== undefined && customReligion !== null) {
    if (typeof customReligion !== "string" || customReligion.trim().length === 0) {
      res.status(400).json({
        success: false,
        code: "INVALID_CUSTOM_RELIGION",
        message: "Please specify your religion.",
      });
      return;
    }
    if (customReligion.trim().length > 100) {
      res.status(400).json({
        success: false,
        code: "INVALID_CUSTOM_RELIGION",
        message: "Custom religion cannot exceed 100 characters.",
      });
      return;
    }
  }

  if (customCommunity !== undefined && customCommunity !== null) {
    if (typeof customCommunity !== "string" || customCommunity.trim().length === 0) {
      res.status(400).json({
        success: false,
        code: "INVALID_CUSTOM_COMMUNITY",
        message: "Please specify your community.",
      });
      return;
    }
    if (customCommunity.trim().length > 100) {
      res.status(400).json({
        success: false,
        code: "INVALID_CUSTOM_COMMUNITY",
        message: "Custom community cannot exceed 100 characters.",
      });
      return;
    }
  }

  if (customCaste !== undefined && customCaste !== null) {
    if (typeof customCaste !== "string" || customCaste.trim().length === 0) {
      res.status(400).json({
        success: false,
        code: "INVALID_CUSTOM_CASTE",
        message: "Please specify your caste.",
      });
      return;
    }
    if (customCaste.trim().length > 100) {
      res.status(400).json({
        success: false,
        code: "INVALID_CUSTOM_CASTE",
        message: "Custom caste cannot exceed 100 characters.",
      });
      return;
    }
  }

  if (customSubCaste !== undefined && customSubCaste !== null) {
    if (typeof customSubCaste !== "string" || customSubCaste.trim().length === 0) {
      res.status(400).json({
        success: false,
        code: "INVALID_CUSTOM_SUB_CASTE",
        message: "Please specify your sub-caste.",
      });
      return;
    }
    if (customSubCaste.trim().length > 100) {
      res.status(400).json({
        success: false,
        code: "INVALID_CUSTOM_SUB_CASTE",
        message: "Custom sub-caste cannot exceed 100 characters.",
      });
      return;
    }
  }

  // 4. Validate Manglik Enum (Optional)
  if (manglik !== undefined && manglik !== null) {
    if (typeof manglik !== "string" || !ALLOWED_MANGLIK_STATUSES.includes(manglik as ManglikStatus)) {
      res.status(400).json({
        success: false,
        code: "INVALID_MANGLIK_STATUS",
        message: `Manglik status must be one of: ${ALLOWED_MANGLIK_STATUSES.join(", ")}.`,
      });
      return;
    }
  }

  // Sanitize
  req.body.religionId = religionId.trim();
  req.body.communityId = communityId ? communityId.trim() : null;
  req.body.subCommunityId = subCommunityId ? subCommunityId.trim() : null;
  req.body.casteId = casteId ? casteId.trim() : null;
  req.body.subCasteId = subCasteId ? subCasteId.trim() : null;
  req.body.gotraId = gotraId ? gotraId.trim() : null;
  req.body.manglik = manglik ?? null;
  req.body.customReligion = customReligion && typeof customReligion === "string" ? customReligion.trim() : null;
  req.body.customCommunity = customCommunity && typeof customCommunity === "string" ? customCommunity.trim() : null;
  req.body.customCaste = customCaste && typeof customCaste === "string" ? customCaste.trim() : null;
  req.body.customSubCaste = customSubCaste && typeof customSubCaste === "string" ? customSubCaste.trim() : null;

  next();
}

export function validateEducationCareerDetails(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const { education, career } = req.body;

  // 1. Structure checks
  if (!education || typeof education !== "object") {
    res.status(400).json({
      success: false,
      code: "VALIDATION_ERROR",
      message: "Education details are required.",
    });
    return;
  }

  if (!career || typeof career !== "object") {
    res.status(400).json({
      success: false,
      code: "VALIDATION_ERROR",
      message: "Career details are required.",
    });
    return;
  }

  // 2. Education fields
  const {
    educationId,
    specializationId,
    institutionId,
    institutionName,
  } = education;

  if (!educationId || typeof educationId !== "string" || educationId.trim().length === 0) {
    res.status(400).json({
      success: false,
      code: "INVALID_EDUCATION",
      message: "Highest education is required. Please select a valid education level.",
    });
    return;
  }

  if (specializationId !== undefined && specializationId !== null && typeof specializationId !== "string") {
    res.status(400).json({
      success: false,
      code: "INVALID_SPECIALIZATION",
      message: "Specialization ID must be a string or null.",
    });
    return;
  }

  if (institutionId !== undefined && institutionId !== null && typeof institutionId !== "string") {
    res.status(400).json({
      success: false,
      code: "INVALID_INSTITUTION",
      message: "Institution ID must be a string or null.",
    });
    return;
  }

  if (institutionName !== undefined && institutionName !== null) {
    if (typeof institutionName !== "string" || institutionName.trim().length === 0) {
      education.institutionName = null;
    } else if (institutionName.trim().length > 200) {
      res.status(400).json({
        success: false,
        code: "VALIDATION_ERROR",
        message: "Institution name cannot exceed 200 characters.",
      });
      return;
    } else {
      education.institutionName = institutionName.trim();
    }
  }

  // 3. Career fields
  const {
    employmentStatusId,
    occupationId,
    companyName,
    employmentType,
    annualIncomeRange,
  } = career;

  if (!employmentStatusId || typeof employmentStatusId !== "string" || employmentStatusId.trim().length === 0) {
    res.status(400).json({
      success: false,
      code: "INVALID_EMPLOYMENT_STATUS",
      message: "Employment status is required. Please select a valid status.",
    });
    return;
  }

  if (occupationId !== undefined && occupationId !== null && typeof occupationId !== "string") {
    res.status(400).json({
      success: false,
      code: "INVALID_OCCUPATION",
      message: "Occupation ID must be a string or null.",
    });
    return;
  }

  if (companyName !== undefined && companyName !== null) {
    if (typeof companyName !== "string" || companyName.trim().length === 0) {
      career.companyName = null;
    } else if (companyName.trim().length > 200) {
      res.status(400).json({
        success: false,
        code: "VALIDATION_ERROR",
        message: "Company name cannot exceed 200 characters.",
      });
      return;
    } else {
      career.companyName = companyName.trim();
    }
  }

  if (employmentType !== undefined && employmentType !== null) {
    if (typeof employmentType !== "string" || !ALLOWED_EMPLOYMENT_TYPES.includes(employmentType as EmploymentType)) {
      res.status(400).json({
        success: false,
        code: "INVALID_EMPLOYMENT_TYPE",
        message: `Employment type must be one of: ${ALLOWED_EMPLOYMENT_TYPES.join(", ")}.`,
      });
      return;
    }
  }

  if (annualIncomeRange !== undefined && annualIncomeRange !== null) {
    if (typeof annualIncomeRange !== "string" || !ALLOWED_INCOME_RANGES.includes(annualIncomeRange as AnnualIncomeRange)) {
      res.status(400).json({
        success: false,
        code: "INVALID_ANNUAL_INCOME_RANGE",
        message: `Annual income range must be one of: ${ALLOWED_INCOME_RANGES.join(", ")}.`,
      });
      return;
    }
  }

  // Sanitize values
  education.educationId = educationId.trim();
  education.specializationId = specializationId ? specializationId.trim() : null;
  education.institutionId = institutionId ? institutionId.trim() : null;

  career.employmentStatusId = employmentStatusId.trim();
  career.occupationId = occupationId ? occupationId.trim() : null;
  career.employmentType = employmentType ?? null;
  career.annualIncomeRange = annualIncomeRange ?? null;

  next();
}

export function validatePartnerPreferences(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const {
    minAge,
    maxAge,
    minHeightCm,
    maxHeightCm,
    religionIds,
    communityIds,
    subCommunityIds,
    casteIds,
    gotraIds,
    educationIds,
    occupationIds,
    manglikStatuses,
    maritalStatuses,
  } = req.body;

  // 1. Validate Age Range
  if (minAge !== undefined && minAge !== null) {
    const parsedMinAge = Number(minAge);
    if (!Number.isInteger(parsedMinAge) || parsedMinAge < 18 || parsedMinAge > 100) {
      res.status(400).json({
        success: false,
        code: "INVALID_AGE_RANGE",
        message: "minAge must be an integer between 18 and 100.",
      });
      return;
    }
    req.body.minAge = parsedMinAge;
  }

  if (maxAge !== undefined && maxAge !== null) {
    const parsedMaxAge = Number(maxAge);
    if (!Number.isInteger(parsedMaxAge) || parsedMaxAge < 18 || parsedMaxAge > 100) {
      res.status(400).json({
        success: false,
        code: "INVALID_AGE_RANGE",
        message: "maxAge must be an integer between 18 and 100.",
      });
      return;
    }
    req.body.maxAge = parsedMaxAge;
  }

  if (
    req.body.minAge !== undefined &&
    req.body.minAge !== null &&
    req.body.maxAge !== undefined &&
    req.body.maxAge !== null
  ) {
    if (req.body.minAge > req.body.maxAge) {
      res.status(400).json({
        success: false,
        code: "INVALID_AGE_RANGE",
        message: "Minimum age cannot be greater than maximum age.",
      });
      return;
    }
  }

  // 2. Validate Height Range
  if (minHeightCm !== undefined && minHeightCm !== null) {
    const parsedMinHeight = Number(minHeightCm);
    if (!Number.isInteger(parsedMinHeight) || parsedMinHeight < 100 || parsedMinHeight > 250) {
      res.status(400).json({
        success: false,
        code: "INVALID_HEIGHT_RANGE",
        message: "minHeightCm must be an integer between 100 and 250 cm.",
      });
      return;
    }
    req.body.minHeightCm = parsedMinHeight;
  }

  if (maxHeightCm !== undefined && maxHeightCm !== null) {
    const parsedMaxHeight = Number(maxHeightCm);
    if (!Number.isInteger(parsedMaxHeight) || parsedMaxHeight < 100 || parsedMaxHeight > 250) {
      res.status(400).json({
        success: false,
        code: "INVALID_HEIGHT_RANGE",
        message: "maxHeightCm must be an integer between 100 and 250 cm.",
      });
      return;
    }
    req.body.maxHeightCm = parsedMaxHeight;
  }

  if (
    req.body.minHeightCm !== undefined &&
    req.body.minHeightCm !== null &&
    req.body.maxHeightCm !== undefined &&
    req.body.maxHeightCm !== null
  ) {
    if (req.body.minHeightCm > req.body.maxHeightCm) {
      res.status(400).json({
        success: false,
        code: "INVALID_HEIGHT_RANGE",
        message: "Minimum height cannot be greater than maximum height.",
      });
      return;
    }
  }

  // 3. Validate Array Types
  const arrayFields = [
    { name: "religionIds", val: religionIds },
    { name: "communityIds", val: communityIds },
    { name: "subCommunityIds", val: subCommunityIds },
    { name: "casteIds", val: casteIds },
    { name: "gotraIds", val: gotraIds },
    { name: "educationIds", val: educationIds },
    { name: "occupationIds", val: occupationIds },
    { name: "manglikStatuses", val: manglikStatuses },
    { name: "maritalStatuses", val: maritalStatuses },
  ];

  for (const { name, val } of arrayFields) {
    if (val !== undefined && val !== null && !Array.isArray(val)) {
      res.status(400).json({
        success: false,
        code: "VALIDATION_ERROR",
        message: `${name} must be an array.`,
      });
      return;
    }
  }

  // 4. Validate Manglik Enum Values
  if (Array.isArray(manglikStatuses)) {
    for (const status of manglikStatuses) {
      if (typeof status !== "string" || !ALLOWED_MANGLIK_STATUSES.includes(status as ManglikStatus)) {
        res.status(400).json({
          success: false,
          code: "INVALID_PARTNER_MANGLIK_STATUS",
          message: `Invalid partner Manglik status '${status}'. Must be one of: ${ALLOWED_MANGLIK_STATUSES.join(", ")}.`,
        });
        return;
      }
    }
  }

  // 5. Validate Marital Status Enum Values
  if (Array.isArray(maritalStatuses)) {
    for (const status of maritalStatuses) {
      if (typeof status !== "string" || !ALLOWED_MARITAL_STATUSES.includes(status as MaritalStatus)) {
        res.status(400).json({
          success: false,
          code: "INVALID_PARTNER_MARITAL_STATUS",
          message: `Invalid partner marital status '${status}'. Must be one of: ${ALLOWED_MARITAL_STATUSES.join(", ")}.`,
        });
        return;
      }
    }
  }

  next();
}
