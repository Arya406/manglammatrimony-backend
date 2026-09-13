import { Router } from "express";
import { adminAuthController } from "../controllers/admin-auth.controller";
import { adminDashboardController } from "../controllers/admin-dashboard.controller";
import { adminProfilesController } from "../controllers/admin-profiles.controller";
import { adminUsersController } from "../controllers/admin-users.controller";
import { adminPhotoModerationController } from "../controllers/admin-photo-moderation.controller";
import { adminAuthMiddleware } from "../middlewares/admin-auth.middleware";
import { adminLoginRateLimiter } from "../middlewares/rate-limiter.middleware";
import {
  validateExpectedUpdatedAt,
  validateAdminProfileCreatedFor,
  validateAdminPersonalDetails,
  validateAdminReligionDetails,
  validateAdminEducationCareerDetails,
  validateAdminPartnerPreferences,
} from "../middlewares/admin-profile.validation.middleware";
import { handlePhotoUpload } from "../middlewares/photo.upload.middleware";

export const adminRouter = Router();

// ==============================================================================
// Admin Authentication Endpoints
// ==============================================================================
adminRouter.post("/auth/login", adminLoginRateLimiter, (req, res) =>
  adminAuthController.login(req, res)
);

adminRouter.get("/auth/me", adminAuthMiddleware, (req, res) =>
  adminAuthController.me(req, res)
);

// ==============================================================================
// Admin Dashboard Overview Endpoints
// ==============================================================================
adminRouter.get("/dashboard/stats", adminAuthMiddleware, (req, res) =>
  adminDashboardController.getStats(req, res)
);

// ==============================================================================
// Admin Matrimonial Profiles Management Endpoints
// ==============================================================================
adminRouter.get("/profiles", adminAuthMiddleware, (req, res) =>
  adminProfilesController.listProfiles(req, res)
);

adminRouter.get("/profiles/:profileId", adminAuthMiddleware, (req, res) =>
  adminProfilesController.getProfileDetail(req, res)
);

adminRouter.put(
  "/profiles/:profileId/profile-created-for",
  adminAuthMiddleware,
  validateExpectedUpdatedAt,
  validateAdminProfileCreatedFor,
  (req, res) => adminProfilesController.updateProfileCreatedFor(req, res)
);

adminRouter.put(
  "/profiles/:profileId/personal-details",
  adminAuthMiddleware,
  validateExpectedUpdatedAt,
  validateAdminPersonalDetails,
  (req, res) => adminProfilesController.updatePersonalDetails(req, res)
);

adminRouter.put(
  "/profiles/:profileId/religion",
  adminAuthMiddleware,
  validateExpectedUpdatedAt,
  validateAdminReligionDetails,
  (req, res) => adminProfilesController.updateReligion(req, res)
);

adminRouter.put(
  "/profiles/:profileId/education-career",
  adminAuthMiddleware,
  validateExpectedUpdatedAt,
  validateAdminEducationCareerDetails,
  (req, res) => adminProfilesController.updateEducationCareer(req, res)
);

adminRouter.put(
  "/profiles/:profileId/partner-preferences",
  adminAuthMiddleware,
  validateExpectedUpdatedAt,
  validateAdminPartnerPreferences,
  (req, res) => adminProfilesController.updatePartnerPreferences(req, res)
);

// ==============================================================================
// Admin Users Management Endpoints
// ==============================================================================
adminRouter.get("/users", adminAuthMiddleware, (req, res) =>
  adminUsersController.listUsers(req, res)
);

adminRouter.get("/users/:userId", adminAuthMiddleware, (req, res) =>
  adminUsersController.getUserDetail(req, res)
);

adminRouter.post("/users", adminAuthMiddleware, (req, res) =>
  adminUsersController.createUser(req, res)
);

adminRouter.post("/users/:userId/activation/resend", adminAuthMiddleware, (req, res) =>
  adminUsersController.resendActivation(req, res)
);

adminRouter.post("/users/:userId/activation/verify-otp", adminAuthMiddleware, (req, res) =>
  adminUsersController.verifyActivationOtp(req, res)
);

adminRouter.post("/users/:userId/suspend", adminAuthMiddleware, (req, res) =>
  adminUsersController.suspendUser(req, res)
);

adminRouter.post("/users/:userId/block", adminAuthMiddleware, (req, res) =>
  adminUsersController.blockUser(req, res)
);

adminRouter.post("/users/:userId/restore", adminAuthMiddleware, (req, res) =>
  adminUsersController.restoreUser(req, res)
);

adminRouter.post("/users/:userId/activate", adminAuthMiddleware, (req, res) =>
  adminUsersController.activateUser(req, res)
);

adminRouter.delete("/users/:userId", adminAuthMiddleware, (req, res) =>
  adminUsersController.permanentlyDeleteUser(req, res)
);

adminRouter.post(
  "/users/:userId/profile/photos",
  adminAuthMiddleware,
  handlePhotoUpload,
  (req, res) => adminUsersController.uploadProfilePhoto(req, res)
);

adminRouter.post(
  "/users/:userId/profile/activate",
  adminAuthMiddleware,
  (req, res) => adminUsersController.activateProfile(req, res)
);

// ==============================================================================
// Admin Photo Moderation Queue Endpoints (Step 4)
// ==============================================================================
adminRouter.get("/photos", adminAuthMiddleware, (req, res) =>
  adminPhotoModerationController.listPhotos(req, res)
);

adminRouter.get("/photos/:photoId", adminAuthMiddleware, (req, res) =>
  adminPhotoModerationController.getPhotoDetail(req, res)
);

adminRouter.post("/photos/:photoId/approve", adminAuthMiddleware, (req, res) =>
  adminPhotoModerationController.approvePhoto(req, res)
);

adminRouter.post("/photos/:photoId/reject", adminAuthMiddleware, (req, res) =>
  adminPhotoModerationController.rejectPhoto(req, res)
);

