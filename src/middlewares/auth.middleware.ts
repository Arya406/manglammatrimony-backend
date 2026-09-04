import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { config } from "../config/env";

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

export function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
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
