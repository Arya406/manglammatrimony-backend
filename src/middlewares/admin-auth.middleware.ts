import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { config } from "../config/env";
import { prisma } from "../config/database";
import { UserRole, UserStatus } from "@prisma/client";

export interface AuthenticatedAdminPayload {
  id: string;
  email: string;
  role: UserRole;
  status: UserStatus;
}

declare global {
  namespace Express {
    interface Request {
      admin?: AuthenticatedAdminPayload;
    }
  }
}

/**
 * Authoritative admin authorization middleware.
 * Authenticates the JWT AND verifies user role directly against the database.
 * Non-admin (USER) accounts receive 403 FORBIDDEN.
 */
export async function adminAuthMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({
      success: false,
      code: "UNAUTHORIZED",
      message: "Authentication required. Please provide a valid admin session token.",
    });
    return;
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, config.jwtSecret) as {
      userId?: string;
      email?: string;
      role?: string;
    };

    if (!decoded || !decoded.userId) {
      res.status(401).json({
        success: false,
        code: "INVALID_TOKEN",
        message: "Invalid session token. Please log in again.",
      });
      return;
    }

    // Retrieve user authoritative state from the database.
    // Do NOT rely on JWT claim alone for admin authorization.
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true,
        email: true,
        role: true,
        status: true,
      },
    });

    if (!user) {
      res.status(401).json({
        success: false,
        code: "UNAUTHORIZED",
        message: "User account not found.",
      });
      return;
    }

    if (user.status !== UserStatus.ACTIVE) {
      res.status(401).json({
        success: false,
        code: "ACCOUNT_INACTIVE",
        message: "Account is not active.",
      });
      return;
    }

    // Role check: Normal users attempting admin APIs receive 403 FORBIDDEN
    if (user.role !== UserRole.ADMIN) {
      res.status(403).json({
        success: false,
        code: "FORBIDDEN",
        message: "Access forbidden. Administrator privileges required.",
      });
      return;
    }

    req.admin = {
      id: user.id,
      email: user.email || "",
      role: user.role,
      status: user.status,
    };

    next();
  } catch (error: any) {
    if (error.name === "TokenExpiredError") {
      res.status(401).json({
        success: false,
        code: "TOKEN_EXPIRED",
        message: "Admin session token has expired. Please log in again.",
      });
      return;
    }

    res.status(401).json({
      success: false,
      code: "UNAUTHORIZED",
      message: "Authentication failed. Invalid session token.",
    });
  }
}
