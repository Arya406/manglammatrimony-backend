import { prisma } from "../config/database";
import { OtpSession } from "../types/auth";

export class OtpRepository {
  constructor() {
    // Run cleanup for expired sessions periodically every 2 minutes
    setInterval(() => {
      this.cleanExpired().catch((err) => {
        console.error("[OTP REPOSITORY] Periodic cleanup error:", err);
      });
    }, 120000);
  }

  /**
   * Persists an OTP session to PostgreSQL.
   */
  async save(session: OtpSession): Promise<void> {
    const normalizedEmail = session.normalizedIdentifier.trim().toLowerCase();

    await prisma.verificationOtp.upsert({
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
  }

  /**
   * Finds an active verification session by ID.
   * Returns null if not found, expired, or already consumed.
   */
  async findById(verificationId: string): Promise<OtpSession | null> {
    const record = await prisma.verificationOtp.findUnique({
      where: { id: verificationId },
    });

    if (!record) return null;

    // Immediately reject and clean up if already consumed or expired
    const now = new Date();
    if (record.consumedAt || now > record.expiresAt) {
      // Mark or clean up in background
      await this.delete(verificationId);
      return null;
    }

    const email = record.email.trim().toLowerCase();
    const atIndex = email.indexOf("@");
    const masked =
      atIndex > 2
        ? `${email.slice(0, 2)}***@${email.slice(atIndex + 1)}`
        : email;

    return {
      verificationId: record.id,
      method: "email",
      normalizedIdentifier: email,
      maskedIdentifier: masked,
      hashedOtp: record.hashedOtp,
      salt: record.salt,
      attempts: record.attempts,
      maxAttempts: record.maxAttempts,
      expiresAt: record.expiresAt,
      resendAvailableAt: record.resendAvailableAt,
      createdAt: record.createdAt,
    };
  }

  /**
   * Updates attempts, expiration, or refreshed OTP hash for a session.
   */
  async update(session: OtpSession): Promise<void> {
    await prisma.verificationOtp.update({
      where: { id: session.verificationId },
      data: {
        attempts: session.attempts,
        hashedOtp: session.hashedOtp,
        salt: session.salt,
        expiresAt: session.expiresAt,
        resendAvailableAt: session.resendAvailableAt,
      },
    });
  }

  /**
   * Invalidates and deletes an OTP session immediately.
   */
  async delete(verificationId: string): Promise<void> {
    try {
      await prisma.verificationOtp.delete({
        where: { id: verificationId },
      });
    } catch {
      // Record might have already been removed or does not exist
    }
  }

  /**
   * Marks session as consumed so it can never be verified again.
   */
  async markConsumed(verificationId: string): Promise<void> {
    try {
      await prisma.verificationOtp.update({
        where: { id: verificationId },
        data: { consumedAt: new Date() },
      });
    } catch {
      // Record might have already been removed
    }
  }

  /**
   * Cleans up expired and consumed OTP records from PostgreSQL.
   */
  async cleanExpired(): Promise<number> {
    try {
      const result = await prisma.verificationOtp.deleteMany({
        where: {
          OR: [
            { expiresAt: { lt: new Date() } },
            { consumedAt: { not: null } },
          ],
        },
      });
      return result.count;
    } catch (err) {
      console.error("[OTP REPOSITORY] Error cleaning expired records:", err);
      return 0;
    }
  }
}

export const otpRepository = new OtpRepository();
