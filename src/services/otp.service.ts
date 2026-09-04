import crypto from "crypto";
import { AuthMethod, OtpSession } from "../types/auth";
import { config } from "../config/env";
import { IOtpProvider } from "../providers/otp/OtpProvider.interface";
import { DevOtpProvider } from "../providers/otp/DevOtpProvider";
import { emailService } from "./email.service";

export class OtpService {
  private provider: IOtpProvider;

  constructor(provider?: IOtpProvider) {
    this.provider = provider || new DevOtpProvider();
  }

  setProvider(provider: IOtpProvider): void {
    this.provider = provider;
  }

  generateOtp(): string {
    // Generate secure 6-digit numeric string
    return crypto.randomInt(100000, 1000000).toString();
  }

  hashOtp(otp: string, salt: string): string {
    return crypto
      .createHmac("sha256", salt)
      .update(otp)
      .digest("hex");
  }

  verifyOtpMatch(enteredOtp: string, hashedOtp: string, salt: string): boolean {
    const computedHash = this.hashOtp(enteredOtp, salt);
    return crypto.timingSafeEqual(
      Buffer.from(computedHash, "hex"),
      Buffer.from(hashedOtp, "hex")
    );
  }

  maskIdentifier(identifier: string, method: AuthMethod): string {
    if (method === "phone") {
      // Input e.g. +919876543210
      // Mask middle digits: +91 ******3210
      const digitsOnly = identifier.replace(/\D/g, "");
      if (digitsOnly.length >= 10) {
        const country = identifier.startsWith("+") ? identifier.slice(0, 3) : "+91";
        const last4 = digitsOnly.slice(-4);
        return `${country} ******${last4}`;
      }
      return identifier.slice(0, 3) + "******" + identifier.slice(-2);
    } else {
      // Email e.g. user.test@example.com
      const [localPart, domain] = identifier.split("@");
      if (!domain) return identifier;
      const visibleStart = localPart.slice(0, Math.min(2, localPart.length));
      return `${visibleStart}***@${domain}`;
    }
  }

  createSession(method: AuthMethod, normalizedIdentifier: string): { session: OtpSession; plainOtp: string } {
    const verificationId = "vref_" + crypto.randomBytes(12).toString("hex");
    const plainOtp = this.generateOtp();
    const salt = crypto.randomBytes(16).toString("hex");
    const hashedOtp = this.hashOtp(plainOtp, salt);
    const maskedIdentifier = this.maskIdentifier(normalizedIdentifier, method);

    const now = new Date();
    const expiresAt = new Date(now.getTime() + config.otp.expirySeconds * 1000);
    const resendAvailableAt = new Date(now.getTime() + config.otp.resendCooldownSeconds * 1000);

    const session: OtpSession = {
      verificationId,
      method,
      normalizedIdentifier,
      maskedIdentifier,
      hashedOtp,
      salt,
      attempts: 0,
      maxAttempts: config.otp.maxAttempts,
      expiresAt,
      resendAvailableAt,
      createdAt: now,
    };

    return { session, plainOtp };
  }

  async sendOtp(
    recipient: string,
    otp: string,
    method: AuthMethod,
    isLogin: boolean = false
  ): Promise<boolean> {
    if (method === "email") {
      const res = isLogin
        ? await emailService.sendLoginVerificationEmail(recipient, otp)
        : await emailService.sendVerificationEmail(recipient, otp);
      return res.success;
    }
    return this.provider.sendOtp(recipient, otp, method);
  }
}

export const otpService = new OtpService();
