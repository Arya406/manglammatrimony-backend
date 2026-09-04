import { Request, Response, NextFunction } from "express";
import { AuthMethod } from "../types/auth";

export interface NormalizedRequestOtpBody {
  method: AuthMethod;
  identifier: string;
}

export function validateRequestOtp(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  let { method, identifier, phone, email } = req.body;

  // Block phone authentication explicitly as mobile-number auth is retired
  if (phone || method === "phone") {
    res.status(400).json({
      success: false,
      code: "EMAIL_AUTHENTICATION_REQUIRED",
      message: "Mobile number authentication has been retired. Please use your email address.",
    });
    return;
  }

  // Support direct { email } or { identifier } payloads
  if (email && typeof email === "string") {
    identifier = email;
  }

  if (!identifier || typeof identifier !== "string") {
    res.status(400).json({
      success: false,
      code: "MISSING_IDENTIFIER",
      message: "Please enter your email address.",
    });
    return;
  }

  const trimmed = identifier.trim();
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  const normalizedEmail = trimmed.toLowerCase();

  if (!emailRegex.test(normalizedEmail)) {
    res.status(400).json({
      success: false,
      code: "INVALID_EMAIL",
      message: "Please enter a valid email address.",
    });
    return;
  }

  req.body.method = "email";
  req.body.identifier = normalizedEmail;
  req.body.email = normalizedEmail;
  next();
}

export function validateVerifyOtp(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const { verificationId, otp } = req.body;

  if (!verificationId || typeof verificationId !== "string" || !verificationId.trim()) {
    res.status(400).json({
      success: false,
      code: "MISSING_VERIFICATION_ID",
      message: "Verification reference is required.",
    });
    return;
  }

  if (otp === undefined || otp === null || (typeof otp === "string" && otp.trim().length === 0)) {
    res.status(400).json({
      success: false,
      code: "OTP_REQUIRED",
      message: "Please enter your 6-digit verification code.",
    });
    return;
  }

  if (typeof otp !== "string" || !/^\d{6}$/.test(otp.trim())) {
    res.status(400).json({
      success: false,
      code: "INVALID_OTP",
      message: "The verification code is invalid. Please enter 6 digits.",
    });
    return;
  }

  req.body.otp = otp.trim();
  next();
}

export function validateResendOtp(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const { verificationId } = req.body;

  if (!verificationId || typeof verificationId !== "string") {
    res.status(400).json({
      success: false,
      code: "MISSING_VERIFICATION_ID",
      message: "Verification reference is required.",
    });
    return;
  }

  next();
}
