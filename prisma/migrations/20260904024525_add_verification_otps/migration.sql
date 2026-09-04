-- CreateTable
CREATE TABLE "verification_otps" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "hashed_otp" TEXT NOT NULL,
    "salt" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL DEFAULT 5,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "resend_available_at" TIMESTAMP(3) NOT NULL,
    "consumed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "verification_otps_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "verification_otps_email_idx" ON "verification_otps"("email");

-- CreateIndex
CREATE INDEX "verification_otps_expires_at_idx" ON "verification_otps"("expires_at");
