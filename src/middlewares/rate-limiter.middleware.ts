import { Request, Response, NextFunction } from "express";

interface RateLimitRecord {
  count: number;
  resetAt: number;
}

class MemoryRateLimiter {
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
}

const rateLimiter = new MemoryRateLimiter();

export function otpRequestRateLimiter(
  req: Request,
  res: Response,
  next: NextFunction
): void {
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
