import { Router } from "express";
import { profileController } from "../controllers/profile.controller";
import { photoController } from "../controllers/photo.controller";
import { partnerPreferenceController } from "../controllers/partner-preference.controller";
import { favouriteController } from "../controllers/favourite.controller";
import { authMiddleware } from "../middlewares/auth.middleware";
import { requireActiveProfile } from "../middlewares/profile-status.middleware";
import { handlePhotoUpload } from "../middlewares/photo.upload.middleware";
import {
  validateInitializeProfile,
  validatePersonalDetails,
  validateReligionDetails,
  validateEducationCareerDetails,
  validatePartnerPreferences,
} from "../middlewares/profile.validation.middleware";

export const profileRouter = Router();

// Public / direct file serving for profile photo assets
profileRouter.get("/photos/:photoId/file", photoController.servePhotoFile);

// Public master data access for active onboarding datasets
profileRouter.get("/languages", profileController.getActiveLanguages);
profileRouter.get("/religions", profileController.getActiveReligions);
profileRouter.get("/communities", profileController.getActiveCommunities);
profileRouter.get("/sub-communities", profileController.getActiveSubCommunities);
profileRouter.get("/castes", profileController.getActiveCastes);
profileRouter.get("/sub-castes", profileController.getActiveSubCastes);
profileRouter.get("/gotras", profileController.getActiveGotras);
profileRouter.get("/educations", profileController.getActiveEducations);
profileRouter.get("/specializations", profileController.getActiveSpecializations);
profileRouter.get("/institutions", profileController.getActiveInstitutions);
profileRouter.get("/employment-statuses", profileController.getActiveEmploymentStatuses);
profileRouter.get("/occupations", profileController.getActiveOccupations);

// Apply authentication middleware to all remaining profile endpoints
profileRouter.use(authMiddleware);

// 1. Initialize or retrieve profile
profileRouter.post("/", validateInitializeProfile, profileController.initializeProfile);

// 2. Get complete profile
profileRouter.get("/", profileController.getProfile);

// 3. Save or update personal details and spoken languages
profileRouter.put(
  "/personal-details",
  validatePersonalDetails,
  profileController.savePersonalDetails
);

// 4. Save or update religion and community details
profileRouter.put(
  "/religion",
  validateReligionDetails,
  profileController.saveReligion
);

// 5. Save or update education and career details
profileRouter.put(
  "/education-career",
  validateEducationCareerDetails,
  profileController.saveEducationCareer
);

// 6. Photo Management Routes
profileRouter.post("/photos", handlePhotoUpload, photoController.uploadPhoto);
profileRouter.get("/photos", photoController.getPhotos);
profileRouter.put("/photos/reorder", photoController.reorderPhotos);
profileRouter.put("/photos/:photoId/primary", photoController.setPrimaryPhoto);
profileRouter.delete("/photos/:photoId", photoController.deletePhoto);
profileRouter.post("/photos/:photoId/dev-approve", photoController.devApprovePhoto);

// 7. Partner Preferences Routes
profileRouter.put(
  "/partner-preferences",
  validatePartnerPreferences,
  partnerPreferenceController.savePartnerPreferences
);
profileRouter.get(
  "/partner-preferences",
  partnerPreferenceController.getPartnerPreferences
);

// 8. Profile Submission Route (INCOMPLETE -> IN_REVIEW)
profileRouter.post("/submit", profileController.submitProfile);

// 9. Persistent Favourites & Likes Routes (Requires ACTIVE profile)
profileRouter.post("/favourites/:profileId", requireActiveProfile, (req, res) => favouriteController.addFavourite(req, res));
profileRouter.delete("/favourites/:profileId", requireActiveProfile, (req, res) => favouriteController.removeFavourite(req, res));
profileRouter.get("/favourites", requireActiveProfile, (req, res) => favouriteController.getFavourites(req, res));
profileRouter.get("/favourites/status/:profileId", requireActiveProfile, (req, res) => favouriteController.getFavouriteStatus(req, res));
profileRouter.get("/likes/received", requireActiveProfile, (req, res) => favouriteController.getReceivedLikes(req, res));
profileRouter.get("/likes/received/count", requireActiveProfile, (req, res) => favouriteController.getReceivedLikesCount(req, res));
