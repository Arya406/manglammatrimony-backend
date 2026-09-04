import dotenv from "dotenv";
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || "5000", 10),
  nodeEnv: process.env.NODE_ENV || "development",
  clientOrigins: (process.env.CLIENT_ORIGIN || "http://localhost:3000,http://localhost:3001,http://localhost:3002")
    .split(",")
    .map((origin) => origin.trim()),
  jwtSecret: process.env.JWT_SECRET || "manglam_matrimony_jwt_secret_dev_key_2026_secure",
  jwtExpiry: process.env.JWT_EXPIRY || "7d",
  otp: {
    expirySeconds: parseInt(process.env.OTP_EXPIRY_SECONDS || "600", 10), // 10 minutes
    resendCooldownSeconds: parseInt(process.env.OTP_RESEND_COOLDOWN_SECONDS || "60", 10), // 60 seconds
    maxAttempts: parseInt(process.env.OTP_MAX_ATTEMPTS || "5", 10), // 5 max attempts
    provider: process.env.OTP_PROVIDER || "resend",
  },
  photo: {
    maxCount: parseInt(process.env.PHOTO_MAX_COUNT || "6", 10),
    maxSizeMb: parseInt(process.env.PROFILE_IMAGE_MAX_UPLOAD_MB || process.env.PHOTO_MAX_SIZE_MB || "20", 10),
    maxPixels: parseInt(process.env.PROFILE_IMAGE_MAX_PIXELS || "40000000", 10),
    outputWidth: parseInt(process.env.PROFILE_IMAGE_OUTPUT_WIDTH || "1200", 10),
    outputHeight: parseInt(process.env.PROFILE_IMAGE_OUTPUT_HEIGHT || "1500", 10),
    quality: parseInt(process.env.PROFILE_IMAGE_QUALITY || "85", 10),
    minWidth: parseInt(process.env.PHOTO_MIN_WIDTH || "150", 10),
    minHeight: parseInt(process.env.PHOTO_MIN_HEIGHT || "150", 10),
    maxWidth: parseInt(process.env.PHOTO_MAX_WIDTH || "10000", 10),
    maxHeight: parseInt(process.env.PHOTO_MAX_HEIGHT || "10000", 10),
    storageProvider: process.env.STORAGE_PROVIDER || "local",
    storageBasePath: process.env.STORAGE_BASE_PATH || "./storage",
    storagePublicBaseUrl: process.env.STORAGE_PUBLIC_BASE_URL || "",
  },
  devPhotoApprovalEnabled: process.env.DEV_PHOTO_APPROVAL_ENABLED === "true",
  resend: {
    apiKey: process.env.RESEND_API_KEY || "",
    fromEmail: process.env.RESEND_FROM_EMAIL || "Manglam Matrimony <auth@manglammatrimony.com>",
    fromName: process.env.RESEND_FROM_NAME || "Manglam Matrimony",
  },
};
