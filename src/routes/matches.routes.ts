import { Router } from "express";
import { matchesController } from "../controllers/matches.controller";
import { authMiddleware } from "../middlewares/auth.middleware";

export const matchesRouter = Router();

// Matches discovery requires a valid authenticated session
// (Temporary review rule: accessible to all authenticated users regardless of profile lifecycle state)
matchesRouter.use(authMiddleware);

// GET /api/matches - Retrieve paginated discovery profiles
matchesRouter.get("/", matchesController.getMatches);
