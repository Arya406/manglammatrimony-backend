import { Request, Response } from "express";
import { notificationService } from "../services/notification.service";

export class NotificationController {
  async getNotifications(req: Request, res: Response) {
    try {
      const userId = req.user!.userId;
      const page = parseInt(req.query.page as string, 10) || 1;
      const limit = parseInt(req.query.limit as string, 10) || 20;

      const result = await notificationService.getNotifications(userId, page, limit);
      res.status(200).json(result);
    } catch (err: any) {
      console.error("[GET NOTIFICATIONS ERROR]:", err);
      res.status(500).json({
        success: false,
        code: "SERVER_ERROR",
        message: "Failed to load notifications.",
      });
    }
  }

  async markAsRead(req: Request, res: Response) {
    try {
      const userId = req.user!.userId;
      const { notificationId } = req.params;

      const result = await notificationService.markAsRead(userId, notificationId);
      if (!result.success) {
        res.status(result.statusCode || 400).json(result);
        return;
      }
      res.status(200).json(result);
    } catch (err: any) {
      console.error("[MARK NOTIFICATION READ ERROR]:", err);
      res.status(500).json({
        success: false,
        code: "SERVER_ERROR",
        message: "Failed to mark notification as read.",
      });
    }
  }

  async markAllAsRead(req: Request, res: Response) {
    try {
      const userId = req.user!.userId;
      const result = await notificationService.markAllAsRead(userId);
      res.status(200).json(result);
    } catch (err: any) {
      console.error("[MARK ALL READ ERROR]:", err);
      res.status(500).json({
        success: false,
        code: "SERVER_ERROR",
        message: "Failed to mark all notifications as read.",
      });
    }
  }
}

export const notificationController = new NotificationController();
