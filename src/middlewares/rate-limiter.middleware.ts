import { Request, Response, NextFunction } from "express";
import { config } from "../config/env";

interface RateLimitRecord {
  count: number;
  resetAt: number;
}

export class MemoryRateLimiter {
  private ipRecords = new Map<string, RateLimitRecord>();

  checkLimit(
    key: string,
    maxRequests: number,
    windowMs: number
  ): { allowed: boolean; retryAfterSeconds: number } {
    const now = Date.now();
    const record = this.ipRecords.get(key);

    if (!record || now > record.resetAt) {
      this.ipRecords.set(key, { count: 1, resetAt: now + windowMs });
      return { allowed: true, retryAfterSeconds: 0 };
    }

    if (record.count >= maxRequests) {
      const retryAfterSeconds = Math.ceil((record.resetAt - now) / 1000);
      return { allowed: false, retryAfterSeconds };
    }

    record.count += 1;
    return { allowed: true, retryAfterSeconds: 0 };
  }

  reset(): void {
    this.ipRecords.clear();
  }
}

const rateLimiter = new MemoryRateLimiter();
const apiLimiter = new MemoryRateLimiter();

export { apiLimiter };

export function otpRequestRateLimiter(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // In development mode, bypass rate limiting for frictionless testing
  if (config.nodeEnv !== "production") {
    return next();
  }
  const clientIp = req.ip || req.socket.remoteAddress || "unknown_ip";
  const identifier = req.body?.identifier || "";
  const key = `${clientIp}:${identifier}`;

  // Allow max 5 requests per 10 minutes per identifier/IP
  const { allowed, retryAfterSeconds } = rateLimiter.checkLimit(
    key,
    5,
    10 * 60 * 1000
  );

  if (!allowed) {
    res.status(429).json({
      success: false,
      code: "RATE_LIMIT_EXCEEDED",
      message: `Too many requests. Please wait ${retryAfterSeconds} seconds before trying again.`,
    });
    return;
  }

  next();
}

/**
 * General API Abuse Protection Middleware.
 * 
 * In-memory, per-instance first layer rate limiter for general API endpoints.
 * - Skips health checks (/health, /api/health)
 * - Safe ceiling for normal authenticated browsing: 300 requests per minute
 * - Returns structured 429 response consistent with platform standards
 * - Includes Retry-After header
 */
export function apiRateLimiter(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Always allow health checks without rate limiting
  if (req.path === "/health" || req.path === "/api/health") {
    return next();
  }

  // In non-production, allow high ceiling for automated integration tests
  const maxRequests = config.nodeEnv === "production" ? 300 : 2000;
  const windowMs = 60 * 1000; // 1 minute window

  const clientIp =
    req.ip ||
    (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
    req.socket.remoteAddress ||
    "unknown_ip";

  const key = `api:${clientIp}`;
  const { allowed, retryAfterSeconds } = apiLimiter.checkLimit(
    key,
    maxRequests,
    windowMs
  );

  if (!allowed) {
    res.setHeader("Retry-After", String(retryAfterSeconds));
    res.status(429).json({
      success: false,
      code: "RATE_LIMIT_EXCEEDED",
      message: "Too many requests. Please slow down and try again later.",
    });
    return;
  }

  next();
}
