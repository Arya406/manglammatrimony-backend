import { Router } from "express";
import { matchesController } from "../controllers/matches.controller";
import { authMiddleware } from "../middlewares/auth.middleware";
import { requireActiveProfile } from "../middlewares/profile-status.middleware";

export const matchesRouter = Router();

// Matches discovery requires authentication and an ACTIVE profile
matchesRouter.use(authMiddleware);
matchesRouter.use(requireActiveProfile);

// GET /api/matches - Retrieve paginated discovery profiles
matchesRouter.get("/", matchesController.getMatches);
