# Manglam Matrimony — Profile Submission API Documentation

## 1. Lifecycle Overview

The profile submission workflow transitions an onboarding candidate profile from `INCOMPLETE` to `IN_REVIEW` for verification:

```
[ Candidate Registration ] (OTP Verified)
           ↓
[ INCOMPLETE ] ──── (100% Onboarding Completed + Approved Photo)
           ↓
   [ POST /api/profile/submit ]
           ↓
   [ IN_REVIEW ] ──── (Locked for user edits / Queued for Verification)
           ↓
   [ Future Admin / Advisor Review ]
      ├── [ ACTIVE ] (Profile published & visible for matchmaking)
      └── [ REJECTED ] (Feedback provided → transitions back to INCOMPLETE on edit)
```

---

## 2. API Endpoint Specification

### Submit Profile for Review

- **Route**: `POST /api/profile/submit`
- **Authentication**: Required (`Authorization: Bearer <JWT>`)
- **Headers**:
  - `Authorization: Bearer <JWT_TOKEN>`
  - `Content-Type: application/json`
- **Request Body**: `{}` (Empty JSON object; user identity is derived strictly from JWT `req.user.userId`)

#### Success Response (`200 OK`):
```json
{
  "success": true,
  "message": "Profile submitted successfully for verification.",
  "data": {
    "profile": {
      "id": "prf_8f902ba1c841",
      "profileStatus": "IN_REVIEW",
      "completionPercentage": 100,
      "submittedAt": "2026-08-31T16:00:00.000Z"
    }
  }
}
```

---

## 3. Mandatory Submission Requirements

A profile can only be transitioned from `INCOMPLETE` to `IN_REVIEW` when **ALL** of the following requirements are met:

1. **Profile Initialized**: Candidate profile record exists in the database.
2. **Current Status**: Must be `INCOMPLETE`.
3. **Completion Percentage**: Must be `100%`.
4. **Personal Details**: First Name, Last Name, Gender, Date of Birth, Marital Status, Height (cm), and Mother Tongue are recorded.
5. **Religion & Community**: Religion and Manglik status are recorded.
6. **Education**: Highest Education qualification is recorded.
7. **Career**: Employment Status is recorded.
8. **Photo Upload**: At least one profile photo is uploaded.
9. **Photo Moderation**: At least **one photo** has `moderationStatus = APPROVED`. (A profile with only `PENDING` or `REJECTED` photos cannot be submitted).
10. **Partner Preferences**: Desired partner preferences are recorded.

---

## 4. Idempotency & Concurrency Safety

The submission handler employs a conditional database update:
```sql
UPDATE "profiles"
SET "profile_status" = 'IN_REVIEW', "submitted_at" = NOW()
WHERE "id" = :profileId AND "profile_status" = 'INCOMPLETE';
```

- **Double Submission / Rapid Clicks**: If two requests arrive simultaneously, exactly one request will successfully update the row and return `200 OK`. The second request will encounter `profile_status != 'INCOMPLETE'` and return `409 PROFILE_ALREADY_SUBMITTED`.

---

## 5. Error Code Reference

| Error Code | HTTP Status | Description |
| :--- | :---: | :--- |
| `PROFILE_NOT_FOUND` | 404 | User account has no initialized profile. |
| `PROFILE_INCOMPLETE` | 400 | Profile has not completed all required sections or completion < 100%. Returns `missingSections` array. |
| `NO_APPROVED_PHOTO` | 400 | No photos have `APPROVED` moderation status. |
| `PROFILE_ALREADY_SUBMITTED` | 409 | Profile is currently in `IN_REVIEW` status. |
| `PROFILE_ALREADY_ACTIVE` | 409 | Profile is already approved and `ACTIVE`. |
| `PROFILE_REJECTED` | 409 | Profile was rejected and requires resolution. |
| `PROFILE_SUSPENDED` | 409 | Profile account is suspended. |
| `UNAUTHORIZED` | 401 | Missing or invalid Bearer JWT token. |

#### Example Error Responses:

##### Incomplete Profile (`400 Bad Request`):
```json
{
  "success": false,
  "code": "PROFILE_INCOMPLETE",
  "message": "Please complete all required profile sections before submitting.",
  "error": {
    "code": "PROFILE_INCOMPLETE",
    "missingSections": [
      "PARTNER_PREFERENCES"
    ]
  }
}
```

##### No Approved Photo (`400 Bad Request`):
```json
{
  "success": false,
  "code": "NO_APPROVED_PHOTO",
  "message": "At least one approved profile photo is required before submission.",
  "error": {
    "code": "NO_APPROVED_PHOTO"
  }
}
```

##### Already Submitted (`409 Conflict`):
```json
{
  "success": false,
  "code": "PROFILE_ALREADY_SUBMITTED",
  "message": "Your profile has already been submitted and is currently under review."
}
```

---

## 6. Audit-Ready Metadata Fields

The `Profile` entity stores submission and verification lifecycle timestamps:
- `submitted_at`: Timestamp when the candidate submitted their profile (`IN_REVIEW`).
- `reviewed_at`: Timestamp when an Admin or Advisor reviews the profile (Future Phase).
- `rejection_reason`: Reason recorded if the profile is rejected during verification (Future Phase).
