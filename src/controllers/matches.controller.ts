import { Request, Response } from "express";
import { matchesService } from "../services/matches.service";

export class MatchesController {
  getMatches = async (req: Request, res: Response): Promise<void> => {
    try {
      const currentUserId = req.user?.userId;
      if (!currentUserId) {
        res.status(401).json({
          success: false,
          code: "UNAUTHORIZED",
          message: "Authentication is required to view discovery matches.",
        });
        return;
      }

      const category = typeof req.query.category === "string" ? req.query.category : undefined;
      const page = typeof req.query.page === "string" ? parseInt(req.query.page, 10) : 1;
      const pageSize = typeof req.query.pageSize === "string" ? parseInt(req.query.pageSize, 10) : 20;

      const result = await matchesService.getDiscoveryMatches(currentUserId, {
        category,
        page,
        pageSize,
      });

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      console.error("[MATCHES CONTROLLER ERROR]:", error);
      res.status(500).json({
        success: false,
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to retrieve discovery matches.",
      });
    }
  };
}

export const matchesController = new MatchesController();
