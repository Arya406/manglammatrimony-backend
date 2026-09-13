import { Request, Response } from "express";
import { adminAuthService } from "../services/admin-auth.service";

export class AdminAuthController {
  /**
   * POST /api/admin/auth/login
   */
  async login(req: Request, res: Response): Promise<void> {
    try {
      const { email, password } = req.body || {};

      if (!email || !password) {
        res.status(400).json({
          success: false,
          code: "VALIDATION_ERROR",
          message: "Email and password are required.",
        });
        return;
      }

      const result = await adminAuthService.loginAdmin(email, password);

      if (!result.success) {
        res.status(401).json(result);
        return;
      }

      res.status(200).json(result);
    } catch (error) {
      console.error("[ADMIN AUTH ERROR]: Unexpected error during admin login:", error);
      res.status(500).json({
        success: false,
        code: "INTERNAL_ERROR",
        message: "An unexpected error occurred. Please try again.",
      });
    }
  }

  /**
   * GET /api/admin/auth/me
   */
  async me(req: Request, res: Response): Promise<void> {
    try {
      if (!req.admin) {
        res.status(401).json({
          success: false,
          code: "UNAUTHORIZED",
          message: "Admin authentication required.",
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: {
          admin: {
            id: req.admin.id,
            email: req.admin.email,
            role: req.admin.role,
          },
        },
      });
    } catch (error) {
      console.error("[ADMIN AUTH ERROR]: Unexpected error during admin /me:", error);
      res.status(500).json({
        success: false,
        code: "INTERNAL_ERROR",
        message: "An unexpected error occurred.",
      });
    }
  }
}

export const adminAuthController = new AdminAuthController();
