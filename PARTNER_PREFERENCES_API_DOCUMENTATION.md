# Manglam Matrimony — Partner Preferences API Documentation

## 1. Core Concept & Architectural Separation

Partner Preferences define a candidate's criteria for a prospective partner and are **strictly separated from profile identity**:
- **Profile Identity** (e.g., `profile_religion`, `profile_education`, `profile_career`): Represents the actual attributes of the registered candidate.
- **Partner Preferences** (`partner_preferences` and associated junction tables): Represents the desired attributes of their prospective match (which may include multiple religions, communities, castes, educations, or occupations).

```
[ Candidate Profile ] ─── (1:1) ─── [ PartnerPreference ]
                                           ├── (1:N) ── [ partner_preference_religions ]
                                           ├── (1:N) ── [ partner_preference_communities ]
                                           ├── (1:N) ── [ partner_preference_sub_communities ]
                                           ├── (1:N) ── [ partner_preference_castes ]
                                           ├── (1:N) ── [ partner_preference_gotras ]
                                           ├── (1:N) ── [ partner_preference_educations ]
                                           ├── (1:N) ── [ partner_preference_occupations ]
                                           ├── (1:N) ── [ partner_preference_manglik ]
                                           └── (1:N) ── [ partner_preference_marital_statuses ]
```

---

## 2. API Endpoints

### 1. Save / Replace Partner Preferences

- **Route**: `PUT /api/profile/partner-preferences`
- **Authentication**: Required (`Authorization: Bearer <JWT>`)
- **Semantics**: Complete atomic replacement (`PUT`). All existing preferences and junction records are synchronized atomically.
- **Empty Array Semantics**: An empty array `[]` indicates "No preference / all acceptable".

#### Request Body (`application/json`):
```json
{
  "minAge": 24,
  "maxAge": 30,
  "minHeightCm": 155,
  "maxHeightCm": 175,
  "religionIds": [
    "rel_hindu_uuid",
    "rel_jain_uuid"
  ],
  "communityIds": [
    "com_brahmin_uuid",
    "com_rajput_uuid"
  ],
  "subCommunityIds": [
    "subcom_kanyakubj_uuid"
  ],
  "casteIds": [
    "cst_sharma_uuid"
  ],
  "gotraIds": [
    "gtr_vashistha_uuid"
  ],
  "educationIds": [
    "edu_btech_uuid",
    "edu_mba_uuid"
  ],
  "occupationIds": [
    "occ_software_engineer_uuid"
  ],
  "manglikStatuses": [
    "YES",
    "DONT_KNOW"
  ],
  "maritalStatuses": [
    "NEVER_MARRIED"
  ]
}
```

#### Success Response (`200 OK`):
```json
{
  "success": true,
  "message": "Partner preferences saved successfully.",
  "data": {
    "partnerPreferences": {
      "id": "pp_8f902ba1c841",
      "profileId": "prf_7b82f1092e",
      "minAge": 24,
      "maxAge": 30,
      "minHeightCm": 155,
      "maxHeightCm": 175,
      "religions": [
        { "id": "rel_hindu_uuid", "name": "Hindu", "slug": "hindu" },
        { "id": "rel_jain_uuid", "name": "Jain", "slug": "jain" }
      ],
      "communities": [
        { "id": "com_brahmin_uuid", "name": "Brahmin", "slug": "brahmin" },
        { "id": "com_rajput_uuid", "name": "Rajput", "slug": "rajput" }
      ],
      "subCommunities": [
        { "id": "subcom_kanyakubj_uuid", "name": "Kanyakubj", "slug": "kanyakubj" }
      ],
      "castes": [
        { "id": "cst_sharma_uuid", "name": "Sharma", "slug": "sharma" }
      ],
      "gotras": [
        { "id": "gtr_vashistha_uuid", "name": "Vashistha", "slug": "vashistha" }
      ],
      "educations": [
        { "id": "edu_btech_uuid", "name": "B.Tech / B.E.", "slug": "b-tech-b-e" },
        { "id": "edu_mba_uuid", "name": "MBA", "slug": "mba" }
      ],
      "occupations": [
        { "id": "occ_software_engineer_uuid", "name": "Software Engineer", "slug": "software-engineer" }
      ],
      "manglikStatuses": [
        "YES",
        "DONT_KNOW"
      ],
      "maritalStatuses": [
        "NEVER_MARRIED"
      ],
      "createdAt": "2026-08-31T15:30:00.000Z",
      "updatedAt": "2026-08-31T15:30:00.000Z"
    },
    "profile": {
      "completionPercentage": 100,
      "profileStatus": "INCOMPLETE"
    }
  }
}
```

---

### 2. Get Partner Preferences

- **Route**: `GET /api/profile/partner-preferences`
- **Authentication**: Required (`Authorization: Bearer <JWT>`)

#### Success Response (`200 OK` — Configured):
```json
{
  "success": true,
  "message": "Partner preferences retrieved successfully.",
  "data": {
    "partnerPreferences": {
      "id": "pp_8f902ba1c841",
      "profileId": "prf_7b82f1092e",
      "minAge": 24,
      "maxAge": 30,
      "minHeightCm": 155,
      "maxHeightCm": 175,
      "religions": [ ... ],
      "communities": [ ... ],
      "subCommunities": [ ... ],
      "castes": [ ... ],
      "gotras": [ ... ],
      "educations": [ ... ],
      "occupations": [ ... ],
      "manglikStatuses": [ "YES", "DONT_KNOW" ],
      "maritalStatuses": [ "NEVER_MARRIED" ],
      "createdAt": "2026-08-31T15:30:00.000Z",
      "updatedAt": "2026-08-31T15:30:00.000Z"
    }
  }
}
```

#### Success Response (`200 OK` — Unconfigured):
```json
{
  "success": true,
  "message": "Partner preferences not configured.",
  "data": null
}
```

---

## 3. Hierarchical Validation & Business Rules

1. **Age Range**:
   - `minAge` and `maxAge` are optional integers between 18 and 100.
   - When both are provided: `minAge <= maxAge`, else returns `INVALID_AGE_RANGE` (400).
2. **Height Range**:
   - `minHeightCm` and `maxHeightCm` are optional integers between 100 and 250 cm.
   - When both are provided: `minHeightCm <= maxHeightCm`, else returns `INVALID_HEIGHT_RANGE` (400).
3. **Religions Validation**:
   - All `religionIds` must exist and have `isActive: true`. If not: `INVALID_PARTNER_RELIGION` (400).
4. **Communities Hierarchy**:
   - All `communityIds` must exist and be active. If not: `INVALID_PARTNER_COMMUNITY` (400).
   - If `community.religionId` is defined and `religionIds` are provided, the community's `religionId` must belong to the selected `religionIds`. Otherwise: `PARTNER_COMMUNITY_RELIGION_MISMATCH` (400).
5. **Sub-Communities Hierarchy**:
   - `subCommunityIds` require `communityIds` to be selected. If empty: `PARTNER_SUB_COMMUNITY_PARENT_MISMATCH` (400).
   - Each `subCommunity.communityId` must be in `communityIds`. Otherwise: `PARTNER_SUB_COMMUNITY_PARENT_MISMATCH` (400).
6. **Castes Hierarchy**:
   - `casteIds` require `communityIds` to be selected.
   - If `caste.communityId` is defined, it must belong to `communityIds`. Otherwise: `PARTNER_CASTE_COMMUNITY_MISMATCH` (400).
7. **Gotras Hierarchy**:
   - `gotraIds` require `communityIds` to be selected.
   - If `gotra.communityId` is defined, it must belong to `communityIds`. Otherwise: `PARTNER_GOTRA_COMMUNITY_MISMATCH` (400).
8. **Educations & Occupations**:
   - All `educationIds` and `occupationIds` must exist and be active. Otherwise: `INVALID_PARTNER_EDUCATION` (400) or `INVALID_PARTNER_OCCUPATION` (400).
9. **Enums**:
   - `manglikStatuses`: Must be in `ManglikStatus` (`YES`, `NO`, `DONT_KNOW`, `NOT_APPLICABLE`).
   - `maritalStatuses`: Must be in `MaritalStatus` (`NEVER_MARRIED`, `DIVORCED`, `WIDOWED`, `AWAITING_DIVORCE`, `ANNULLED`).

---

## 4. Error Code Reference

| Error Code | HTTP Status | Description |
| :--- | :---: | :--- |
| `PROFILE_NOT_FOUND` | 404 | User has not initialized a profile. |
| `INVALID_AGE_RANGE` | 400 | `minAge` is greater than `maxAge` or out of range. |
| `INVALID_HEIGHT_RANGE` | 400 | `minHeightCm` is greater than `maxHeightCm` or out of range. |
| `INVALID_PARTNER_RELIGION` | 400 | One or more religion IDs are invalid or inactive. |
| `INVALID_PARTNER_COMMUNITY` | 400 | One or more community IDs are invalid or inactive. |
| `PARTNER_COMMUNITY_RELIGION_MISMATCH` | 400 | Selected community does not belong to the chosen religions. |
| `INVALID_PARTNER_SUB_COMMUNITY` | 400 | One or more sub-community IDs are invalid or inactive. |
| `PARTNER_SUB_COMMUNITY_PARENT_MISMATCH` | 400 | Sub-community does not belong to selected communities. |
| `INVALID_PARTNER_CASTE` | 400 | One or more caste IDs are invalid or inactive. |
| `PARTNER_CASTE_COMMUNITY_MISMATCH` | 400 | Caste does not belong to selected communities. |
| `INVALID_PARTNER_GOTRA` | 400 | One or more gotra IDs are invalid or inactive. |
| `PARTNER_GOTRA_COMMUNITY_MISMATCH` | 400 | Gotra does not belong to selected communities. |
| `INVALID_PARTNER_EDUCATION` | 400 | One or more education IDs are invalid or inactive. |
| `INVALID_PARTNER_OCCUPATION` | 400 | One or more occupation IDs are invalid or inactive. |
| `INVALID_PARTNER_MANGLIK_STATUS` | 400 | Invalid value in `manglikStatuses`. |
| `INVALID_PARTNER_MARITAL_STATUS` | 400 | Invalid value in `maritalStatuses`. |
| `VALIDATION_ERROR` | 400 | Payload structure or non-array validation failure. |
| `UNAUTHORIZED` | 401 | Missing or invalid Bearer JWT token. |

---

## 5. Profile Completion Weight Matrix

| Section | Weight | Cumulative Percentage |
| :--- | :---: | :---: |
| **Profile Created For** | **10%** | **10%** |
| **Personal Details & Spoken Languages** | **30%** | **40%** |
| **Religion & Community** | **20%** | **60%** |
| **Education & Career** | **20%** | **80%** |
| **Photos** | **10%** | **90%** |
| **Partner Preferences** | **10%** | **100%** |
| **Total** | **100%** | |

> [!IMPORTANT]
> Reaching 100% profile completion **does NOT** automatically transition `profileStatus` to `ACTIVE`. The profile remains in `INCOMPLETE` until the user explicitly completes the verification and submission workflow.
