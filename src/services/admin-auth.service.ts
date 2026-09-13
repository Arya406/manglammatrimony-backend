import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { prisma } from "../config/database";
import { config } from "../config/env";
import { UserRole, UserStatus } from "@prisma/client";

export interface AdminLoginResult {
  success: boolean;
  code?: string;
  message: string;
  data?: {
    token: string;
    admin: {
      id: string;
      email: string | null;
      role: UserRole;
    };
  };
}

export class AdminAuthService {
  /**
   * Authenticates administrative user with email & password.
   * Generic 401 response on any failure to prevent account enumeration.
   */
  async loginAdmin(email: string, password: string): Promise<AdminLoginResult> {
    const normalizedEmail = (email || "").trim().toLowerCase();

    if (!normalizedEmail || !password) {
      return {
        success: false,
        code: "INVALID_CREDENTIALS",
        message: "Invalid email or password.",
      };
    }

    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: {
        id: true,
        email: true,
        passwordHash: true,
        role: true,
        status: true,
      },
    });

    // Check account existence, role, status, and passwordHash
    if (
      !user ||
      !user.passwordHash ||
      user.role !== UserRole.ADMIN ||
      user.status !== UserStatus.ACTIVE
    ) {
      // Dummy compare to mitigate timing attacks
      await bcrypt.compare("dummy_password_timing_check", "$2a$10$abcdefghijklmnopqrstuvwx");
      return {
        success: false,
        code: "INVALID_CREDENTIALS",
        message: "Invalid email or password.",
      };
    }

    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);

    if (!isPasswordValid) {
      return {
        success: false,
        code: "INVALID_CREDENTIALS",
        message: "Invalid email or password.",
      };
    }

    // Sign admin JWT
    const token = jwt.sign(
      {
        userId: user.id,
        email: user.email,
        role: user.role,
        status: user.status,
      },
      config.jwtSecret,
      { expiresIn: config.jwtExpiry as jwt.SignOptions["expiresIn"] }
    );

    return {
      success: true,
      message: "Admin login successful.",
      data: {
        token,
        admin: {
          id: user.id,
          email: user.email,
          role: user.role,
        },
      },
    };
  }
}

export const adminAuthService = new AdminAuthService();
