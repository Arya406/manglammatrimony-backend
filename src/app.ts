import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import { config } from "./config/env";
import { authRouter } from "./routes/auth.routes";
import { profileRouter } from "./routes/profile.routes";
import { messageRequestRouter } from "./routes/message-request.routes";
import { conversationRouter } from "./routes/conversation.routes";
import { notificationRouter } from "./routes/notification.routes";
import { matchesRouter } from "./routes/matches.routes";

export const app = express();

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
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health Check Endpoints
app.get(["/health", "/api/health"], (_req: Request, res: Response) => {
  res.status(200).json({
    status: "healthy",
    service: "manglammatrimony-backend",
    timestamp: new Date().toISOString(),
    environment: config.nodeEnv,
  });
});

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

// Global Error Handler
app.use(
  (err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error("[GLOBAL SERVER ERROR]:", err.message);
    res.status(500).json({
      success: false,
      code: "INTERNAL_SERVER_ERROR",
      message: "An unexpected error occurred. Please try again later.",
    });
  }
);
