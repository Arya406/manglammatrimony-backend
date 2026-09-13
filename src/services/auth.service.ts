import jwt from "jsonwebtoken";
import { config } from "../config/env";
import { AuthMethod, ApiResponse, RequestOtpResponse, AuthSessionResponse, OtpSession } from "../types/auth";
import { userRepository, UserRepository } from "../repositories/user.repository";
import { otpRepository, OtpRepository } from "../repositories/otp.repository";
import { otpService, OtpService } from "./otp.service";
import { emailService } from "./email.service";
import { prisma } from "../config/database";
import { ProfileStatus, UserStatus, AccountActivationStatus } from "@prisma/client";

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

    // 2. Validate activation status
    if (existingUser.activationStatus === "PENDING_ACTIVATION") {
      return {
        success: false,
        code: "ACCOUNT_PENDING_ACTIVATION",
        message:
          "This account is pending email ownership verification. Please activate your account using the verification code sent to your email.",
      };
    }

    // 3. Validate user status
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

    // 6. Check activation status
    if (existingUser.activationStatus === "PENDING_ACTIVATION") {
      return {
        success: false,
        code: "ACCOUNT_PENDING_ACTIVATION",
        message:
          "This account is pending email ownership verification. Please activate your account using the verification code sent to your email.",
      };
    }

    // 7. Check user status
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

  /**
   * Public endpoint: sends activation OTP to an account in PENDING_ACTIVATION state.
   */
  async requestActivationOtp(
    rawEmail: string
  ): Promise<ApiResponse<RequestOtpResponse>> {
    const normalized = rawEmail.trim().toLowerCase();

    // 1. Look up user by email
    const existingUser = await this.users.findByEmail(normalized);

    if (!existingUser) {
      return {
        success: false,
        code: "ACCOUNT_NOT_FOUND",
        message: "No account found with this email address.",
      };
    }

    // 2. Check if already activated
    if (existingUser.activationStatus === "ACTIVE" || existingUser.emailVerified) {
      return {
        success: false,
        code: "ACCOUNT_ALREADY_ACTIVATED",
        message:
          "This account has already completed ownership verification. Please log in directly.",
      };
    }

    // 3. Status checks
    if (existingUser.status === "DELETED") {
      return {
        success: false,
        code: "ACCOUNT_DELETED",
        message: "This account is no longer available.",
      };
    }

    if (existingUser.status === "SUSPENDED") {
      return {
        success: false,
        code: "ACCOUNT_SUSPENDED",
        message: "Your account is currently suspended. Please contact support.",
      };
    }

    if (existingUser.status === "BLOCKED") {
      return {
        success: false,
        code: "ACCOUNT_BLOCKED",
        message: "Your account has been blocked. Please contact support.",
      };
    }

    // 4. Rate-limiting / Cooldown check on latest active OTP for this email
    const latestOtp = await prisma.verificationOtp.findFirst({
      where: {
        email: normalized,
        consumedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: "desc" },
    });

    const now = new Date();
    if (latestOtp && now < latestOtp.resendAvailableAt) {
      const waitSeconds = Math.ceil(
        (latestOtp.resendAvailableAt.getTime() - now.getTime()) / 1000
      );
      return {
        success: false,
        code: "OTP_COOLDOWN",
        message: `Please wait ${waitSeconds} seconds before requesting another code.`,
      };
    }

    // Invalidate previous active OTP sessions for this email
    await prisma.verificationOtp.updateMany({
      where: { email: normalized, consumedAt: null },
      data: { consumedAt: now },
    });

    // 5. Create new session
    const { session, plainOtp } = this.otpSvc.createSession("email", normalized);

    // Resolve user's firstName if available
    const userProfile = await prisma.profile.findUnique({
      where: { userId: existingUser.id },
      select: { personalDetails: { select: { firstName: true } } },
    });
    const firstName = userProfile?.personalDetails?.firstName || undefined;

    // Dispatch email
    const sent = await emailService.sendAccountActivationEmail(normalized, plainOtp, firstName);
    if (!sent.success) {
      return {
        success: false,
        code: "EMAIL_SEND_FAILED",
        message: "Failed to deliver activation code. Please try again.",
      };
    }

    // Save session
    await this.otps.save(session);

    return {
      success: true,
      message: "Activation code sent successfully.",
      data: {
        verificationId: session.verificationId,
        method: "email",
        maskedIdentifier: session.maskedIdentifier,
        resendCooldownSeconds: config.otp.resendCooldownSeconds,
        expiresInSeconds: config.otp.expirySeconds,
        ...(config.devDummyOtpEnabled ? { debugOtp: plainOtp } : {}),
      },
    };
  }

  /**
   * Core verification engine for activation OTPs.
   * Shared atomically between public candidate claiming and authenticated admin activation.
   */
  async verifyActivationOtpCore(params: {
    userId?: string;
    email?: string;
    verificationId?: string;
    otp: string;
    adminUserId?: string;
  }): Promise<{
    success: boolean;
    status: number;
    code?: string;
    message: string;
    user?: {
      id: string;
      phone: string | null;
      email: string | null;
      status: UserStatus;
      activationStatus: AccountActivationStatus;
      emailVerifiedAt: Date | null;
      activatedAt: Date | null;
      activatedByUserId: string | null;
    };
  }> {
    const { otp, verificationId, email, userId, adminUserId } = params;

    if (!otp || typeof otp !== "string" || !/^\d{6}$/.test(otp.trim())) {
      return {
        success: false,
        status: 400,
        code: "INVALID_OTP",
        message: "A valid 6-digit verification code is required.",
      };
    }

    // 1. Locate user record
    let user: any = null;
    if (userId) {
      user = await prisma.user.findUnique({ where: { id: userId.trim() } });
    } else if (email) {
      user = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
    } else if (verificationId) {
      const session = await this.otps.findById(verificationId);
      if (session?.normalizedIdentifier) {
        user = await prisma.user.findUnique({ where: { email: session.normalizedIdentifier } });
      }
    }

    if (!user) {
      return {
        success: false,
        status: 404,
        code: "USER_NOT_FOUND",
        message: "No user account associated with this verification request.",
      };
    }

    // 2. Enforce Account Status checks
    if (user.status === UserStatus.DELETED) {
      return {
        success: false,
        status: 400,
        code: "ACCOUNT_DELETED",
        message: "This account has been deleted.",
      };
    }

    if (user.status === UserStatus.SUSPENDED) {
      return {
        success: false,
        status: 400,
        code: "ACCOUNT_SUSPENDED",
        message: "Your account is currently suspended. Please contact support.",
      };
    }

    if (user.status === UserStatus.BLOCKED) {
      return {
        success: false,
        status: 400,
        code: "ACCOUNT_BLOCKED",
        message: "Your account has been blocked. Please contact support.",
      };
    }

    if (!user.email) {
      return {
        success: false,
        status: 400,
        code: "INVALID_USER",
        message: "User account does not have an email address associated with activation.",
      };
    }

    // 3. Locate active OTP session for this user's email
    const normalizedEmail = user.email.trim().toLowerCase();
    let latestOtpRecord: any = null;

    if (verificationId) {
      latestOtpRecord = await prisma.verificationOtp.findFirst({
        where: {
          id: verificationId.trim(),
          email: normalizedEmail,
          consumedAt: null,
          expiresAt: { gt: new Date() },
        },
      });
    } else {
      latestOtpRecord = await prisma.verificationOtp.findFirst({
        where: {
          email: normalizedEmail,
          consumedAt: null,
          expiresAt: { gt: new Date() },
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      });
    }

    if (!latestOtpRecord) {
      return {
        success: false,
        status: 410,
        code: "OTP_EXPIRED",
        message: "This verification code has expired or is invalid. Please request a new one.",
      };
    }

    const session: OtpSession = {
      verificationId: latestOtpRecord.id,
      method: "email",
      normalizedIdentifier: latestOtpRecord.email,
      maskedIdentifier: this.otpSvc.maskIdentifier(latestOtpRecord.email, "email"),
      hashedOtp: latestOtpRecord.hashedOtp,
      salt: latestOtpRecord.salt,
      attempts: latestOtpRecord.attempts,
      maxAttempts: latestOtpRecord.maxAttempts,
      expiresAt: latestOtpRecord.expiresAt,
      resendAvailableAt: latestOtpRecord.resendAvailableAt,
      createdAt: latestOtpRecord.createdAt,
    };

    // Safe structured diagnostic logging (ZERO plaintext OTP, ZERO secrets)
    console.log("[ACTIVATION OTP VERIFY ATTEMPT]", {
      userId: user.id,
      purpose: "activation",
      otpSessionId: session.verificationId,
      createdAt: session.createdAt,
      expiresAt: session.expiresAt,
      resendAvailableAt: session.resendAvailableAt,
      attempts: session.attempts,
      maxAttempts: session.maxAttempts,
      consumedAt: null,
      sessionExists: true,
      sessionStatus: "ACTIVE",
      emailProvider: config.otp.provider,
    });

    // 4. Check if already activated
    if (user.activationStatus === AccountActivationStatus.ACTIVE && user.emailVerifiedAt) {
      return {
        success: false,
        status: 409,
        code: "ACCOUNT_ALREADY_ACTIVATED",
        message: "This account has already completed ownership verification.",
      };
    }

    // 5. Check maximum attempts
    if (session.attempts >= session.maxAttempts) {
      await this.otps.delete(session.verificationId);
      return {
        success: false,
        status: 400,
        code: "OTP_MAX_ATTEMPTS",
        message: "Maximum verification attempts exceeded. Please request a new code.",
      };
    }

    // 6. Verify OTP hash match
    const isMatch = this.otpSvc.verifyOtpMatch(
      otp.trim(),
      session.hashedOtp,
      session.salt
    );

    if (!isMatch) {
      const newAttempts = session.attempts + 1;
      session.attempts = newAttempts;
      await this.otps.update(session);
      await prisma.verificationOtp.update({
        where: { id: latestOtpRecord.id },
        data: { attempts: newAttempts },
      });

      if (newAttempts >= session.maxAttempts) {
        await this.otps.delete(session.verificationId);
        return {
          success: false,
          status: 400,
          code: "OTP_MAX_ATTEMPTS",
          message: "Maximum verification attempts exceeded. Please request a new code.",
        };
      }

      return {
        success: false,
        status: 400,
        code: "INVALID_OTP",
        message: "The verification code is invalid. Please check and try again.",
      };
    }

    // 7. OTP is valid! Atomically transition state inside a transaction
    const now = new Date();
    try {
      const updatedUser = await prisma.$transaction(async (tx) => {
        // Enforce concurrency: user must still be PENDING_ACTIVATION
        const userUpdate = await tx.user.updateMany({
          where: {
            id: user.id,
            activationStatus: AccountActivationStatus.PENDING_ACTIVATION,
          },
          data: {
            activationStatus: AccountActivationStatus.ACTIVE,
            emailVerifiedAt: now,
            activatedAt: now,
            activatedByUserId: adminUserId || null,
          },
        });

        if (userUpdate.count === 0) {
          throw new Error("ACCOUNT_ALREADY_ACTIVATED");
        }

        // Enforce single-use: mark the specific OTP session consumed
        const otpUpdate = await tx.verificationOtp.updateMany({
          where: {
            id: latestOtpRecord.id,
            consumedAt: null,
          },
          data: {
            consumedAt: now,
          },
        });

        if (otpUpdate.count === 0) {
          throw new Error("OTP_ALREADY_USED");
        }

        return await tx.user.findUniqueOrThrow({
          where: { id: user.id },
        });
      });

      return {
        success: true,
        status: 200,
        message: "Account verified and activated successfully.",
        user: {
          id: updatedUser.id,
          phone: updatedUser.phone,
          email: updatedUser.email,
          status: updatedUser.status,
          activationStatus: updatedUser.activationStatus,
          emailVerifiedAt: updatedUser.emailVerifiedAt,
          activatedAt: updatedUser.activatedAt,
          activatedByUserId: updatedUser.activatedByUserId,
        },
      };
    } catch (err: any) {
      if (err?.message === "ACCOUNT_ALREADY_ACTIVATED") {
        return {
          success: false,
          status: 409,
          code: "ACCOUNT_ALREADY_ACTIVATED",
          message: "This account has already completed ownership verification.",
        };
      }
      if (err?.message === "OTP_ALREADY_USED") {
        return {
          success: false,
          status: 409,
          code: "OTP_ALREADY_USED",
          message: "This verification code has already been used.",
        };
      }
      throw err;
    }
  }

  /**
   * Public endpoint: verifies activation OTP, updates account to ACTIVE, and returns normal USER JWT.
   */
  async verifyActivationOtp(params: {
    email?: string;
    verificationId?: string;
    otp: string;
  }): Promise<ApiResponse<AuthSessionResponse>> {
    const core = await this.verifyActivationOtpCore(params);

    if (!core.success || !core.user) {
      return {
        success: false,
        code: core.code,
        message: core.message,
      };
    }

    // Sign normal USER JWT (role: USER, never ADMIN)
    const token = jwt.sign(
      {
        userId: core.user.id,
        email: core.user.email,
        role: "USER",
        status: core.user.status,
      },
      config.jwtSecret,
      { expiresIn: config.jwtExpiry as jwt.SignOptions["expiresIn"] }
    );

    return {
      success: true,
      message: core.message,
      data: {
        user: {
          id: core.user.id,
          phone: core.user.phone || undefined,
          email: core.user.email || undefined,
          status: core.user.status,
        },
        token,
        redirectTo: "/onboarding",
      },
    };
  }
}

export const authService = new AuthService();
