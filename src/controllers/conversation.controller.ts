import { Request, Response } from "express";
import { conversationService } from "../services/conversation.service";

export class ConversationController {
  async getConversations(req: Request, res: Response) {
    try {
      const userId = req.user!.userId;
      const page = parseInt(req.query.page as string, 10) || 1;
      const limit = parseInt(req.query.limit as string, 10) || 20;

      const result = await conversationService.getUserConversations(userId, page, limit);
      res.status(200).json(result);
    } catch (err: any) {
      console.error("[GET CONVERSATIONS ERROR]:", err);
      res.status(500).json({
        success: false,
        code: "SERVER_ERROR",
        message: "Failed to load conversations.",
      });
    }
  }

  async getConversationById(req: Request, res: Response) {
    try {
      const userId = req.user!.userId;
      const { conversationId } = req.params;

      const result = await conversationService.getConversationById(userId, conversationId);
      if (!result.success) {
        res.status(result.statusCode || 400).json(result);
        return;
      }
      res.status(200).json(result);
    } catch (err: any) {
      console.error("[GET CONVERSATION BY ID ERROR]:", err);
      res.status(500).json({
        success: false,
        code: "SERVER_ERROR",
        message: "Failed to load conversation.",
      });
    }
  }

  async getMessages(req: Request, res: Response) {
    try {
      const userId = req.user!.userId;
      const { conversationId } = req.params;
      const page = parseInt(req.query.page as string, 10) || 1;
      const limit = parseInt(req.query.limit as string, 10) || 30;
      const beforeCursor = req.query.before as string | undefined;

      const result = await conversationService.getMessages(
        userId,
        conversationId,
        page,
        limit,
        beforeCursor
      );

      if (!result.success) {
        res.status(result.statusCode || 400).json(result);
        return;
      }
      res.status(200).json(result);
    } catch (err: any) {
      console.error("[GET MESSAGES ERROR]:", err);
      res.status(500).json({
        success: false,
        code: "SERVER_ERROR",
        message: "Failed to load messages.",
      });
    }
  }

  async sendMessage(req: Request, res: Response) {
    try {
      const userId = req.user!.userId;
      const { conversationId } = req.params;
      const { body } = req.body;

      const result = await conversationService.sendMessage(userId, conversationId, body);
      if (!result.success) {
        res.status(result.statusCode || 400).json(result);
        return;
      }
      res.status(result.statusCode || 201).json(result);
    } catch (err: any) {
      console.error("[SEND MESSAGE ERROR]:", err);
      res.status(500).json({
        success: false,
        code: "SERVER_ERROR",
        message: "Failed to send message.",
      });
    }
  }

  async markAsRead(req: Request, res: Response) {
    try {
      const userId = req.user!.userId;
      const { conversationId } = req.params;

      const result = await conversationService.markAsRead(userId, conversationId);
      res.status(200).json(result);
    } catch (err: any) {
      console.error("[MARK CONVERSATION AS READ ERROR]:", err);
      res.status(500).json({
        success: false,
        code: "SERVER_ERROR",
        message: "Failed to update read status.",
      });
    }
  }

  async getUnreadCount(req: Request, res: Response) {
    try {
      const userId = req.user!.userId;
      const result = await conversationService.getUnreadCounts(userId);
      res.status(200).json(result);
    } catch (err: any) {
      console.error("[GET UNREAD COUNT ERROR]:", err);
      res.status(500).json({
        success: false,
        code: "SERVER_ERROR",
        message: "Failed to get unread counter.",
      });
    }
  }
}

export const conversationController = new ConversationController();
