import { Request, Response, NextFunction } from "express";
import crypto from "crypto";

declare global {
  namespace Express {
    interface Request {
      id: string;
    }
  }
}

const REQUEST_ID_HEADER = "x-request-id";
const SAFE_ID_REGEX = /^[a-zA-Z0-9_-]{1,64}$/;

/**
 * Lightweight Request Correlation ID Middleware.
 * 
 * - Accepts incoming X-Request-ID if safe and bounded (alphanumeric, -, _, max 64 chars)
 * - Generates secure RFC 4122 v4 UUID if missing or invalid
 * - Attaches request ID to response header X-Request-ID
 * - Exposes req.id for downstream error logging and tracing
 */
export function requestIdMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const incomingId = req.headers[REQUEST_ID_HEADER];
  let requestId: string;

  if (
    typeof incomingId === "string" &&
    SAFE_ID_REGEX.test(incomingId.trim())
  ) {
    requestId = incomingId.trim();
  } else {
    requestId = crypto.randomUUID();
  }

  req.id = requestId;
  res.setHeader("X-Request-ID", requestId);

  next();
}
