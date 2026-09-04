export type AuthMethod = "phone" | "email";

export type UserStatus = "ACTIVE" | "PENDING_ONBOARDING" | "SUSPENDED" | "BLOCKED" | "DELETED";

export interface User {
  id: string;
  phone?: string;
  email?: string;
  phoneVerified: boolean;
  emailVerified: boolean;
  status: UserStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface OtpSession {
  verificationId: string;
  method: AuthMethod;
  normalizedIdentifier: string;
  maskedIdentifier: string;
  hashedOtp: string;
  salt: string;
  attempts: number;
  maxAttempts: number;
  expiresAt: Date;
  resendAvailableAt: Date;
  createdAt: Date;
}

export interface RequestOtpDto {
  method: AuthMethod;
  identifier: string;
}

export interface VerifyOtpDto {
  verificationId: string;
  otp: string;
}

export interface ResendOtpDto {
  verificationId: string;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  message: string;
  code?: string;
  data?: T;
  error?: {
    code: string;
    missingSections?: string[];
    details?: unknown;
  };
}

export interface AuthSessionResponse {
  user: {
    id: string;
    phone?: string;
    email?: string;
    status: UserStatus;
  };
  token: string;
  redirectTo: string;
}

export interface RequestOtpResponse {
  verificationId: string;
  method: AuthMethod;
  maskedIdentifier: string;
  resendCooldownSeconds: number;
  expiresInSeconds: number;
}
