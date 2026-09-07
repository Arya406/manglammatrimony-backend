import jwt from "jsonwebtoken";
import { config } from "../config/env";
import { AuthMethod, ApiResponse, RequestOtpResponse, AuthSessionResponse } from "../types/auth";
import { userRepository, UserRepository } from "../repositories/user.repository";
import { otpRepository, OtpRepository } from "../repositories/otp.repository";
import { otpService, OtpService } from "./otp.service";
import { prisma } from "../config/database";
import { ProfileStatus } from "@prisma/client";

export class AuthService {
  constructor(
    private users: UserRepository = userRepository,
    private otps: OtpRepository = otpRepository,
    private otpSvc: OtpService = otpService
  ) {}

  async requestRegistrationOtp(
    method: AuthMethod,
    normalizedIdentifier: string
  ): Promise<ApiResponse<RequestOtpResponse>> {
    const normalized = normalizedIdentifier.trim().toLowerCase();

    // 1. Check if user already exists
    const existingUser =
      method === "phone"
        ? await this.users.findByPhone(normalized)
        : await this.users.findByEmail(normalized);

    if (existingUser) {
      return {
        success: false,
        code: "EMAIL_ALREADY_REGISTERED",
        message: `An account already exists with this ${
          method === "phone" ? "mobile number" : "email address"
        }. Please log in instead.`,
      };
    }

    // 2. Create OTP session
    const { session, plainOtp } = this.otpSvc.createSession(
      method,
      normalized
    );

    // 3. Dispatch OTP via abstraction
    const sent = await this.otpSvc.sendOtp(normalized, plainOtp, method, false);
    if (!sent) {
      return {
        success: false,
        code: "EMAIL_SEND_FAILED",
        message: "Failed to deliver verification code. Please check your email address and try again.",
      };
    }

    // 4. Save session
    await this.otps.save(session);

    return {
      success: true,
      message: "Verification code sent successfully.",
      data: {
        verificationId: session.verificationId,
        method: session.method,
        maskedIdentifier: session.maskedIdentifier,
        resendCooldownSeconds: config.otp.resendCooldownSeconds,
        expiresInSeconds: config.otp.expirySeconds,
        ...(config.devDummyOtpEnabled ? { debugOtp: plainOtp } : {}),
      },
    };
  }

  async verifyRegistrationOtp(
    verificationId: string,
    otp: string
  ): Promise<ApiResponse<AuthSessionResponse>> {
    // 1. Find session
    const session = await this.otps.findById(verificationId);
    if (!session) {
      return {
        success: false,
        code: "OTP_EXPIRED",
        message: "This code has expired or is invalid. Please request a new one.",
      };
    }

    // 2. Check maximum attempts
    if (session.attempts >= session.maxAttempts) {
      await this.otps.delete(verificationId);
      return {
        success: false,
        code: "OTP_MAX_ATTEMPTS",
        message: "Maximum verification attempts exceeded. Please request a new code.",
      };
    }

    // 3. Verify OTP hash
    const isMatch = this.otpSvc.verifyOtpMatch(
      otp,
      session.hashedOtp,
      session.salt
    );

    if (!isMatch) {
      session.attempts += 1;
      await this.otps.update(session);

      if (session.attempts >= session.maxAttempts) {
        await this.otps.delete(verificationId);
        return {
          success: false,
          code: "OTP_MAX_ATTEMPTS",
          message: "Maximum verification attempts exceeded. Please request a new code.",
        };
      }

      return {
        success: false,
        code: "INVALID_OTP",
        message: "The verification code is invalid. Please try again.",
      };
    }

    // 4. Invalidate and clean up OTP session immediately
    await this.otps.delete(verificationId);

    // 5. Create active user
    const newUser = await this.users.create({
      phone: session.method === "phone" ? session.normalizedIdentifier : undefined,
      email: session.method === "email" ? session.normalizedIdentifier : undefined,
      phoneVerified: session.method === "phone",
      emailVerified: session.method === "email",
    });

    // 6. Sign JWT session token
    const token = jwt.sign(
      {
        userId: newUser.id,
        phone: newUser.phone,
        email: newUser.email,
        status: newUser.status,
      },
      config.jwtSecret,
      { expiresIn: config.jwtExpiry as jwt.SignOptions["expiresIn"] }
    );

    return {
      success: true,
      message: "Account created and verified successfully.",
      data: {
        user: {
          id: newUser.id,
          phone: newUser.phone,
          email: newUser.email,
          status: newUser.status,
        },
        token,
        redirectTo: "/onboarding",
      },
    };
  }

  async resendRegistrationOtp(
    verificationId: string
  ): Promise<ApiResponse<RequestOtpResponse>> {
    const session = await this.otps.findById(verificationId);
    if (!session) {
      return {
        success: false,
        code: "OTP_EXPIRED",
        message: "Verification session has expired. Please start registration again.",
      };
    }

    // Check resend cooldown
    const now = new Date();
    if (now < session.resendAvailableAt) {
      const waitSeconds = Math.ceil(
        (session.resendAvailableAt.getTime() - now.getTime()) / 1000
      );
      return {
        success: false,
        code: "OTP_COOLDOWN",
        message: `Please wait ${waitSeconds} seconds before requesting another code.`,
      };
    }

    // Generate new OTP and reset session
    const plainOtp = this.otpSvc.generateOtp();
    const hashedOtp = this.otpSvc.hashOtp(plainOtp, session.salt);

    session.hashedOtp = hashedOtp;
    session.attempts = 0;
    session.expiresAt = new Date(now.getTime() + config.otp.expirySeconds * 1000);
    session.resendAvailableAt = new Date(
      now.getTime() + config.otp.resendCooldownSeconds * 1000
    );

    await this.otps.update(session);
    const sent = await this.otpSvc.sendOtp(
      session.normalizedIdentifier,
      plainOtp,
      session.method
    );

    if (!sent) {
      return {
        success: false,
        code: "EMAIL_SEND_FAILED",
        message: "Failed to deliver verification code. Please check your email address and try again.",
      };
    }

    return {
      success: true,
      message: "A new verification code has been sent.",
      data: {
        verificationId: session.verificationId,
        method: session.method,
        maskedIdentifier: session.maskedIdentifier,
        resendCooldownSeconds: config.otp.resendCooldownSeconds,
        expiresInSeconds: config.otp.expirySeconds,
        ...(config.devDummyOtpEnabled ? { debugOtp: plainOtp } : {}),
      },
    };
  }

  /**
   * Initiates OTP login for an existing registered user.
   * NEVER creates a user.
   */
  async requestLoginOtp(
    method: AuthMethod,
    normalizedIdentifier: string
  ): Promise<ApiResponse<RequestOtpResponse>> {
    const normalized = normalizedIdentifier.trim().toLowerCase();

    // 1. Check if user exists in PostgreSQL database
    const existingUser =
      method === "phone"
        ? await this.users.findByPhone(normalized)
        : await this.users.findByEmail(normalized);

    if (!existingUser) {
      return {
        success: false,
        code: "USER_NOT_FOUND",
        message: "No account was found with this email address. Please register first.",
      };
    }

    // 2. Validate user status
    if (existingUser.status === "SUSPENDED") {
      return {
        success: false,
        code: "ACCOUNT_SUSPENDED",
        message: "Your account is currently suspended. Please contact support for assistance.",
      };
    }

    if (existingUser.status === "BLOCKED") {
      return {
        success: false,
        code: "ACCOUNT_BLOCKED",
        message: "This account is currently unavailable. Please contact support.",
      };
    }

    if (existingUser.status === "DELETED") {
      return {
        success: false,
        code: "ACCOUNT_DELETED",
        message: "This account is no longer available.",
      };
    }

    // 3. Create OTP session
    const { session, plainOtp } = this.otpSvc.createSession(
      method,
      normalized
    );

    // 4. Dispatch OTP via configured provider
    const sent = await this.otpSvc.sendOtp(normalized, plainOtp, method, true);
    if (!sent) {
      return {
        success: false,
        code: "EMAIL_SEND_FAILED",
        message: "Failed to deliver login verification code. Please check your email address and try again.",
      };
    }

    // 5. Save session to repository
    await this.otps.save(session);

    return {
      success: true,
      message: "Verification code sent successfully.",
      data: {
        verificationId: session.verificationId,
        method: session.method,
        maskedIdentifier: session.maskedIdentifier,
        resendCooldownSeconds: config.otp.resendCooldownSeconds,
        expiresInSeconds: config.otp.expirySeconds,
        ...(config.devDummyOtpEnabled ? { debugOtp: plainOtp } : {}),
      },
    };
  }

  /**
   * Verifies login OTP and issues JWT session for the existing user.
   * NEVER creates a new user.
   */
  async verifyLoginOtp(
    verificationId: string,
    otp: string
  ): Promise<ApiResponse<AuthSessionResponse>> {
    // 1. Find session
    const session = await this.otps.findById(verificationId);
    if (!session) {
      return {
        success: false,
        code: "OTP_EXPIRED",
        message: "This code has expired or is invalid. Please request a new one.",
      };
    }

    // 2. Check maximum attempts
    if (session.attempts >= session.maxAttempts) {
      await this.otps.delete(verificationId);
      return {
        success: false,
        code: "OTP_MAX_ATTEMPTS",
        message: "Maximum verification attempts exceeded. Please request a new code.",
      };
    }

    // 3. Verify OTP hash with timing-safe comparison
    const isMatch = this.otpSvc.verifyOtpMatch(
      otp,
      session.hashedOtp,
      session.salt
    );

    if (!isMatch) {
      session.attempts += 1;
      await this.otps.update(session);

      if (session.attempts >= session.maxAttempts) {
        await this.otps.delete(verificationId);
        return {
          success: false,
          code: "OTP_MAX_ATTEMPTS",
          message: "Maximum verification attempts exceeded. Please request a new code.",
        };
      }

      return {
        success: false,
        code: "INVALID_OTP",
        message: "The verification code is invalid. Please try again.",
      };
    }

    // 4. Invalidate and clean up OTP session immediately
    await this.otps.delete(verificationId);

    // 5. Look up existing user in PostgreSQL
    const existingUser =
      session.method === "phone"
        ? await this.users.findByPhone(session.normalizedIdentifier)
        : await this.users.findByEmail(session.normalizedIdentifier);

    if (!existingUser) {
      return {
        success: false,
        code: "USER_NOT_FOUND",
        message: "No account was found with these details.",
      };
    }

    // 6. Check user status
    if (existingUser.status === "SUSPENDED") {
      return {
        success: false,
        code: "ACCOUNT_SUSPENDED",
        message: "Your account is currently suspended. Please contact support for assistance.",
      };
    }

    if (existingUser.status === "BLOCKED") {
      return {
        success: false,
        code: "ACCOUNT_BLOCKED",
        message: "This account is currently unavailable. Please contact support.",
      };
    }

    if (existingUser.status === "DELETED") {
      return {
        success: false,
        code: "ACCOUNT_DELETED",
        message: "This account is no longer available.",
      };
    }

    // 7. Resolve profile status to determine accurate redirect route
    const userProfile = await prisma.profile.findUnique({
      where: { userId: existingUser.id },
      select: { profileStatus: true },
    });

    let redirectTo = "/onboarding";
    if (userProfile?.profileStatus === ProfileStatus.ACTIVE) {
      redirectTo = "/matches";
    } else if (userProfile?.profileStatus === ProfileStatus.IN_REVIEW) {
      redirectTo = "/onboarding/review";
    } else {
      redirectTo = "/onboarding";
    }

    // 8. Sign JWT session token with real PostgreSQL user.id
    const token = jwt.sign(
      {
        userId: existingUser.id,
        phone: existingUser.phone,
        email: existingUser.email,
        status: existingUser.status,
      },
      config.jwtSecret,
      { expiresIn: config.jwtExpiry as jwt.SignOptions["expiresIn"] }
    );

    return {
      success: true,
      message: "Login successful.",
      data: {
        user: {
          id: existingUser.id,
          phone: existingUser.phone,
          email: existingUser.email,
          status: existingUser.status,
        },
        token,
        redirectTo,
      },
    };
  }

  /**
   * Resends login OTP for active verification session.
   */
  async resendLoginOtp(
    verificationId: string
  ): Promise<ApiResponse<RequestOtpResponse>> {
    return this.resendRegistrationOtp(verificationId);
  }
}

export const authService = new AuthService();
