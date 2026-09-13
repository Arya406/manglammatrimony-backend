import { prisma } from "../config/database";
import { UserRole, UserStatus, AccountActivationStatus, ProfileStatus, ProfileCreatedFor, Prisma } from "@prisma/client";
import { resolvePhotoPublicUrl, getStorageProvider } from "../providers/storage";
import { otpService, OtpService } from "./otp.service";
import { otpRepository, OtpRepository } from "../repositories/otp.repository";
import { emailService } from "./email.service";
import { authService } from "./auth.service";
import { config } from "../config/env";
import { calculateProfileCompletion, validateProfileCompleteness } from "./profile.completion";
import { profileRepository } from "../repositories/profile.repository";

export function maskPhoneNumber(phone?: string | null): string | null {
  if (!phone) return null;
  const cleaned = phone.trim();
  if (cleaned.length <= 4) return "****";
  if (cleaned.startsWith("+")) {
    const spaceIndex = cleaned.indexOf(" ");
    if (spaceIndex !== -1 && spaceIndex < cleaned.length - 4) {
      const prefix = cleaned.substring(0, spaceIndex + 1);
      const rest = cleaned.substring(spaceIndex + 1);
      const maskedRest = "*".repeat(Math.max(rest.length - 4, 3)) + rest.slice(-4);
      return prefix + maskedRest;
    }
  }
  const visible = cleaned.slice(-4);
  const maskedPrefix = "*".repeat(Math.max(cleaned.length - 4, 4));
  return `${maskedPrefix}${visible}`;
}

export interface AdminListUsersOptions {
  page?: number;
  pageSize?: number;
  q?: string;
  status?: UserStatus;
  role?: UserRole;
  activationStatus?: AccountActivationStatus;
  emailVerified?: boolean;
  phoneVerified?: boolean;
  sort?: "newest" | "oldest" | "name_asc" | "name_desc";
}

export interface AdminUserProfileSummary {
  profileId: string;
  profileStatus: string;
  completionPercentage: number;
  profileCreatedFor: string;
  gender: string | null;
  city: string | null;
  state: string | null;
  firstName: string | null;
  lastName: string | null;
  submittedAt: Date | null;
  createdAt: Date;
  primaryPhotoUrl: string | null;
}

export interface AdminUserListItem {
  id: string;
  email: string | null;
  maskedPhone: string | null;
  displayName: string;
  firstName: string | null;
  lastName: string | null;
  role: UserRole;
  status: UserStatus;
  activationStatus: AccountActivationStatus;
  activationPending: boolean;
  emailVerified: boolean;
  emailVerifiedAt: Date | null;
  phoneVerified: boolean;
  phoneVerifiedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  profile: AdminUserProfileSummary | null;
}

export interface AdminUserListResponse {
  users: AdminUserListItem[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };
}

export interface AdminUserStatusModerator {
  id: string;
  email: string | null;
}

export interface AdminUserDetail {
  id: string;
  email: string | null;
  maskedPhone: string | null;
  role: UserRole;
  status: UserStatus;
  activationStatus: AccountActivationStatus;
  activationPending: boolean;
  statusChangedAt: Date | null;
  statusChangedByUserId: string | null;
  statusChangedByUser: AdminUserStatusModerator | null;
  emailVerified: boolean;
  emailVerifiedAt: Date | null;
  phoneVerified: boolean;
  phoneVerifiedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  profile: AdminUserProfileSummary | null;
}

export interface UpdateUserStatusOptions {
  userId: string;
  desiredStatus: UserStatus;
  adminUserId: string;
  expectedCurrentStatus?: UserStatus;
}

export interface UserStatusMutationResult {
  success: boolean;
  status: number;
  code?: string;
  message: string;
  user?: AdminUserDetail;
}

export interface CreateAdminUserInput {
  email: string;
  firstName?: string;
  lastName?: string;
  gender?: string;
  profileCreatedFor?: ProfileCreatedFor;
}

export interface CreateAdminUserResult {
  success: boolean;
  status: number;
  code?: string;
  message: string;
  warning?: string;
  user?: AdminUserDetail;
  debugOtp?: string;
}

export interface ResendActivationResult {
  success: boolean;
  status: number;
  code?: string;
  message: string;
  debugOtp?: string;
}

export interface AdminVerifyActivationResult {
  success: boolean;
  status: number;
  code?: string;
  message: string;
  data?: {
    userId: string;
    status: UserStatus;
    activationStatus: AccountActivationStatus;
    emailVerified: boolean;
    activatedAt?: Date | null;
    activatedByUserId?: string | null;
  };
}

export class AdminUsersService {
  constructor(
    private otps: OtpRepository = otpRepository,
    private otpSvc: OtpService = otpService
  ) {}

  /**
   * Retrieves paginated, filtered, searchable list of all platform user accounts.
   */
  async listUsers(options: AdminListUsersOptions): Promise<AdminUserListResponse> {
    const page = Math.max(1, options.page || 1);
    const pageSize = Math.min(100, Math.max(1, options.pageSize || 20));
    const skip = (page - 1) * pageSize;

    const where: Prisma.UserWhereInput = {};

    // 1. Status filter
    if (options.status) {
      where.status = options.status;
    }

    // 2. Role filter
    if (options.role) {
      where.role = options.role;
    }

    // 2.5. Activation status filter
    if (options.activationStatus) {
      where.activationStatus = options.activationStatus;
    }

    // 3. Email verification filter
    if (options.emailVerified !== undefined) {
      where.emailVerifiedAt = options.emailVerified ? { not: null } : null;
    }

    // 4. Phone verification filter
    if (options.phoneVerified !== undefined) {
      where.phoneVerifiedAt = options.phoneVerified ? { not: null } : null;
    }

    // 5. Case-insensitive search
    if (options.q && options.q.trim()) {
      const query = options.q.trim();
      where.OR = [
        { email: { contains: query, mode: "insensitive" } },
        { phone: { contains: query, mode: "insensitive" } },
        {
          profile: {
            personalDetails: {
              firstName: { contains: query, mode: "insensitive" },
            },
          },
        },
        {
          profile: {
            personalDetails: {
              lastName: { contains: query, mode: "insensitive" },
            },
          },
        },
      ];
    }

    // 6. Deterministic sort order
    let orderBy: Prisma.UserOrderByWithRelationInput[];
    switch (options.sort) {
      case "oldest":
        orderBy = [{ createdAt: "asc" }, { id: "asc" }];
        break;
      case "name_asc":
        orderBy = [
          { profile: { personalDetails: { firstName: "asc" } } },
          { email: "asc" },
          { id: "asc" },
        ];
        break;
      case "name_desc":
        orderBy = [
          { profile: { personalDetails: { firstName: "desc" } } },
          { email: "desc" },
          { id: "desc" },
        ];
        break;
      case "newest":
      default:
        orderBy = [{ createdAt: "desc" }, { id: "desc" }];
        break;
    }

    // Execute count and query in parallel transaction
    const [total, users] = await prisma.$transaction([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        skip,
        take: pageSize,
        orderBy,
        select: {
          id: true,
          email: true,
          phone: true,
          role: true,
          status: true,
          activationStatus: true,
          emailVerifiedAt: true,
          phoneVerifiedAt: true,
          createdAt: true,
          updatedAt: true,
          profile: {
            select: {
              id: true,
              profileStatus: true,
              completionPercentage: true,
              profileCreatedFor: true,
              submittedAt: true,
              createdAt: true,
              personalDetails: {
                select: {
                  firstName: true,
                  lastName: true,
                  gender: true,
                  city: true,
                  state: true,
                },
              },
              photos: {
                where: { photoType: "PRIMARY" },
                select: {
                  id: true,
                  storageKey: true,
                  storageProvider: true,
                },
                take: 1,
              },
            },
          },
        },
      }),
    ]);

    const totalPages = Math.ceil(total / pageSize);

    const formattedUsers: AdminUserListItem[] = users.map((u) => {
      const personal = u.profile?.personalDetails;
      const firstName = personal?.firstName || null;
      const lastName = personal?.lastName || null;
      const displayName =
        firstName || lastName
          ? `${firstName || ""} ${lastName || ""}`.trim()
          : u.email || "Unnamed User";

      let primaryPhotoUrl: string | null = null;
      if (u.profile?.photos && u.profile.photos.length > 0) {
        const photo = u.profile.photos[0];
        primaryPhotoUrl = resolvePhotoPublicUrl(
          photo.storageKey,
          photo.id,
          photo.storageProvider
        );
      }

      let profileSummary: AdminUserProfileSummary | null = null;
      if (u.profile) {
        profileSummary = {
          profileId: u.profile.id,
          profileStatus: u.profile.profileStatus,
          completionPercentage: u.profile.completionPercentage,
          profileCreatedFor: u.profile.profileCreatedFor,
          gender: personal?.gender || null,
          city: personal?.city || null,
          state: personal?.state || null,
          firstName,
          lastName,
          submittedAt: u.profile.submittedAt,
          createdAt: u.profile.createdAt,
          primaryPhotoUrl,
        };
      }

      return {
        id: u.id,
        email: u.email,
        maskedPhone: maskPhoneNumber(u.phone),
        displayName,
        firstName,
        lastName,
        role: u.role,
        status: u.status,
        activationStatus: u.activationStatus,
        activationPending: u.activationStatus === AccountActivationStatus.PENDING_ACTIVATION,
        emailVerified: Boolean(u.emailVerifiedAt),
        emailVerifiedAt: u.emailVerifiedAt,
        phoneVerified: Boolean(u.phoneVerifiedAt),
        phoneVerifiedAt: u.phoneVerifiedAt,
        createdAt: u.createdAt,
        updatedAt: u.updatedAt,
        profile: profileSummary,
      };
    });

    return {
      users: formattedUsers,
      pagination: {
        page,
        pageSize,
        total,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    };
  }

  /**
   * Retrieves authoritative read-only details for a specific user.
   */
  async getUserDetail(userId: string): Promise<AdminUserDetail | null> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        phone: true,
        role: true,
        status: true,
        activationStatus: true,
        statusChangedAt: true,
        statusChangedByUserId: true,
        statusChangedByUser: {
          select: {
            id: true,
            email: true,
          },
        },
        emailVerifiedAt: true,
        phoneVerifiedAt: true,
        createdAt: true,
        updatedAt: true,
        profile: {
          select: {
            id: true,
            profileStatus: true,
            completionPercentage: true,
            profileCreatedFor: true,
            submittedAt: true,
            createdAt: true,
            personalDetails: {
              select: {
                firstName: true,
                lastName: true,
                gender: true,
                city: true,
                state: true,
              },
            },
            photos: {
              where: { photoType: "PRIMARY" },
              select: {
                id: true,
                storageKey: true,
                storageProvider: true,
              },
              take: 1,
            },
          },
        },
      },
    });

    if (!user) {
      return null;
    }

    const personal = user.profile?.personalDetails;
    const firstName = personal?.firstName || null;
    const lastName = personal?.lastName || null;

    let primaryPhotoUrl: string | null = null;
    if (user.profile?.photos && user.profile.photos.length > 0) {
      const photo = user.profile.photos[0];
      primaryPhotoUrl = resolvePhotoPublicUrl(
        photo.storageKey,
        photo.id,
        photo.storageProvider
      );
    }

    let profileSummary: AdminUserProfileSummary | null = null;
    if (user.profile) {
      profileSummary = {
        profileId: user.profile.id,
        profileStatus: user.profile.profileStatus,
        completionPercentage: user.profile.completionPercentage,
        profileCreatedFor: user.profile.profileCreatedFor,
        gender: personal?.gender || null,
        city: personal?.city || null,
        state: personal?.state || null,
        firstName,
        lastName,
        submittedAt: user.profile.submittedAt,
        createdAt: user.profile.createdAt,
        primaryPhotoUrl,
      };
    }

    return {
      id: user.id,
      email: user.email,
      maskedPhone: maskPhoneNumber(user.phone),
      role: user.role,
      status: user.status,
      activationStatus: user.activationStatus,
      activationPending: user.activationStatus === AccountActivationStatus.PENDING_ACTIVATION,
      statusChangedAt: user.statusChangedAt,
      statusChangedByUserId: user.statusChangedByUserId,
      statusChangedByUser: user.statusChangedByUser
        ? {
            id: user.statusChangedByUser.id,
            email: user.statusChangedByUser.email,
          }
        : null,
      emailVerified: Boolean(user.emailVerifiedAt),
      emailVerifiedAt: user.emailVerifiedAt,
      phoneVerified: Boolean(user.phoneVerifiedAt),
      phoneVerifiedAt: user.phoneVerifiedAt,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      profile: profileSummary,
    };
  }

  /**
   * Concurrency-safe status mutation for normal user accounts.
   * Atomically updates status, statusChangedAt, and statusChangedByUserId.
   */
  async updateUserStatus(
    options: UpdateUserStatusOptions
  ): Promise<UserStatusMutationResult> {
    const { userId, desiredStatus, adminUserId, expectedCurrentStatus } = options;

    if (userId === adminUserId) {
      return {
        success: false,
        status: 403,
        code: "ADMIN_SELF_STATUS_CHANGE_FORBIDDEN",
        message: "Administrators cannot alter their own account status.",
      };
    }

    const txResult = await prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          role: true,
          status: true,
        },
      });

      if (!user) {
        return {
          success: false,
          status: 404,
          code: "NOT_FOUND",
          message: "User not found.",
        };
      }

      if (user.role === UserRole.ADMIN) {
        return {
          success: false,
          status: 403,
          code: "ADMIN_ACCOUNT_PROTECTED",
          message: "Administrative accounts cannot be modified through user status controls.",
        };
      }

      // Terminal state: DELETED accounts cannot be modified or restored
      if (user.status === UserStatus.DELETED) {
        return {
          success: false,
          status: 409,
          code: "ACCOUNT_STATUS_CONFLICT",
          message: "Deleted accounts cannot be restored or modified.",
        };
      }

      // Idempotency: if already in desired status
      if (user.status === desiredStatus) {
        return {
          success: true,
          status: 200,
          code: "STATUS_UNCHANGED",
          message: `User account is already ${desiredStatus.toLowerCase()}.`,
        };
      }

      // Concurrency check: If caller specified expectedCurrentStatus and state has diverged
      if (expectedCurrentStatus && user.status !== expectedCurrentStatus) {
        return {
          success: false,
          status: 409,
          code: "ACCOUNT_STATUS_CONFLICT",
          message: `Account status was modified to ${user.status} by another session. Please refresh.`,
        };
      }

      // State machine validation:
      // ACTIVE -> SUSPENDED, BLOCKED
      // SUSPENDED -> ACTIVE (Restore), BLOCKED
      // BLOCKED -> ACTIVE (Restore)
      if (desiredStatus === UserStatus.SUSPENDED) {
        if (user.status !== UserStatus.ACTIVE) {
          return {
            success: false,
            status: 409,
            code: "ACCOUNT_STATUS_CONFLICT",
            message: `Cannot suspend an account in ${user.status} status. Only ACTIVE accounts can be suspended.`,
          };
        }
      } else if (desiredStatus === UserStatus.BLOCKED) {
        if (user.status !== UserStatus.ACTIVE && user.status !== UserStatus.SUSPENDED) {
          return {
            success: false,
            status: 409,
            code: "ACCOUNT_STATUS_CONFLICT",
            message: `Cannot block an account in ${user.status} status.`,
          };
        }
      } else if (desiredStatus === UserStatus.ACTIVE) {
        if (user.status !== UserStatus.SUSPENDED && user.status !== UserStatus.BLOCKED) {
          return {
            success: false,
            status: 409,
            code: "ACCOUNT_STATUS_CONFLICT",
            message: `Cannot restore an account in ${user.status} status.`,
          };
        }
      } else {
        return {
          success: false,
          status: 400,
          code: "INVALID_STATUS_TRANSITION",
          message: `Unsupported status transition to ${desiredStatus}.`,
        };
      }

      // Atomically update user status and audit fields
      await tx.user.update({
        where: { id: userId },
        data: {
          status: desiredStatus,
          statusChangedAt: new Date(),
          statusChangedByUserId: adminUserId,
        },
      });

      return {
        success: true,
        status: 200,
        code: "STATUS_UPDATED",
        message: `User account status updated to ${desiredStatus.toLowerCase()}.`,
      };
    });

    if (!txResult.success) {
      return txResult;
    }

    // Fetch full authoritative user detail including audit info
    const updatedUser = await this.getUserDetail(userId);
    return {
      ...txResult,
      user: updatedUser || undefined,
    };
  }

  /**
   * Admin-initiated creation of a matrimonial user account and profile.
   * Commits the DB transaction first (Guardrail 2), then dispatches activation OTP.
   * ProfilePersonalDetails remains unpopulated until candidate completes onboarding (Guardrail 1).
   */
  async createAdminUser(
    adminUserId: string,
    input: CreateAdminUserInput
  ): Promise<CreateAdminUserResult> {
    if (!input.email || !input.email.trim()) {
      return {
        success: false,
        status: 400,
        code: "INVALID_EMAIL",
        message: "Email address is required.",
      };
    }

    const normalizedEmail = input.email.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(normalizedEmail)) {
      return {
        success: false,
        status: 400,
        code: "INVALID_EMAIL",
        message: "Please provide a valid email address.",
      };
    }

    // Check if user already exists
    const existing = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (existing) {
      return {
        success: false,
        status: 409,
        code: "EMAIL_ALREADY_REGISTERED",
        message: "An account with this email address already exists.",
      };
    }

    // 1. Commit User and Profile creation first (Guardrail 1 & 2)
    const newUser = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: normalizedEmail,
          role: UserRole.USER,
          status: UserStatus.ACTIVE,
          activationStatus: AccountActivationStatus.PENDING_ACTIVATION,
          emailVerifiedAt: null,
          statusChangedAt: new Date(),
          statusChangedByUserId: adminUserId,
        },
      });

      await tx.profile.create({
        data: {
          userId: user.id,
          profileCreatedFor: input.profileCreatedFor || ProfileCreatedFor.MYSELF,
          profileStatus: ProfileStatus.INCOMPLETE,
          completionPercentage: 0,
        },
      });

      return user;
    });

    // 2. Generate OTP session and save
    const { session, plainOtp } = this.otpSvc.createSession("email", normalizedEmail);
    await this.otps.save(session);

    // 3. Dispatch activation email
    let warning: string | undefined = undefined;
    try {
      const sent = await emailService.sendAccountActivationEmail(
        normalizedEmail,
        plainOtp,
        input.firstName
      );
      if (!sent.success) {
        warning = "EMAIL_DISPATCH_FAILED";
      }
    } catch (err) {
      console.error("[ADMIN USERS] Failed to dispatch activation email:", err);
      warning = "EMAIL_DISPATCH_FAILED";
    }

    // 4. Fetch authoritative user detail
    const userDetail = await this.getUserDetail(newUser.id);

    return {
      success: true,
      status: 201,
      code: "USER_CREATED",
      message: warning
        ? "User account created, but activation email delivery failed. You can resend it from the user details."
        : "User account created successfully and activation email sent.",
      warning,
      user: userDetail || undefined,
      ...(config.devDummyOtpEnabled ? { debugOtp: plainOtp } : {}),
    };
  }

  /**
   * Resend activation email for a user in PENDING_ACTIVATION status.
   * Enforces cooldown, invalidates prior active OTPs, and dispatches a fresh code.
   */
  async resendActivationEmail(
    adminUserId: string,
    targetUserId: string
  ): Promise<ResendActivationResult> {
    const user = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: {
        id: true,
        email: true,
        role: true,
        status: true,
        activationStatus: true,
        emailVerifiedAt: true,
        profile: {
          select: {
            personalDetails: { select: { firstName: true } },
          },
        },
      },
    });

    if (!user || !user.email) {
      return {
        success: false,
        status: 404,
        code: "NOT_FOUND",
        message: "User not found or has no email address.",
      };
    }

    if (user.role === UserRole.ADMIN) {
      return {
        success: false,
        status: 403,
        code: "ADMIN_ACCOUNT_PROTECTED",
        message: "Administrative accounts cannot be managed through user activation.",
      };
    }

    if (user.status === UserStatus.DELETED) {
      return {
        success: false,
        status: 409,
        code: "ACCOUNT_DELETED",
        message: "Cannot resend activation to a deleted account.",
      };
    }

    if (user.status === UserStatus.SUSPENDED) {
      return {
        success: false,
        status: 409,
        code: "ACCOUNT_SUSPENDED",
        message: "Cannot resend activation to a suspended account.",
      };
    }

    if (user.status === UserStatus.BLOCKED) {
      return {
        success: false,
        status: 409,
        code: "ACCOUNT_BLOCKED",
        message: "Cannot resend activation to a blocked account.",
      };
    }

    if (user.activationStatus === AccountActivationStatus.ACTIVE && user.emailVerifiedAt) {
      return {
        success: false,
        status: 409,
        code: "ALREADY_ACTIVATED",
        message: "This account has already completed ownership verification.",
      };
    }

    const normalizedEmail = user.email.trim().toLowerCase();

    // Cooldown check on latest active OTP for this email
    const latestOtp = await prisma.verificationOtp.findFirst({
      where: {
        email: normalizedEmail,
        consumedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });

    const now = new Date();
    if (latestOtp && now < latestOtp.resendAvailableAt) {
      const waitSeconds = Math.ceil(
        (latestOtp.resendAvailableAt.getTime() - now.getTime()) / 1000
      );
      return {
        success: false,
        status: 429,
        code: "OTP_COOLDOWN",
        message: `Please wait ${waitSeconds} seconds before resending activation email.`,
      };
    }

    // Create new session & plain OTP
    const { session, plainOtp } = this.otpSvc.createSession("email", normalizedEmail);

    // Dispatch email FIRST — only mutate database after confirmed provider delivery/dispatch
    const firstName = user.profile?.personalDetails?.firstName || undefined;
    const sent = await emailService.sendAccountActivationEmail(normalizedEmail, plainOtp, firstName);
    if (!sent.success) {
      console.error("[ADMIN USERS] Failed to dispatch activation email:", sent.error);
      return {
        success: false,
        status: 502,
        code: "EMAIL_SEND_FAILED",
        message: sent.error || "Failed to deliver activation email. Please try again later.",
      };
    }

    // Atomically invalidate prior active OTP sessions and save new session
    await prisma.$transaction(async (tx) => {
      await tx.verificationOtp.updateMany({
        where: { email: normalizedEmail, consumedAt: null },
        data: { consumedAt: now },
      });

      await tx.verificationOtp.upsert({
        where: { id: session.verificationId },
        create: {
          id: session.verificationId,
          email: normalizedEmail,
          hashedOtp: session.hashedOtp,
          salt: session.salt,
          attempts: session.attempts,
          maxAttempts: session.maxAttempts,
          expiresAt: session.expiresAt,
          resendAvailableAt: session.resendAvailableAt,
          createdAt: session.createdAt,
        },
        update: {
          email: normalizedEmail,
          hashedOtp: session.hashedOtp,
          salt: session.salt,
          attempts: session.attempts,
          maxAttempts: session.maxAttempts,
          expiresAt: session.expiresAt,
          resendAvailableAt: session.resendAvailableAt,
          consumedAt: null,
        },
      });
    });

    // Safe structured diagnostic logging (ZERO plaintext OTP, ZERO secrets)
    console.log("[ADMIN ACTIVATION OTP RESENT]", {
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
      emailSendResult: "SUCCESS",
      providerMessageId: sent.messageId || null,
    });

    return {
      success: true,
      status: 200,
      code: "ACTIVATION_RESENT",
      message: "Activation email resent successfully.",
      ...(config.devDummyOtpEnabled ? { debugOtp: plainOtp } : {}),
    };
  }

  /**
   * Admin-side verification of a user's activation OTP.
   * Atomically transitions user account from PENDING_ACTIVATION to ACTIVE upon providing
   * the valid, unexpired, unconsumed 6-digit OTP code received by the user.
   */
  async verifyAdminActivationOtp(
    adminUserId: string,
    userId: string,
    otp: string
  ): Promise<AdminVerifyActivationResult> {
    if (!adminUserId) {
      return {
        success: false,
        status: 401,
        code: "UNAUTHORIZED",
        message: "Administrative authentication required.",
      };
    }

    if (!userId || !userId.trim()) {
      return {
        success: false,
        status: 400,
        code: "INVALID_USER_ID",
        message: "User ID parameter is required.",
      };
    }

    if (!otp || typeof otp !== "string" || !/^\d{6}$/.test(otp.trim())) {
      return {
        success: false,
        status: 400,
        code: "VALIDATION_ERROR",
        message: "A valid 6-digit numeric verification code is required.",
      };
    }

    // 1. Check if user exists
    const user = await prisma.user.findUnique({
      where: { id: userId.trim() },
      select: {
        id: true,
        email: true,
        role: true,
        status: true,
        activationStatus: true,
        emailVerifiedAt: true,
      },
    });

    if (!user) {
      return {
        success: false,
        status: 404,
        code: "USER_NOT_FOUND",
        message: "User account not found.",
      };
    }

    // 2. Reject ADMIN role activation through this endpoint
    if (user.role === UserRole.ADMIN) {
      return {
        success: false,
        status: 403,
        code: "FORBIDDEN",
        message: "Administrative accounts cannot be managed through user activation.",
      };
    }

    // 3. Delegate to core activation verification
    const core = await authService.verifyActivationOtpCore({
      userId: user.id,
      email: user.email || undefined,
      otp: otp.trim(),
      adminUserId,
    });

    if (!core.success || !core.user) {
      return {
        success: false,
        status: core.status,
        code: core.code,
        message: core.message,
      };
    }

    return {
      success: true,
      status: 200,
      message: "User account verified and activated successfully.",
      data: {
        userId: core.user.id,
        status: core.user.status,
        activationStatus: core.user.activationStatus,
        emailVerified: Boolean(core.user.emailVerifiedAt),
        activatedAt: core.user.activatedAt,
        activatedByUserId: core.user.activatedByUserId,
      },
    };
  }

  /**
   * Permanently deletes a user account and all user-owned records.
   * Irreversible hard delete.
   */
  async permanentlyDeleteUser(
    adminUserId: string,
    targetUserId: string,
    confirmation: string
  ): Promise<{
    status: number;
    success: boolean;
    code?: string;
    message: string;
    data?: {
      userId: string;
      deleted: boolean;
      storageCleanupPartial?: boolean;
    };
  }> {
    // 1. Strict confirmation validation
    if (!confirmation || confirmation !== "DELETE") {
      return {
        status: 400,
        success: false,
        code: "VALIDATION_ERROR",
        message: "Explicit confirmation 'DELETE' is required to permanently delete an account.",
      };
    }

    // 2. Prevent self-deletion
    if (adminUserId === targetUserId) {
      return {
        status: 403,
        success: false,
        code: "CANNOT_DELETE_ADMIN",
        message: "Administrator accounts cannot be deleted.",
      };
    }

    // 3. Locate target user
    const targetUser = await prisma.user.findUnique({
      where: { id: targetUserId },
      include: {
        profile: {
          include: {
            photos: true,
          },
        },
      },
    });

    if (!targetUser) {
      return {
        status: 404,
        success: false,
        code: "USER_NOT_FOUND",
        message: "That user account no longer exists.",
      };
    }

    // 4. Reject deletion of ADMIN accounts
    if (targetUser.role === UserRole.ADMIN) {
      return {
        status: 403,
        success: false,
        code: "CANNOT_DELETE_ADMIN",
        message: "Administrator accounts cannot be deleted.",
      };
    }

    // 5. Pre-collect storage keys and providers for photos belonging to this user
    const photosToDelete: { storageKey: string; storageProvider: string }[] = [];
    if (targetUser.profile?.photos) {
      for (const photo of targetUser.profile.photos) {
        if (photo.storageKey) {
          photosToDelete.push({
            storageKey: photo.storageKey,
            storageProvider: photo.storageProvider,
          });
        }
      }
    }

    // 6. Execute PostgreSQL atomic transaction for complete database cleanup
    try {
      await prisma.$transaction(async (tx) => {
        // A. Safely clear nullable foreign-key references from other records
        await tx.user.updateMany({
          where: { statusChangedByUserId: targetUserId },
          data: { statusChangedByUserId: null },
        });

        await tx.user.updateMany({
          where: { activatedByUserId: targetUserId },
          data: { activatedByUserId: null },
        });

        await tx.profile.updateMany({
          where: { lastEditedByUserId: targetUserId },
          data: { lastEditedByUserId: null },
        });

        await tx.profilePhoto.updateMany({
          where: { moderatedByUserId: targetUserId },
          data: { moderatedByUserId: null },
        });

        // B. Clean up unlinked VerificationOtp records belonging to target user's verified unique email
        if (targetUser.email) {
          await tx.verificationOtp.deleteMany({
            where: { email: targetUser.email },
          });
        }

        // C. Delete the target User record.
        // Prisma schema cascade foreign keys cleanly purge:
        // - Profile (and ProfilePersonalDetails, ProfileReligion, ProfileEducation,
        //   ProfileCareer, ProfileLanguage, ProfilePhoto, PartnerPreference + all 9 junction tables,
        //   received ProfileFavourites)
        // - Sent & received MessageRequests
        // - Conversations (and ConversationParticipants, Messages)
        // - Notifications
        // - Sent ProfileFavourites
        await tx.user.delete({
          where: { id: targetUserId },
        });
      });
    } catch (dbError) {
      console.error(`[PERMANENT DELETE TRANSACTION ERROR for ${targetUserId}]:`, dbError);
      return {
        status: 500,
        success: false,
        code: "DELETE_FAILED",
        message: "We couldn't permanently delete this account. No partial account deletion was completed.",
      };
    }

    // 7. Post-Commit Physical Storage Cleanup
    let storageCleanupPartial = false;
    for (const photo of photosToDelete) {
      try {
        const provider = getStorageProvider(photo.storageProvider);
        const deleted = await provider.delete(photo.storageKey);
        if (!deleted) {
          console.warn(`[PERMANENT DELETE] Storage provider returned false for key ${photo.storageKey} (${photo.storageProvider})`);
          storageCleanupPartial = true;
        }
      } catch (storageErr) {
        console.error(`[PERMANENT DELETE] Storage deletion error for key ${photo.storageKey} (${photo.storageProvider}):`, storageErr);
        storageCleanupPartial = true;
      }
    }

    if (storageCleanupPartial) {
      return {
        status: 200,
        success: true,
        code: "STORAGE_CLEANUP_PARTIAL",
        message: "User account permanently deleted. Some stored media is pending cleanup.",
        data: {
          userId: targetUserId,
          deleted: true,
          storageCleanupPartial: true,
        },
      };
    }

    return {
      status: 200,
      success: true,
      message: "User account permanently deleted.",
      data: {
        userId: targetUserId,
        deleted: true,
      },
    };
  }

  /**
   * Admin-side matrimonial profile activation and publication.
   * Enables an administrator to publish a 100% complete matrimonial profile on behalf of a user.
   * Transitions profileStatus: INCOMPLETE -> ACTIVE.
   * Does NOT touch account ownership (activationStatus) or emailVerifiedAt.
   */
  async activateUserProfile(
    adminUserId: string,
    targetUserId: string
  ): Promise<AdminActivateProfileResult> {
    if (!adminUserId) {
      return {
        success: false,
        status: 401,
        code: "UNAUTHORIZED",
        message: "Administrative authentication required.",
      };
    }

    if (!targetUserId || !targetUserId.trim()) {
      return {
        success: false,
        status: 400,
        code: "VALIDATION_ERROR",
        message: "Target user ID is required.",
      };
    }

    // 1. Fetch target user and current profile state
    const user = await prisma.user.findUnique({
      where: { id: targetUserId },
      include: {
        profile: true,
      },
    });

    if (!user) {
      return {
        success: false,
        status: 404,
        code: "NOT_FOUND",
        message: "User account not found.",
      };
    }

    if (user.role === UserRole.ADMIN) {
      return {
        success: false,
        status: 403,
        code: "ADMIN_ACCOUNT_PROTECTED",
        message: "Administrative accounts do not have matrimonial profiles.",
      };
    }

    if (user.status === UserStatus.DELETED) {
      return {
        success: false,
        status: 409,
        code: "ACCOUNT_DELETED",
        message: "Cannot activate or publish a profile for a deleted account.",
      };
    }

    if (user.status === UserStatus.SUSPENDED) {
      return {
        success: false,
        status: 409,
        code: "ACCOUNT_SUSPENDED",
        message: "Cannot activate or publish a profile for a suspended account.",
      };
    }

    if (user.status === UserStatus.BLOCKED) {
      return {
        success: false,
        status: 409,
        code: "ACCOUNT_BLOCKED",
        message: "Cannot activate or publish a profile for a blocked account.",
      };
    }

    if (!user.profile) {
      return {
        success: false,
        status: 404,
        code: "PROFILE_NOT_FOUND",
        message: "No matrimonial profile found for this user account.",
      };
    }

    // 2. Check if already ACTIVE (Idempotent success)
    if (user.profile.profileStatus === ProfileStatus.ACTIVE) {
      return {
        success: true,
        status: 200,
        code: "PROFILE_ALREADY_ACTIVE",
        message: "Matrimonial profile is already active and published.",
        data: {
          profileId: user.profile.id,
          userId: user.id,
          profileStatus: user.profile.profileStatus,
          completionPercentage: user.profile.completionPercentage,
          submittedAt: user.profile.submittedAt,
          lastEditedAt: user.profile.lastEditedAt,
          lastEditedByUserId: user.profile.lastEditedByUserId,
        },
      };
    }

    // 3. Fetch authoritative profile state with all relations
    const profileState = await profileRepository.getProfileSubmissionState(user.id);
    if (!profileState) {
      return {
        success: false,
        status: 404,
        code: "PROFILE_NOT_FOUND",
        message: "No matrimonial profile found for this user account.",
      };
    }

    // 4. Validate database completeness and photo presence authoritatively
    const completionPercentage = calculateProfileCompletion({
      profileCreatedFor: profileState.profileCreatedFor,
      personalDetails: profileState.personalDetails,
      languages: profileState.languages,
      religion: profileState.religion,
      education: profileState.education,
      career: profileState.career,
      photos: profileState.photos,
      partnerPreference: profileState.partnerPreference,
    });

    const completeness = validateProfileCompleteness(profileState);

    if (!completeness.isComplete || completionPercentage < 100) {
      return {
        success: false,
        status: 400,
        code: "PROFILE_INCOMPLETE",
        message: "Profile must be 100% complete before publishing. Please ensure all mandatory sections and at least one photo are added.",
        error: {
          code: "PROFILE_INCOMPLETE",
          missingSections: completeness.missingSections,
          completionPercentage,
        },
      };
    }

    // 5. Atomic state transition: INCOMPLETE -> ACTIVE
    const now = new Date();
    const updatedProfile = await prisma.profile.update({
      where: { id: user.profile.id },
      data: {
        profileStatus: ProfileStatus.ACTIVE,
        completionPercentage: 100,
        submittedAt: user.profile.submittedAt || now,
        lastEditedAt: now,
        lastEditedByUserId: adminUserId,
      },
    });

    // 6. Structured audit log (zero secrets, audit compliant)
    console.log("[ADMIN PROFILE ACTIVATED & PUBLISHED]", {
      adminUserId,
      targetUserId: user.id,
      profileId: updatedProfile.id,
      previousStatus: user.profile.profileStatus,
      newStatus: ProfileStatus.ACTIVE,
      completionPercentage: updatedProfile.completionPercentage,
      submittedAt: updatedProfile.submittedAt,
    });

    return {
      success: true,
      status: 200,
      code: "PROFILE_ACTIVATED",
      message: "Matrimonial profile has been published and activated successfully. It is now discoverable in Matches.",
      data: {
        profileId: updatedProfile.id,
        userId: user.id,
        profileStatus: updatedProfile.profileStatus,
        completionPercentage: updatedProfile.completionPercentage,
        submittedAt: updatedProfile.submittedAt,
        lastEditedAt: updatedProfile.lastEditedAt,
        lastEditedByUserId: updatedProfile.lastEditedByUserId,
      },
    };
  }
}

export interface AdminActivateProfileResult {
  success: boolean;
  status: number;
  code: string;
  message: string;
  data?: {
    profileId: string;
    userId: string;
    profileStatus: ProfileStatus;
    completionPercentage: number;
    submittedAt: Date | null;
    lastEditedAt?: Date | null;
    lastEditedByUserId?: string | null;
  };
  error?: {
    code: string;
    missingSections?: string[];
    completionPercentage?: number;
  };
}

export const adminUsersService = new AdminUsersService();

