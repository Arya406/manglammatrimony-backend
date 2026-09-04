# Manglam Matrimony — Profile API Documentation

## 1. Profile Lifecycle

```
[ USER CREATED ] (Via OTP verification on /api/auth/register/verify-otp)
       ↓
[ PROFILE INCOMPLETE ] (Via POST /api/profile - completionPercentage: 10%)
       ↓
[ ONBOARDING PROGRESS ]
       ├── Personal Details & Languages (PUT /api/profile/personal-details - completionPercentage: 40%)
       ├── Religion & Community (PUT /api/profile/religion - completionPercentage: 60%)
       ├── Education & Career (PUT /api/profile/education-career - completionPercentage: 80%)
       ├── Photos (Future Phase)
       └── Partner Preferences (Future Phase)
       ↓
[ PROFILE SUBMISSION ] (Future Phase)
       ↓
[ IN_REVIEW / ACTIVE ]
```

---

## 2. API Endpoints

### 1. Initialize Profile

- **Route**: `POST /api/profile`
- **Authentication**: Required (`Authorization: Bearer <JWT>`)
- **Purpose**: Creates the initial matrimonial profile for the authenticated user or returns the existing profile if already created.
- **Ownership Rule**: User ID is strictly derived from the authenticated JWT session.

#### Request Body:
```json
{
  "profileCreatedFor": "MYSELF"
}
```
*Allowed values*: `MYSELF`, `MY_SON`, `MY_DAUGHTER`, `MY_BROTHER`, `MY_SISTER`, `MY_RELATIVE`, `OTHER`

#### Success Response (`201 Created` or `200 OK` if existing):
```json
{
  "success": true,
  "message": "Profile initialized successfully.",
  "data": {
    "profile": {
      "id": "prf_8f902ba1c",
      "userId": "usr_7b82f1092e",
      "profileCreatedFor": "MYSELF",
      "profileStatus": "INCOMPLETE",
      "completionPercentage": 10,
      "createdAt": "2026-08-31T12:00:00.000Z",
      "updatedAt": "2026-08-31T12:00:00.000Z"
    },
    "isNew": true
  }
}
```

---

### 2. Get Complete Profile

- **Route**: `GET /api/profile`
- **Authentication**: Required (`Authorization: Bearer <JWT>`)
- **Purpose**: Retrieves all saved profile information for the authenticated user.
- **Ownership Rule**: Returns only the profile belonging to the authenticated user. Never exposes another user's profile.

#### Success Response (`200 OK`):
```json
{
  "success": true,
  "message": "Profile retrieved successfully.",
  "data": {
    "profile": {
      "id": "prf_8f902ba1c",
      "userId": "usr_7b82f1092e",
      "profileCreatedFor": "MYSELF",
      "profileStatus": "INCOMPLETE",
      "completionPercentage": 80,
      "createdAt": "2026-08-31T12:00:00.000Z",
      "updatedAt": "2026-08-31T12:15:00.000Z"
    },
    "personalDetails": {
      "id": "det_3a10be74",
      "profileId": "prf_8f902ba1c",
      "firstName": "Aarav",
      "lastName": "Sharma",
      "gender": "MALE",
      "dateOfBirth": "1996-05-15T00:00:00.000Z",
      "maritalStatus": "NEVER_MARRIED",
      "heightCm": 178,
      "motherTongueId": "lang_hindi_01",
      "motherTongue": {
        "id": "lang_hindi_01",
        "name": "Hindi",
        "code": "hi"
      },
      "createdAt": "2026-08-31T12:05:00.000Z",
      "updatedAt": "2026-08-31T12:05:00.000Z"
    },
    "languages": [
      {
        "languageId": "lang_hindi_01",
        "name": "Hindi",
        "code": "hi"
      }
    ],
    "religion": {
      "id": "rel_4b921fa0",
      "profileId": "prf_8f902ba1c",
      "religionId": "rel_hindu_01",
      "religion": {
        "id": "rel_hindu_01",
        "name": "Hindu",
        "slug": "hindu"
      },
      "communityId": "com_brahmin_01",
      "community": {
        "id": "com_brahmin_01",
        "name": "Brahmin",
        "slug": "brahmin"
      },
      "subCommunityId": null,
      "casteId": null,
      "subCasteId": null,
      "gotraId": null,
      "manglik": "NO",
      "createdAt": "2026-08-31T12:10:00.000Z",
      "updatedAt": "2026-08-31T12:10:00.000Z"
    },
    "education": {
      "id": "edu_5c19be82",
      "profileId": "prf_8f902ba1c",
      "educationId": "edu_btech_01",
      "education": {
        "id": "edu_btech_01",
        "name": "B.Tech / B.E.",
        "slug": "btech"
      },
      "specializationId": null,
      "institutionId": null,
      "institutionName": "Indian Institute of Technology Delhi",
      "createdAt": "2026-08-31T12:15:00.000Z",
      "updatedAt": "2026-08-31T12:15:00.000Z"
    },
    "career": {
      "id": "car_6d20ce93",
      "profileId": "prf_8f902ba1c",
      "employmentStatusId": "emp_employed_01",
      "employmentStatus": {
        "id": "emp_employed_01",
        "name": "Employed in Private Sector",
        "slug": "private-sector"
      },
      "occupationId": null,
      "companyName": "Microsoft",
      "employmentType": "FULL_TIME",
      "annualIncomeRange": "TWENTY_TO_THIRTY_LAKH",
      "createdAt": "2026-08-31T12:15:00.000Z",
      "updatedAt": "2026-08-31T12:15:00.000Z"
    },
    "photos": [],
    "partnerPreferences": null
  }
}
```

---

### 3. Save Personal Details & Spoken Languages

- **Route**: `PUT /api/profile/personal-details`
- **Authentication**: Required (`Authorization: Bearer <JWT>`)

---

### 4. Save Religion & Community Details

- **Route**: `PUT /api/profile/religion`
- **Authentication**: Required (`Authorization: Bearer <JWT>`)

---

### 5. Save Education & Career Details

- **Route**: `PUT /api/profile/education-career`
- **Authentication**: Required (`Authorization: Bearer <JWT>`)
- **Purpose**: Idempotently saves or updates education credentials and career/employment details atomically.
- **Ownership Rule**: Operates strictly on the authenticated user's profile.

#### Request Body:
```json
{
  "education": {
    "educationId": "edu_btech_01",
    "specializationId": null,
    "institutionId": null,
    "institutionName": "Indian Institute of Technology Delhi"
  },
  "career": {
    "employmentStatusId": "emp_employed_01",
    "occupationId": null,
    "companyName": "Microsoft",
    "employmentType": "FULL_TIME",
    "annualIncomeRange": "TWENTY_TO_THIRTY_LAKH"
  }
}
```

#### Fields Description:
- **Education**:
  - `educationId` (*Required*): Must reference an active record in `educations`.
  - `specializationId` (*Optional*): If provided, must belong to the selected education (`specialization.educationId === educationId`).
  - `institutionId` (*Optional*): Must reference an active record in `institutions`.
  - `institutionName` (*Optional*): Custom institution string (supports the "Other" institution flow, max 200 chars).
- **Career**:
  - `employmentStatusId` (*Required*): Must reference an active record in `employment_statuses`.
  - `occupationId` (*Optional*): If provided and linked to an employment status, must match `employmentStatusId`.
  - `companyName` (*Optional*): Employer / Company name (max 200 chars).
  - `employmentType` (*Optional*): Must match `FULL_TIME`, `PART_TIME`, `CONTRACT`, `FREELANCE`, `INTERNSHIP`, `OTHER`.
  - `annualIncomeRange` (*Optional*): Must match `BELOW_2_LAKH`, `TWO_TO_FIVE_LAKH`, `FIVE_TO_TEN_LAKH`, `TEN_TO_FIFTEEN_LAKH`, `FIFTEEN_TO_TWENTY_LAKH`, `TWENTY_TO_THIRTY_LAKH`, `THIRTY_TO_FIFTY_LAKH`, `FIFTY_LAKH_TO_ONE_CRORE`, `ABOVE_ONE_CRORE`, `PREFER_NOT_TO_SAY`.

> [!IMPORTANT]
> **Explicitly Excluded Fields**:
> The following fields are not part of Manglam Matrimony product scope and are strictly excluded:
> - `industry`
> - `location` / `workLocation` / `officeLocation`
> - `religionPractice`
> - `lifestyle`

#### Success Response (`200 OK`):
```json
{
  "success": true,
  "message": "Education and career details saved successfully.",
  "data": {
    "education": {
      "id": "edu_5c19be82",
      "profileId": "prf_8f902ba1c",
      "educationId": "edu_btech_01",
      "education": {
        "id": "edu_btech_01",
        "name": "B.Tech / B.E.",
        "slug": "btech"
      },
      "specializationId": null,
      "specialization": null,
      "institutionId": null,
      "institution": null,
      "institutionName": "Indian Institute of Technology Delhi",
      "createdAt": "2026-08-31T12:15:00.000Z",
      "updatedAt": "2026-08-31T12:15:00.000Z"
    },
    "career": {
      "id": "car_6d20ce93",
      "profileId": "prf_8f902ba1c",
      "employmentStatusId": "emp_employed_01",
      "employmentStatus": {
        "id": "emp_employed_01",
        "name": "Employed in Private Sector",
        "slug": "private-sector"
      },
      "occupationId": null,
      "occupation": null,
      "companyName": "Microsoft",
      "employmentType": "FULL_TIME",
      "annualIncomeRange": "TWENTY_TO_THIRTY_LAKH",
      "createdAt": "2026-08-31T12:15:00.000Z",
      "updatedAt": "2026-08-31T12:15:00.000Z"
    },
    "profile": {
      "completionPercentage": 80,
      "profileStatus": "INCOMPLETE"
    }
  }
}
```

#### Error Codes:
- `INVALID_EDUCATION` (400): Education ID missing, invalid, or inactive.
- `INVALID_SPECIALIZATION` (400): Specialization ID invalid or inactive.
- `SPECIALIZATION_EDUCATION_MISMATCH` (400): Specialization does not belong to chosen education.
- `INVALID_INSTITUTION` (400): Institution ID invalid or inactive.
- `INVALID_EMPLOYMENT_STATUS` (400): Employment status ID missing, invalid, or inactive.
- `INVALID_OCCUPATION` (400): Occupation ID invalid or inactive.
- `OCCUPATION_EMPLOYMENT_STATUS_MISMATCH` (400): Occupation does not belong to chosen employment status.
- `INVALID_EMPLOYMENT_TYPE` (400): Employment type is not a valid enum value.
- `INVALID_ANNUAL_INCOME_RANGE` (400): Annual income range is not a valid enum value.
- `VALIDATION_ERROR` (400): Request structure missing education/career or text length exceeded.
- `PROFILE_NOT_FOUND` (404): Authenticated user has not initialized a profile.
- `UNAUTHORIZED` (401): Missing or expired JWT token.

---

## 3. Profile Completion Calculation

The completion percentage is computed dynamically using centralized weighted sections:

| Section | Weight | Cumulative |
| :--- | :---: | :---: |
| **Profile Created For** | **10%** | **10%** |
| **Personal Details & Languages** | **30%** | **40%** |
| **Religion & Community** | **20%** | **60%** |
| **Education & Career** | **20%** | **80%** |
| **Photos** | **10%** | *90%* (Future phase) |
| **Partner Preferences** | **10%** | *100%* (Future phase) |
| **Total** | **100%** | |
