import { Request, Response } from "express";
import { favouriteService } from "../services/favourite.service";

export class FavouriteController {
  /**
   * POST /api/profile/favourites/:profileId
   * Adds profile to current user's favourites (outgoing like).
   */
  async addFavourite(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.userId;
      const { profileId } = req.params;

      const result = await favouriteService.addFavourite(userId, profileId);

      if (!result.success) {
        const statusCode =
          result.code === "CANNOT_FAVOURITE_SELF" || result.code === "INVALID_PROFILE_ID"
            ? 400
            : result.code === "TARGET_PROFILE_NOT_FOUND"
            ? 404
            : 400;

        res.status(statusCode).json(result);
        return;
      }

      res.status(200).json(result);
    } catch (err: any) {
      console.error("[ADD FAVOURITE ERROR]:", err);
      res.status(500).json({
        success: false,
        code: "SERVER_ERROR",
        message: "Failed to add profile to favourites.",
      });
    }
  }

  /**
   * DELETE /api/profile/favourites/:profileId
   * Removes profile from current user's favourites.
   */
  async removeFavourite(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.userId;
      const { profileId } = req.params;

      const result = await favouriteService.removeFavourite(userId, profileId);

      if (!result.success) {
        res.status(400).json(result);
        return;
      }

      res.status(200).json(result);
    } catch (err: any) {
      console.error("[REMOVE FAVOURITE ERROR]:", err);
      res.status(500).json({
        success: false,
        code: "SERVER_ERROR",
        message: "Failed to remove profile from favourites.",
      });
    }
  }

  /**
   * GET /api/profile/favourites/status/:profileId
   * Checks whether the current user has favourited target profile.
   */
  async getFavouriteStatus(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.userId;
      const { profileId } = req.params;

      const result = await favouriteService.getFavouriteStatus(userId, profileId);

      if (!result.success) {
        res.status(400).json(result);
        return;
      }

      res.status(200).json(result);
    } catch (err: any) {
      console.error("[GET FAVOURITE STATUS ERROR]:", err);
      res.status(500).json({
        success: false,
        code: "SERVER_ERROR",
        message: "Failed to retrieve favourite status.",
      });
    }
  }

  /**
   * GET /api/profile/favourites
   * Retrieves profiles the current user has favourited (Sent Favourites).
   */
  async getFavourites(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.userId;
      const page = parseInt(req.query.page as string, 10) || 1;
      const pageSize = parseInt(req.query.pageSize as string, 10) || 20;

      const result = await favouriteService.getSentFavourites(userId, { page, pageSize });
      res.status(200).json(result);
    } catch (err: any) {
      console.error("[GET SENT FAVOURITES ERROR]:", err);
      res.status(500).json({
        success: false,
        code: "SERVER_ERROR",
        message: "Failed to retrieve favourites.",
      });
    }
  }

  /**
   * GET /api/profile/likes/received
   * Retrieves profiles that have liked the current user (Received Likes).
   */
  async getReceivedLikes(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.userId;
      const page = parseInt(req.query.page as string, 10) || 1;
      const pageSize = parseInt(req.query.pageSize as string, 10) || 20;

      const result = await favouriteService.getReceivedLikes(userId, { page, pageSize });
      res.status(200).json(result);
    } catch (err: any) {
      console.error("[GET RECEIVED LIKES ERROR]:", err);
      res.status(500).json({
        success: false,
        code: "SERVER_ERROR",
        message: "Failed to retrieve received likes.",
      });
    }
  }

  /**
   * GET /api/profile/likes/received/count
   * Retrieves count of incoming likes (people who liked the current user).
   */
  async getReceivedLikesCount(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.userId;
      const result = await favouriteService.getReceivedLikesCount(userId);
      res.status(200).json(result);
    } catch (err: any) {
      console.error("[GET RECEIVED LIKES COUNT ERROR]:", err);
      res.status(500).json({
        success: false,
        code: "SERVER_ERROR",
        message: "Failed to retrieve received likes count.",
      });
    }
  }
}

export const favouriteController = new FavouriteController();
