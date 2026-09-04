# Manglam Matrimony — PostgreSQL & Prisma Database Documentation

## 1. Architectural Overview

The Manglam Matrimony backend data foundation is built with **PostgreSQL** and **Prisma ORM**. It cleanly decouples the **Authenticated User Account** from the **Matrimonial Profile**:

```
[users] (Authenticated Account, Phone/Email)
   │ (1:1 relation, Cascade on Delete)
   ▼
[profiles] (Matrimonial Profile, status, completion %)
   ├── [profile_personal_details] (1:1 - Name, gender, DOB, height_cm, marital status)
   │        └── [languages] (Mother tongue - Restrict on Delete)
   ├── [profile_languages] (M:N - Spoken languages)
   ├── [profile_religion] (1:1 - Religion, Community, Caste, Gotra, Manglik)
   │        ├── [religions] (Master data)
   │        ├── [communities] (Master data)
   │        ├── [sub_communities] (Master data)
   │        ├── [castes] (Master data)
   │        ├── [sub_castes] (Master data)
   │        └── [gotras] (Master data)
   ├── [profile_education] (1:1 - Education, Specialization, Institution)
   │        ├── [educations] (Master data)
   │        ├── [specializations] (Master data)
   │        └── [institutions] (Master data / Other dynamic name)
   ├── [profile_career] (1:1 - Employment status, Occupation, Company, Income)
   │        ├── [employment_statuses] (Master data)
   │        └── [occupations] (Master data)
   ├── [profile_photos] (1:N - S3/Storage key metadata, moderation status)
   └── [partner_preferences] (1:1 - Age range, height range)
            ├── [partner_preference_religions] (M:N)
            ├── [partner_preference_communities] (M:N)
            ├── [partner_preference_sub_communities] (M:N)
            ├── [partner_preference_castes] (M:N)
            ├── [partner_preference_gotras] (M:N)
            ├── [partner_preference_educations] (M:N)
            ├── [partner_preference_occupations] (M:N)
            ├── [partner_preference_manglik] (M:N)
            └── [partner_preference_marital_statuses] (M:N)
```

---

## 2. Core Models (1 – 8)

### 1. `users`
Represents the authenticated account created after OTP verification.
- `id` (String / UUID PK)
- `phone` (String, Unique, Nullable)
- `email` (String, Unique, Nullable)
- `phone_verified_at` (Timestamp, Nullable)
- `email_verified_at` (Timestamp, Nullable)
- `status` (`UserStatus` enum: `ACTIVE`, `SUSPENDED`, `BLOCKED`, `DELETED`)
- `created_at`, `updated_at`

### 2. `profiles`
The matrimonial profile entity. Created with `INCOMPLETE` status and populated throughout onboarding.
- `id` (String / UUID PK)
- `user_id` (String, Unique FK → `users.id`, `onDelete: Cascade`)
- `profile_created_for` (`ProfileCreatedFor` enum: `MYSELF`, `MY_SON`, `MY_DAUGHTER`, `MY_BROTHER`, `MY_SISTER`, `MY_RELATIVE`, `OTHER`)
- `profile_status` (`ProfileStatus` enum: `INCOMPLETE`, `IN_REVIEW`, `ACTIVE`, `REJECTED`, `SUSPENDED`, Default: `INCOMPLETE`)
- `completion_percentage` (Integer, 0–100, Default: 0)
- `created_at`, `updated_at`

### 3. `profile_personal_details`
One-to-one with profile.
- `id` (String / UUID PK)
- `profile_id` (String, Unique FK → `profiles.id`, `onDelete: Cascade`)
- `first_name` (String), `last_name` (String)
- `gender` (`Gender` enum: `MALE`, `FEMALE`, `OTHER`)
- `date_of_birth` (Timestamp)
- `marital_status` (`MaritalStatus` enum: `NEVER_MARRIED`, `DIVORCED`, `WIDOWED`, `AWAITING_DIVORCE`, `ANNULLED`)
- `height_cm` (Integer - Strict numeric centimeters, e.g., `175`)
- `mother_tongue_id` (String FK → `languages.id`, `onDelete: Restrict`)

### 4. `profile_languages` (Junction Table)
Supports multiple spoken languages without comma-separated string anti-patterns.
- `profile_id` (FK → `profiles.id`, `onDelete: Cascade`)
- `language_id` (FK → `languages.id`, `onDelete: Restrict`)
- Composite PK: `(profile_id, language_id)`

### 5. `profile_religion`
One-to-one with profile.
- `id` (String / UUID PK)
- `profile_id` (String, Unique FK → `profiles.id`, `onDelete: Cascade`)
- `religion_id` (FK → `religions.id`, `onDelete: Restrict`)
- `community_id` (FK → `communities.id`, Nullable, `onDelete: Restrict`)
- `sub_community_id` (FK → `sub_communities.id`, Nullable, `onDelete: Restrict`)
- `caste_id` (FK → `castes.id`, Nullable, `onDelete: Restrict`)
- `sub_caste_id` (FK → `sub_castes.id`, Nullable, `onDelete: Restrict`)
- `gotra_id` (FK → `gotras.id`, Nullable, `onDelete: Restrict`)
- `manglik` (`ManglikStatus` enum: `YES`, `NO`, `DONT_KNOW`, `NOT_APPLICABLE`)

### 6. `profile_education`
One-to-one with profile. Supports both standard catalog institution IDs and custom typed names for "Other".
- `id` (String / UUID PK)
- `profile_id` (String, Unique FK → `profiles.id`, `onDelete: Cascade`)
- `education_id` (FK → `educations.id`, `onDelete: Restrict`)
- `specialization_id` (FK → `specializations.id`, Nullable, `onDelete: Restrict`)
- `institution_id` (FK → `institutions.id`, Nullable, `onDelete: Restrict`)
- `institution_name` (String, Nullable)

### 7. `profile_career`
One-to-one with profile.
- `id` (String / UUID PK)
- `profile_id` (String, Unique FK → `profiles.id`, `onDelete: Cascade`)
- `employment_status_id` (FK → `employment_statuses.id`, `onDelete: Restrict`)
- `occupation_id` (FK → `occupations.id`, Nullable, `onDelete: Restrict`)
- `company_name` (String, Nullable)
- `employment_type` (`EmploymentType` enum: `FULL_TIME`, `PART_TIME`, `CONTRACT`, `FREELANCE`, `INTERNSHIP`, `OTHER`, Nullable)
- `annual_income_range` (`AnnualIncomeRange` enum, Nullable)

### 8. `profile_photos`
Stores metadata and object-storage keys. Image binaries are strictly prohibited from relational database storage.
- `id` (String / UUID PK)
- `profile_id` (String, FK → `profiles.id`, `onDelete: Cascade`)
- `storage_key` (String, Object storage identifier)
- `original_file_name` (String), `mime_type` (String), `file_size` (Integer)
- `width` (Integer, Nullable), `height` (Integer, Nullable)
- `photo_type` (`PhotoType` enum: `PRIMARY`, `ADDITIONAL`)
- `moderation_status` (`ModerationStatus` enum: `PENDING`, `APPROVED`, `REJECTED`, Default: `PENDING`)
- `moderation_reason` (String, Nullable)
- `sort_order` (Integer, Default: 0)

### 9. `partner_preferences`
One-to-one with profile.
- `id` (String / UUID PK)
- `profile_id` (String, Unique FK → `profiles.id`, `onDelete: Cascade`)
- `min_age` (Integer, Nullable), `max_age` (Integer, Nullable)
- `min_height_cm` (Integer, Nullable), `max_height_cm` (Integer, Nullable)
- **Relational Junction Tables**:
  - `partner_preference_religions` (`(partner_preference_id, religion_id)`)
  - `partner_preference_communities` (`(partner_preference_id, community_id)`)
  - `partner_preference_sub_communities` (`(partner_preference_id, sub_community_id)`)
  - `partner_preference_castes` (`(partner_preference_id, caste_id)`)
  - `partner_preference_gotras` (`(partner_preference_id, gotra_id)`)
  - `partner_preference_educations` (`(partner_preference_id, education_id)`)
  - `partner_preference_occupations` (`(partner_preference_id, occupation_id)`)
  - `partner_preference_manglik` (`(partner_preference_id, manglik)`)
  - `partner_preference_marital_statuses` (`(partner_preference_id, marital_status)`)

---

## 3. Master Data Entities (10 – 20)

| Table | Slugs / Values Seeded | Description |
| :--- | :--- | :--- |
| **`religions`** | `hindu`, `muslim`, `christian`, `sikh`, `jain`, `buddhist`, `parsi`, `jewish`, `other`, `prefer-not-to-say` | Core religions list. |
| **`communities`** | `brahmin`, `rajput`, `jat`, `gujjar`, `kayastha`, `baniya-vaishya`, `kshatriya`, `yadav`, `kurmi`, `maratha`, `patel`, `reddy`, `kamma`, `nair`, `ezhava`, `lingayat`, `vokkaliga`, `agarwal`, `other`, `prefer-not-to-say` | Initial specification community seed. `religion_id` left unmapped for later expansion. |
| **`sub_communities`** | Extensible schema (`community_id`, `name`, `slug`, `is_active`) | Dependent on Community. |
| **`castes`** | Extensible schema (`community_id`, `name`, `slug`, `is_active`) | Dependent on Community. |
| **`sub_castes`** | Extensible schema (`caste_id`, `name`, `slug`, `is_active`) | Dependent on Caste. |
| **`gotras`** | Extensible schema (`community_id`, `name`, `slug`, `is_active`) | Dependent on Community. |
| **`educations`** | `10th`, `12th`, `diploma`, `ba`, `bsc`, `bcom`, `bba`, `bca`, `be`, `btech`, `ma`, `msc`, `mcom`, `mba`, `mca`, `me`, `mtech`, `mbbs`, `bds`, `llb`, `llm`, `ca`, `cs`, `phd`, `other` | Degrees and qualification master records. |
| **`specializations`**| Extensible schema (`education_id`, `name`, `slug`, `is_active`) | Dependent on Education degree. |
| **`institutions`** | Dynamic catalog (`name`, `normalized_name`, `type`, `is_active`) | Supports autocomplete search. |
| **`employment_statuses`** | `employed`, `self-employed`, `business-owner`, `entrepreneur`, `government-employee`, `defence`, `student`, `not-working`, `retired`, `other` | Top-level employment category. |
| **`occupations`** | Extensible schema (`employment_status_id`, `name`, `slug`, `is_active`) | Dependent on Employment status. |
| **`languages`** | `hi`, `en`, `bn`, `te`, `mr`, `ta`, `ur`, `gu`, `kn`, `or`, `ml`, `pa`, `as`, `mai`, `sa`, `mwr`, `sd`, `kok`, `ks`, `doi`, `other` | Official/widely spoken Indian languages. |

---

## 4. Controlled Enums

1. **`UserStatus`**: `ACTIVE`, `SUSPENDED`, `BLOCKED`, `DELETED`
2. **`ProfileCreatedFor`**: `MYSELF`, `MY_SON`, `MY_DAUGHTER`, `MY_BROTHER`, `MY_SISTER`, `MY_RELATIVE`, `OTHER`
3. **`ProfileStatus`**: `INCOMPLETE`, `IN_REVIEW`, `ACTIVE`, `REJECTED`, `SUSPENDED`
4. **`Gender`**: `MALE`, `FEMALE`, `OTHER`
5. **`MaritalStatus`**: `NEVER_MARRIED`, `DIVORCED`, `WIDOWED`, `AWAITING_DIVORCE`, `ANNULLED`
6. **`ManglikStatus`**: `YES`, `NO`, `DONT_KNOW`, `NOT_APPLICABLE`
7. **`EmploymentType`**: `FULL_TIME`, `PART_TIME`, `CONTRACT`, `FREELANCE`, `INTERNSHIP`, `OTHER`
8. **`AnnualIncomeRange`**: `BELOW_2_LAKH`, `TWO_TO_FIVE_LAKH`, `FIVE_TO_TEN_LAKH`, `TEN_TO_FIFTEEN_LAKH`, `FIFTEEN_TO_TWENTY_LAKH`, `TWENTY_TO_THIRTY_LAKH`, `THIRTY_TO_FIFTY_LAKH`, `FIFTY_LAKH_TO_ONE_CRORE`, `ABOVE_ONE_CRORE`, `PREFER_NOT_TO_SAY`
9. **`PhotoType`**: `PRIMARY`, `ADDITIONAL`
10. **`ModerationStatus`**: `PENDING`, `APPROVED`, `REJECTED`

---

## 5. Explicitly Excluded Fields (Out of Scope / Removed)

The following fields are **strictly prohibited** from the Profile schema in Phase 1:
- ❌ **`religionPractice`** (Removed from product scope)
- ❌ **`industry`** (Removed from career scope)
- ❌ **`workLocation`** / **`location`** / **`profileLocation`** (Removed from profile scope)
- ❌ **`lifestyle`** (Removed from profile scope)
- ❌ **`advisorId`** (Advisor system will be implemented via standalone assignment tables in a future phase)
- ❌ **`membershipId`** / **`commission`** / **`payment`** (Deferred to monetization phase)

---

## 6. Migration & Seed Operations

### Development Commands:
```bash
# 1. Generate Prisma Client types
npm run db:generate

# 2. Apply migrations locally
npm run db:migrate

# 3. Seed master data (Idempotent)
npm run db:seed

# 4. Verify database functionality
npx tsx scripts/verify-database.ts
```

### Production Deployment Procedure:
```bash
# 1. Run migrations safely in production (no schema loss)
npx prisma migrate deploy

# 2. Run idempotent master data seed
npm run db:seed
```
