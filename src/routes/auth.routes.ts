import { Router } from "express";
import { authController } from "../controllers/auth.controller";
import {
  validateRequestOtp,
  validateVerifyOtp,
  validateResendOtp,
} from "../middlewares/validation.middleware";
import { otpRequestRateLimiter } from "../middlewares/rate-limiter.middleware";

export const authRouter = Router();

// Registration OTP Endpoints
authRouter.post(
  "/register/request-otp",
  validateRequestOtp,
  otpRequestRateLimiter,
  authController.requestOtp
);

authRouter.post(
  "/register/verify-otp",
  validateVerifyOtp,
  authController.verifyOtp
);

authRouter.post(
  "/register/resend-otp",
  validateResendOtp,
  otpRequestRateLimiter,
  authController.resendOtp
);

// Login OTP Endpoints
authRouter.post(
  "/login/request-otp",
  validateRequestOtp,
  otpRequestRateLimiter,
  authController.requestLoginOtp
);

authRouter.post(
  "/login/verify-otp",
  validateVerifyOtp,
  authController.verifyLoginOtp
);

authRouter.post(
  "/login/resend-otp",
  validateResendOtp,
  otpRequestRateLimiter,
  authController.resendLoginOtp
);
