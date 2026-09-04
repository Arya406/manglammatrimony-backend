import { Router } from "express";
import { notificationController } from "../controllers/notification.controller";
import { authMiddleware } from "../middlewares/auth.middleware";

export const notificationRouter = Router();

// All notification endpoints require authentication
notificationRouter.use(authMiddleware);

// 1. Get user notifications
notificationRouter.get("/", notificationController.getNotifications);

// 2. Mark specific notification as read
notificationRouter.patch("/:notificationId/read", notificationController.markAsRead);

// 3. Mark all notifications as read
notificationRouter.post("/read-all", notificationController.markAllAsRead);
