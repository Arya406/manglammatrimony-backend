import { Request, Response } from "express";
import { authService, AuthService } from "../services/auth.service";

export class AuthController {
  constructor(private auth: AuthService = authService) {}

  requestOtp = async (req: Request, res: Response): Promise<void> => {
    try {
      const { method, identifier } = req.body;
      const result = await this.auth.requestRegistrationOtp(method, identifier);

      if (!result.success) {
        if (result.code === "EMAIL_ALREADY_REGISTERED" || result.code === "USER_ALREADY_EXISTS") {
          res.status(409).json(result);
          return;
        }
        if (result.code === "EMAIL_SEND_FAILED" || result.code === "EMAIL_DELIVERY_FAILED") {
          res.status(502).json(result);
          return;
        }
        res.status(400).json(result);
        return;
      }

      res.status(200).json(result);
    } catch (error) {
      console.error("[AUTH CONTROLLER ERROR - requestOtp]:", error);
      res.status(500).json({
        success: false,
        code: "INTERNAL_SERVER_ERROR",
        message: "Something went wrong while processing your request. Please try again.",
      });
    }
  };

  verifyOtp = async (req: Request, res: Response): Promise<void> => {
    try {
      const { verificationId, otp } = req.body;
      const result = await this.auth.verifyRegistrationOtp(verificationId, otp);

      if (!result.success) {
        if (result.code === "OTP_EXPIRED") {
          res.status(410).json(result);
          return;
        }
        if (result.code === "OTP_MAX_ATTEMPTS" || result.code === "TOO_MANY_ATTEMPTS") {
          res.status(429).json(result);
          return;
        }
        if (result.code === "INVALID_OTP" || result.code === "OTP_REQUIRED") {
          res.status(400).json(result);
          return;
        }
        res.status(400).json(result);
        return;
      }

      res.status(200).json(result);
    } catch (error) {
      console.error("[AUTH CONTROLLER ERROR - verifyOtp]:", error);
      res.status(500).json({
        success: false,
        code: "INTERNAL_SERVER_ERROR",
        message: "Something went wrong while verifying your code. Please try again.",
      });
    }
  };

  resendOtp = async (req: Request, res: Response): Promise<void> => {
    try {
      const { verificationId } = req.body;
      const result = await this.auth.resendRegistrationOtp(verificationId);

      if (!result.success) {
        if (result.code === "OTP_COOLDOWN" || result.code === "COOLDOWN_ACTIVE") {
          res.status(429).json(result);
          return;
        }
        if (result.code === "OTP_EXPIRED") {
          res.status(410).json(result);
          return;
        }
        if (result.code === "EMAIL_SEND_FAILED" || result.code === "EMAIL_DELIVERY_FAILED") {
          res.status(502).json(result);
          return;
        }
        res.status(400).json(result);
        return;
      }

      res.status(200).json(result);
    } catch (error) {
      console.error("[AUTH CONTROLLER ERROR - resendOtp]:", error);
      res.status(500).json({
        success: false,
        code: "INTERNAL_SERVER_ERROR",
        message: "Something went wrong while resending your code. Please try again.",
      });
    }
  };

  requestLoginOtp = async (req: Request, res: Response): Promise<void> => {
    try {
      const { method, identifier } = req.body;
      const result = await this.auth.requestLoginOtp(method, identifier);

      if (!result.success) {
        if (result.code === "USER_NOT_FOUND") {
          res.status(404).json(result);
          return;
        }
        if (
          result.code === "ACCOUNT_SUSPENDED" ||
          result.code === "ACCOUNT_BLOCKED" ||
          result.code === "ACCOUNT_DELETED"
        ) {
          res.status(403).json(result);
          return;
        }
        if (result.code === "EMAIL_SEND_FAILED" || result.code === "EMAIL_DELIVERY_FAILED") {
          res.status(502).json(result);
          return;
        }
        res.status(400).json(result);
        return;
      }

      res.status(200).json(result);
    } catch (error) {
      console.error("[AUTH CONTROLLER ERROR - requestLoginOtp]:", error);
      res.status(500).json({
        success: false,
        code: "INTERNAL_SERVER_ERROR",
        message: "Something went wrong while processing your request. Please try again.",
      });
    }
  };

  verifyLoginOtp = async (req: Request, res: Response): Promise<void> => {
    try {
      const { verificationId, otp } = req.body;
      const result = await this.auth.verifyLoginOtp(verificationId, otp);

      if (!result.success) {
        if (result.code === "USER_NOT_FOUND") {
          res.status(404).json(result);
          return;
        }
        if (
          result.code === "ACCOUNT_SUSPENDED" ||
          result.code === "ACCOUNT_BLOCKED" ||
          result.code === "ACCOUNT_DELETED"
        ) {
          res.status(403).json(result);
          return;
        }
        if (result.code === "OTP_EXPIRED") {
          res.status(410).json(result);
          return;
        }
        if (result.code === "OTP_MAX_ATTEMPTS" || result.code === "TOO_MANY_ATTEMPTS") {
          res.status(429).json(result);
          return;
        }
        if (result.code === "INVALID_OTP" || result.code === "OTP_REQUIRED") {
          res.status(400).json(result);
          return;
        }
        res.status(400).json(result);
        return;
      }

      res.status(200).json(result);
    } catch (error) {
      console.error("[AUTH CONTROLLER ERROR - verifyLoginOtp]:", error);
      res.status(500).json({
        success: false,
        code: "INTERNAL_SERVER_ERROR",
        message: "Something went wrong while verifying your code. Please try again.",
      });
    }
  };

  resendLoginOtp = async (req: Request, res: Response): Promise<void> => {
    try {
      const { verificationId } = req.body;
      const result = await this.auth.resendLoginOtp(verificationId);

      if (!result.success) {
        if (result.code === "OTP_COOLDOWN" || result.code === "COOLDOWN_ACTIVE") {
          res.status(429).json(result);
          return;
        }
        if (result.code === "OTP_EXPIRED") {
          res.status(410).json(result);
          return;
        }
        if (result.code === "EMAIL_SEND_FAILED" || result.code === "EMAIL_DELIVERY_FAILED") {
          res.status(502).json(result);
          return;
        }
        res.status(400).json(result);
        return;
      }

      res.status(200).json(result);
    } catch (error) {
      console.error("[AUTH CONTROLLER ERROR - resendLoginOtp]:", error);
      res.status(500).json({
        success: false,
        code: "INTERNAL_SERVER_ERROR",
        message: "Something went wrong while resending your code. Please try again.",
      });
    }
  };
}

export const authController = new AuthController();
