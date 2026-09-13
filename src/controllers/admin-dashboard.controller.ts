import { Request, Response } from "express";
import { prisma } from "../config/database";
import { ProfileStatus } from "@prisma/client";

export class AdminDashboardController {
  /**
   * GET /api/admin/dashboard/stats
   * Returns authoritative real-time database aggregate counts.
   * Excludes PII and protected under adminAuthMiddleware.
   */
  async getStats(req: Request, res: Response): Promise<void> {
    try {
      const [totalUsers, totalProfiles, activeProfiles, incompleteProfiles] =
        await Promise.all([
          prisma.user.count(),
          prisma.profile.count(),
          prisma.profile.count({
            where: { profileStatus: ProfileStatus.ACTIVE },
          }),
          prisma.profile.count({
            where: { profileStatus: ProfileStatus.INCOMPLETE },
          }),
        ]);

      res.status(200).json({
        success: true,
        data: {
          users: totalUsers,
          profiles: totalProfiles,
          activeProfiles: activeProfiles,
          incompleteProfiles: incompleteProfiles,
        },
      });
    } catch (error) {
      console.error("[ADMIN DASHBOARD ERROR]: Error calculating dashboard stats:", error);
      res.status(500).json({
        success: false,
        code: "INTERNAL_ERROR",
        message: "Failed to retrieve dashboard statistics.",
      });
    }
  }
}

export const adminDashboardController = new AdminDashboardController();
