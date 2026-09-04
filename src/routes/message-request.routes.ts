import { Router } from "express";
import { messageRequestController } from "../controllers/message-request.controller";
import { authMiddleware } from "../middlewares/auth.middleware";
import { requireActiveProfile } from "../middlewares/profile-status.middleware";

export const messageRequestRouter = Router();

// All message request endpoints require authentication and an ACTIVE profile
messageRequestRouter.use(authMiddleware);
messageRequestRouter.use(requireActiveProfile);

// 1. Create a message request
messageRequestRouter.post("/", messageRequestController.createRequest);

// 2. Get incoming pending requests
messageRequestRouter.get("/incoming", messageRequestController.getIncomingRequests);

// 3. Get sent requests
messageRequestRouter.get("/sent", messageRequestController.getSentRequests);

// 4. Get relationship status with a specific profile or user
messageRequestRouter.get("/status/:targetId", messageRequestController.getRelationshipStatus);

// 5. Get a specific request by ID
messageRequestRouter.get("/:requestId", messageRequestController.getRequestById);

// 6. Accept request
messageRequestRouter.post("/:requestId/accept", messageRequestController.acceptRequest);

// 7. Decline request
messageRequestRouter.post("/:requestId/decline", messageRequestController.declineRequest);
