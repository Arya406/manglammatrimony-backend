import { Router } from "express";
import { conversationController } from "../controllers/conversation.controller";
import { authMiddleware } from "../middlewares/auth.middleware";
import { requireActiveProfile } from "../middlewares/profile-status.middleware";

export const conversationRouter = Router();

// All conversation and messaging endpoints require authentication and an ACTIVE profile
conversationRouter.use(authMiddleware);
conversationRouter.use(requireActiveProfile);

// 1. Get aggregate unread count for navbar and badges
conversationRouter.get("/unread-count", conversationController.getUnreadCount);

// 2. Get user conversations list
conversationRouter.get("/conversations", conversationController.getConversations);

// 3. Get single conversation detail
conversationRouter.get("/conversations/:conversationId", conversationController.getConversationById);

// 4. Get paginated messages in conversation
conversationRouter.get("/conversations/:conversationId/messages", conversationController.getMessages);

// 5. Send message in conversation
conversationRouter.post("/conversations/:conversationId/messages", conversationController.sendMessage);

// 6. Mark conversation as read
conversationRouter.patch("/conversations/:conversationId/read", conversationController.markAsRead);
