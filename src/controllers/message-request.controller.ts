import { Request, Response } from "express";
import { messageRequestService } from "../services/message-request.service";

export class MessageRequestController {
  async createRequest(req: Request, res: Response) {
    try {
      const senderUserId = req.user!.userId;
      const { receiverProfileId, receiverUserId } = req.body;

      const result = await messageRequestService.createRequest(senderUserId, {
        receiverProfileId,
        receiverUserId,
      });

      res.status(result.statusCode).json({
        success: result.success,
        code: result.code,
        message: result.message,
        data: result.data,
      });
    } catch (err: any) {
      console.error("[MESSAGE REQUEST CREATE ERROR]:", err);
      res.status(500).json({
        success: false,
        code: "SERVER_ERROR",
        message: "Failed to send message request. Please try again.",
      });
    }
  }

  async getIncomingRequests(req: Request, res: Response) {
    try {
      const userId = req.user!.userId;
      const page = parseInt(req.query.page as string, 10) || 1;
      const limit = parseInt(req.query.limit as string, 10) || 20;

      const result = await messageRequestService.getIncomingRequests(userId, page, limit);
      res.status(200).json(result);
    } catch (err: any) {
      console.error("[GET INCOMING REQUESTS ERROR]:", err);
      res.status(500).json({
        success: false,
        code: "SERVER_ERROR",
        message: "Failed to load incoming message requests.",
      });
    }
  }

  async getSentRequests(req: Request, res: Response) {
    try {
      const userId = req.user!.userId;
      const page = parseInt(req.query.page as string, 10) || 1;
      const limit = parseInt(req.query.limit as string, 10) || 20;

      const result = await messageRequestService.getSentRequests(userId, page, limit);
      res.status(200).json(result);
    } catch (err: any) {
      console.error("[GET SENT REQUESTS ERROR]:", err);
      res.status(500).json({
        success: false,
        code: "SERVER_ERROR",
        message: "Failed to load sent message requests.",
      });
    }
  }

  async getRequestById(req: Request, res: Response) {
    try {
      const userId = req.user!.userId;
      const { requestId } = req.params;

      const result = await messageRequestService.getRequestById(userId, requestId);
      if (!result.success) {
        res.status(result.statusCode || 400).json(result);
        return;
      }
      res.status(200).json(result);
    } catch (err: any) {
      console.error("[GET REQUEST BY ID ERROR]:", err);
      res.status(500).json({
        success: false,
        code: "SERVER_ERROR",
        message: "Failed to retrieve message request.",
      });
    }
  }

  async acceptRequest(req: Request, res: Response) {
    try {
      const userId = req.user!.userId;
      const { requestId } = req.params;

      const result = await messageRequestService.acceptRequest(userId, requestId);
      if (!result.success) {
        res.status(result.statusCode || 400).json(result);
        return;
      }
      res.status(200).json(result);
    } catch (err: any) {
      console.error("[ACCEPT REQUEST ERROR]:", err);
      res.status(500).json({
        success: false,
        code: "SERVER_ERROR",
        message: "Failed to accept message request.",
      });
    }
  }

  async declineRequest(req: Request, res: Response) {
    try {
      const userId = req.user!.userId;
      const { requestId } = req.params;

      const result = await messageRequestService.declineRequest(userId, requestId);
      if (!result.success) {
        res.status(result.statusCode || 400).json(result);
        return;
      }
      res.status(200).json(result);
    } catch (err: any) {
      console.error("[DECLINE REQUEST ERROR]:", err);
      res.status(500).json({
        success: false,
        code: "SERVER_ERROR",
        message: "Failed to decline message request.",
      });
    }
  }

  async getRelationshipStatus(req: Request, res: Response) {
    try {
      const userId = req.user!.userId;
      const { targetId } = req.params;

      const result = await messageRequestService.getRelationshipStatus(userId, targetId);
      res.status(200).json(result);
    } catch (err: any) {
      console.error("[GET RELATIONSHIP STATUS ERROR]:", err);
      res.status(500).json({
        success: false,
        code: "SERVER_ERROR",
        message: "Failed to check relationship status.",
      });
    }
  }
}

export const messageRequestController = new MessageRequestController();
