import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { config } from "../config/env";
import { prisma } from "../config/database";

export interface AuthenticatedUserPayload {
  userId: string;
  phone?: string;
  email?: string;
  status: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUserPayload;
    }
  }
}

export async function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({
      success: false,
      code: "UNAUTHORIZED",
      message: "Authentication required. Please provide a valid session token.",
    });
    return;
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, config.jwtSecret) as AuthenticatedUserPayload;

    if (!decoded || !decoded.userId) {
      res.status(401).json({
        success: false,
        code: "INVALID_TOKEN",
        message: "Invalid session token. Please log in again.",
      });
      return;
    }

    if ((decoded as any).role === "ADMIN") {
      res.status(403).json({
        success: false,
        code: "FORBIDDEN",
        message: "Administrative accounts cannot access regular matrimonial candidate endpoints.",
      });
      return;
    }

    // Authoritative database check for account status & role
    const dbUser = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { id: true, role: true, status: true, activationStatus: true },
    });

    if (!dbUser) {
      res.status(401).json({
        success: false,
        code: "UNAUTHORIZED",
        message: "User account not found.",
      });
      return;
    }

    if (dbUser.role === "ADMIN") {
      res.status(403).json({
        success: false,
        code: "FORBIDDEN",
        message: "Administrative accounts cannot access regular matrimonial candidate endpoints.",
      });
      return;
    }

    if (dbUser.activationStatus === "PENDING_ACTIVATION") {
      res.status(403).json({
        success: false,
        code: "ACCOUNT_PENDING_ACTIVATION",
        message:
          "Your account is pending email ownership verification. Please verify your email before accessing platform features.",
      });
      return;
    }

    if (dbUser.status === "SUSPENDED") {
      res.status(403).json({
        success: false,
        code: "ACCOUNT_SUSPENDED",
        message: "Your account is currently suspended. Please contact support.",
      });
      return;
    }

    if (dbUser.status === "BLOCKED") {
      res.status(403).json({
        success: false,
        code: "ACCOUNT_BLOCKED",
        message: "Your account has been blocked. Please contact support.",
      });
      return;
    }

    if (dbUser.status === "DELETED") {
      res.status(403).json({
        success: false,
        code: "ACCOUNT_DELETED",
        message: "This account is no longer available.",
      });
      return;
    }

    req.user = decoded;
    next();
  } catch (error: any) {
    if (error.name === "TokenExpiredError") {
      res.status(401).json({
        success: false,
        code: "TOKEN_EXPIRED",
        message: "Session token has expired. Please log in again.",
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
