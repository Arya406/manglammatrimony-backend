# Manglam Matrimony — Photo Management API Documentation

## 1. Architecture & Storage Abstraction

The Photo Management subsystem adheres to a decoupled, provider-agnostic storage architecture:

```
[ HTTP Multipart Request ]
       ↓
[ PhotoController ]
       ↓
[ PhotoService ] (Business rules, validations, limits, completion)
       ├── [ PhotoRepository ] → PostgreSQL (Metadata & Ownership via Prisma)
       └── [ StorageProvider Interface ]
                 ├── LocalStorageProvider (Development / Local filesystem)
                 └── S3 / Cloudinary / Azure Provider (Future Cloud Production)
```

- **Pluggable Storage**: The core business logic interacts exclusively with the `StorageProvider` interface (`upload`, `delete`, `getUrl`, `getFileStream`, `exists`). Migrating to AWS S3, Cloudinary, or Azure Blob Storage requires zero alterations to the service, controller, or database layers.
- **Path Security**: User-uploaded filenames are treated as metadata only. Internal disk keys use sanitized, random identifiers (`profiles/{profileId}/{photoId}/photo.{ext}`) preventing directory traversal (`..`) attacks.

---

## 2. Photo Lifecycle & Rules

1. **First Photo Rule**: If a user has 0 photos, their first uploaded photo automatically becomes `PRIMARY`.
2. **Explicit Primary Selection**: When a photo is designated `PRIMARY` (via upload or `PUT /:photoId/primary`), the existing `PRIMARY` photo is automatically demoted to `ADDITIONAL`. There is **never more than one PRIMARY photo** per profile.
3. **Automatic Promotion on Delete**: If the `PRIMARY` photo is deleted, the next available photo in order is automatically promoted to `PRIMARY`.
4. **Photo Limits**: Maximum **6 photos** per profile (1 PRIMARY + up to 5 ADDITIONAL).
5. **Moderation States**: Initial status is `PENDING`. Valid states: `PENDING`, `APPROVED`, `REJECTED`. A `REJECTED` photo cannot be promoted to `PRIMARY`.
6. **Profile Completion**: Uploading at least 1 photo increases profile completion by **+10%** (bringing cumulative completion to **90%**). Deleting all photos reduces completion back to **80%**.

---

## 3. API Endpoints

### 1. Upload Photo

- **Route**: `POST /api/profile/photos`
- **Authentication**: Required (`Authorization: Bearer <JWT>`)
- **Content-Type**: `multipart/form-data`
- **Fields**:
  - `photo` (*Required, Binary File*): Image file (JPEG, PNG, WebP; max 5MB; min 300x300 px; max 5000x5000 px).
  - `photoType` (*Optional, String*): `PRIMARY` or `ADDITIONAL`. Defaults to `PRIMARY` if 0 photos exist, else `ADDITIONAL`.

#### Success Response (`201 Created`):
```json
{
  "success": true,
  "message": "Photo uploaded successfully.",
  "data": {
    "photo": {
      "id": "pho_8f902ba1c841",
      "profileId": "prf_7b82f1092e",
      "photoType": "PRIMARY",
      "moderationStatus": "PENDING",
      "moderationReason": null,
      "sortOrder": 0,
      "fileSize": 342010,
      "mimeType": "image/jpeg",
      "width": 1080,
      "height": 1350,
      "url": "/api/profile/photos/pho_8f902ba1c841/file",
      "createdAt": "2026-08-31T15:00:00.000Z",
      "updatedAt": "2026-08-31T15:00:00.000Z"
    },
    "profile": {
      "completionPercentage": 90,
      "profileStatus": "INCOMPLETE"
    }
  }
}
```

---

### 2. Get User Photos

- **Route**: `GET /api/profile/photos`
- **Authentication**: Required (`Authorization: Bearer <JWT>`)
- **Ordering**: PRIMARY photo always appears first, followed by `sortOrder` ascending.

#### Success Response (`200 OK`):
```json
{
  "success": true,
  "message": "Photos retrieved successfully.",
  "data": {
    "photos": [
      {
        "id": "pho_8f902ba1c841",
        "profileId": "prf_7b82f1092e",
        "photoType": "PRIMARY",
        "moderationStatus": "PENDING",
        "moderationReason": null,
        "sortOrder": 0,
        "fileSize": 342010,
        "mimeType": "image/jpeg",
        "width": 1080,
        "height": 1350,
        "url": "/api/profile/photos/pho_8f902ba1c841/file",
        "createdAt": "2026-08-31T15:00:00.000Z",
        "updatedAt": "2026-08-31T15:00:00.000Z"
      }
    ],
    "primaryPhoto": {
      "id": "pho_8f902ba1c841",
      "profileId": "prf_7b82f1092e",
      "photoType": "PRIMARY",
      "moderationStatus": "PENDING",
      "moderationReason": null,
      "sortOrder": 0,
      "fileSize": 342010,
      "mimeType": "image/jpeg",
      "width": 1080,
      "height": 1350,
      "url": "/api/profile/photos/pho_8f902ba1c841/file",
      "createdAt": "2026-08-31T15:00:00.000Z",
      "updatedAt": "2026-08-31T15:00:00.000Z"
    },
    "totalCount": 1,
    "maxAllowed": 6
  }
}
```

---

### 3. Set Primary Photo

- **Route**: `PUT /api/profile/photos/:photoId/primary`
- **Authentication**: Required (`Authorization: Bearer <JWT>`)
- **Behavior**: Promotes target photo to `PRIMARY` and demotes existing primary photo to `ADDITIONAL`.

#### Success Response (`200 OK`):
```json
{
  "success": true,
  "message": "Primary photo updated successfully.",
  "data": {
    "photo": {
      "id": "pho_9a10ce84b219",
      "profileId": "prf_7b82f1092e",
      "photoType": "PRIMARY",
      "moderationStatus": "PENDING",
      "moderationReason": null,
      "sortOrder": 1,
      "fileSize": 412000,
      "mimeType": "image/png",
      "width": 1200,
      "height": 1600,
      "url": "/api/profile/photos/pho_9a10ce84b219/file",
      "createdAt": "2026-08-31T15:05:00.000Z",
      "updatedAt": "2026-08-31T15:10:00.000Z"
    }
  }
}
```

---

### 4. Delete Photo

- **Route**: `DELETE /api/profile/photos/:photoId`
- **Authentication**: Required (`Authorization: Bearer <JWT>`)
- **Behavior**: Deletes metadata and physical file. If deleting `PRIMARY`, promotes next photo.

#### Success Response (`200 OK`):
```json
{
  "success": true,
  "message": "Photo deleted successfully.",
  "data": {
    "deletedPhotoId": "pho_8f902ba1c841",
    "promotedPrimaryPhotoId": "pho_9a10ce84b219",
    "profile": {
      "completionPercentage": 90,
      "profileStatus": "INCOMPLETE"
    }
  }
}
```

---

### 5. Reorder Photos

- **Route**: `PUT /api/profile/photos/reorder`
- **Authentication**: Required (`Authorization: Bearer <JWT>`)
- **Request Body**:
```json
{
  "photoIds": [
    "pho_9a10ce84b219",
    "pho_2b31de75a320",
    "pho_5c42ef86c431"
  ]
}
```

#### Success Response (`200 OK`):
```json
{
  "success": true,
  "message": "Photos reordered successfully.",
  "data": {
    "photos": [ ... ]
  }
}
```

---

### 6. Serve Photo File

- **Route**: `GET /api/profile/photos/:photoId/file`
- **Authentication**: Public / Direct file stream with HTTP 200 and image mime type headers (`Content-Type: image/jpeg`, `Cache-Control: public, max-age=86400`).

---

## 4. Validation Rules & Error Codes

| Error Code | HTTP Status | Description |
| :--- | :---: | :--- |
| `PROFILE_NOT_FOUND` | 404 | User has not initialized a profile. |
| `PHOTO_NOT_FOUND` | 404 | Photo does not exist or does not belong to user. |
| `PHOTO_LIMIT_REACHED` | 400 | Profile has reached maximum limit of 6 photos. |
| `INVALID_FILE` | 400 | No file uploaded or corrupt form payload. |
| `UNSUPPORTED_FILE_TYPE` | 400 | File format not in JPEG, PNG, or WebP. |
| `FILE_TOO_LARGE` | 400 | File exceeds 5 MB. |
| `INVALID_IMAGE` | 400 | File binary fails image signature inspection. |
| `IMAGE_TOO_SMALL` | 400 | Dimensions less than 300x300 pixels. |
| `IMAGE_TOO_LARGE` | 400 | Dimensions exceed 5000x5000 pixels. |
| `PHOTO_REJECTED` | 400 | Cannot set a rejected photo as primary. |
| `INVALID_PHOTO_TYPE` | 400 | photoType not PRIMARY or ADDITIONAL. |
| `INVALID_PHOTO_ORDER` | 400 | Reorder array contains foreign photo IDs. |
| `DUPLICATE_PHOTO_IDS` | 400 | Reorder array contains duplicates. |
| `UNAUTHORIZED` | 401 | Missing or invalid Bearer JWT token. |

---

## 5. Profile Completion Matrix

| Section | Weight | Cumulative |
| :--- | :---: | :---: |
| **Profile Created For** | **10%** | **10%** |
| **Personal Details & Languages** | **30%** | **40%** |
| **Religion & Community** | **20%** | **60%** |
| **Education & Career** | **20%** | **80%** |
| **Photos** | **10%** | **90%** |
| **Partner Preferences** | **10%** | *100%* (Future Phase) |
| **Total** | **100%** | |
