import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import { config } from "./config/env";
import { prisma } from "./config/database";
import { requestIdMiddleware } from "./middlewares/request-id.middleware";
import { apiRateLimiter } from "./middlewares/rate-limiter.middleware";
import { authRouter } from "./routes/auth.routes";
import { profileRouter } from "./routes/profile.routes";
import { messageRequestRouter } from "./routes/message-request.routes";
import { conversationRouter } from "./routes/conversation.routes";
import { notificationRouter } from "./routes/notification.routes";
import { matchesRouter } from "./routes/matches.routes";

export const app = express();

// Trust reverse proxy (Render / Cloudflare) for accurate client IP resolution
app.set("trust proxy", 1);

// Request Correlation ID Middleware (first in pipeline)
app.use(requestIdMiddleware);

// Security Middlewares
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
  })
);
const corsOptions: cors.CorsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (e.g. mobile apps, curl, Postman, same-origin)
    if (!origin) return callback(null, true);

    const normalizedOrigin = origin.replace(/\/+$/, "");

    const isAllowed =
      config.nodeEnv !== "production" ||
      config.clientOrigins.some(
        (allowed) => allowed === "*" || allowed.replace(/\/+$/, "") === normalizedOrigin
      ) ||
      /^https:\/\/.*\.vercel\.app$/.test(normalizedOrigin) ||
      /^http:\/\/localhost(:\d+)?$/.test(normalizedOrigin);

    if (isAllowed) {
      return callback(null, true);
    }

    return callback(null, false);
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "X-Request-ID"],
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Database-Verified Health Check Endpoints (safe for monitoring, zero secret/credential leakage)
app.get(["/health", "/api/health"], async (_req: Request, res: Response) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.status(200).json({
      status: "healthy",
      service: "manglammatrimony-backend",
      database: "connected",
      timestamp: new Date().toISOString(),
    });
  } catch {
    res.status(503).json({
      status: "unhealthy",
      service: "manglammatrimony-backend",
      database: "disconnected",
      timestamp: new Date().toISOString(),
    });
  }
});

// General API Route-Aware Rate Limiting
app.use("/api", apiRateLimiter);

// Authentication Routes
app.use("/api/auth", authRouter);

// Profile Routes
app.use("/api/profile", profileRouter);

// Message Requests Routes
app.use("/api/message-requests", messageRequestRouter);

// Conversations & Messages Routes
app.use("/api/messages", conversationRouter);

// Notifications Routes
app.use("/api/notifications", notificationRouter);

// Discovery Matches Routes
app.use("/api/matches", matchesRouter);

// 404 Handler
app.use((_req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    code: "NOT_FOUND",
    message: "Requested API resource not found.",
  });
});

// Global Error Handler with Request Correlation
app.use(
  (err: Error, req: Request, res: Response, _next: NextFunction) => {
    console.error(`[GLOBAL SERVER ERROR] [REQ_ID: ${req.id || "N/A"}]:`, err.message);
    res.status(500).json({
      success: false,
      code: "INTERNAL_SERVER_ERROR",
      message: "An unexpected error occurred. Please try again later.",
    });
  }
);
