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
    storageProvider: (process.env.PHOTO_STORAGE_PROVIDER || process.env.STORAGE_PROVIDER || "local").toLowerCase(),
    storageBasePath: process.env.STORAGE_BASE_PATH || "./storage",
    storagePublicBaseUrl: process.env.STORAGE_PUBLIC_BASE_URL || "",
    r2: {
      accountId: process.env.R2_ACCOUNT_ID || "",
      accessKeyId: process.env.R2_ACCESS_KEY_ID || "",
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || "",
      bucketName: process.env.R2_BUCKET_NAME || "",
      publicBaseUrl: (process.env.R2_PUBLIC_BASE_URL || process.env.PHOTO_CDN_BASE_URL || "").replace(/\/+$/, ""),
    },
  },
  devPhotoApprovalEnabled: process.env.DEV_PHOTO_APPROVAL_ENABLED === "true",
  devDummyOtpEnabled:
    process.env.NODE_ENV !== "production" &&
    process.env.DEV_DUMMY_OTP_ENABLED === "true",
  resend: {
    apiKey: process.env.RESEND_API_KEY || "",
    fromEmail: process.env.RESEND_FROM_EMAIL || "Manglam Matrimony <auth@manglammatrimony.com>",
    fromName: process.env.RESEND_FROM_NAME || "Manglam Matrimony",
  },
};

/**
 * Validates storage provider configuration.
 * Fails fast at startup in production if R2 is configured but credentials are missing.
 */
export function validateStorageConfig(): void {
  const provider = config.photo.storageProvider;
  if (provider === "r2") {
    const missing: string[] = [];
    if (!config.photo.r2.accountId) missing.push("R2_ACCOUNT_ID");
    if (!config.photo.r2.accessKeyId) missing.push("R2_ACCESS_KEY_ID");
    if (!config.photo.r2.secretAccessKey) missing.push("R2_SECRET_ACCESS_KEY");
    if (!config.photo.r2.bucketName) missing.push("R2_BUCKET_NAME");

    if (missing.length > 0) {
      throw new Error(
        `[StorageConfigError] R2 storage provider requested, but missing required environment variable(s): ${missing.join(", ")}`
      );
    }

    // Mask accountId and accessKeyId for safe startup log
    const maskedAccount = config.photo.r2.accountId.length > 6
      ? `${config.photo.r2.accountId.slice(0, 4)}...${config.photo.r2.accountId.slice(-2)}`
      : "***";
    console.log(
      `[STORAGE CONFIG] Cloudflare R2 active: bucket=${config.photo.r2.bucketName}, account=${maskedAccount}, cdn=${config.photo.r2.publicBaseUrl || "(direct)"}`
    );
  } else if (provider === "local") {
    if (config.nodeEnv === "production") {
      console.warn(
        "[StorageConfigWarning] PHOTO_STORAGE_PROVIDER is set to 'local' in production. " +
        "Container filesystems are ephemeral on Render; uploaded photos will be lost on container restart. " +
        "Configure Cloudflare R2 for durable photo storage."
      );
    } else {
      console.log(`[STORAGE CONFIG] Local storage active: path=${config.photo.storageBasePath}`);
    }
  } else {
    throw new Error(
      `[StorageConfigError] Unsupported storage provider: "${provider}". Expected 'local' or 'r2'.`
    );
  }
}

/**
 * Validates production authentication and email OTP provider configuration.
 * Fails fast at startup in production if Resend or JWT credentials are missing or invalid.
 */
export function validateAuthConfig(): void {
  if (config.nodeEnv === "production") {
    const errors: string[] = [];

    // 1. RESEND_API_KEY is missing or empty
    if (!config.resend.apiKey || config.resend.apiKey.trim() === "") {
      errors.push("RESEND_API_KEY is missing or empty.");
    } else if (config.resend.apiKey.startsWith("mock_")) {
      // 2. RESEND_API_KEY starts with "mock_"
      errors.push("RESEND_API_KEY cannot use mock credentials in production.");
    }

    // 3. RESEND_FROM_EMAIL is missing or empty
    if (!config.resend.fromEmail || config.resend.fromEmail.trim() === "") {
      errors.push("RESEND_FROM_EMAIL is missing or empty.");
    } else if (config.resend.fromEmail.includes("onboarding@resend.dev")) {
      // 4. RESEND_FROM_EMAIL contains onboarding@resend.dev
      errors.push(
        "RESEND_FROM_EMAIL cannot use onboarding@resend.dev in production; a verified custom domain sender is required."
      );
    }

    // 5. OTP_PROVIDER is not exactly "resend"
    if (config.otp.provider !== "resend") {
      errors.push(`OTP_PROVIDER must be set to 'resend' in production (got '${config.otp.provider}').`);
    }

    // 6. JWT_SECRET is missing or empty
    if (!config.jwtSecret || config.jwtSecret.trim() === "") {
      errors.push("JWT_SECRET is missing or empty.");
    } else if (config.jwtSecret === "manglam_matrimony_jwt_secret_dev_key_2026_secure") {
      // 7. JWT_SECRET is still the known/default development secret
      errors.push(
        "JWT_SECRET is using the insecure default development secret; a strong production secret is required."
      );
    }

    if (errors.length > 0) {
      throw new Error(
        `[AuthConfigError] Production authentication configuration failed validation:\n${errors
          .map((e) => `  - ${e}`)
          .join("\n")}`
      );
    }

    const maskedKey =
      config.resend.apiKey.length > 8
        ? `${config.resend.apiKey.slice(0, 5)}...${config.resend.apiKey.slice(-3)}`
        : "***";
    console.log(
      `[AUTH CONFIG] Production authentication active: provider=${config.otp.provider}, sender=${config.resend.fromEmail}, resendKey=${maskedKey}`
    );
  } else if (config.devDummyOtpEnabled) {
    console.warn(
      "[AUTH CONFIG WARNING] DEV_DUMMY_OTP_ENABLED=true in non-production environment. Dummy OTP 123456 is active for local testing."
    );
  }
}

