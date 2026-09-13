-- CreateEnum
CREATE TYPE "AccountActivationStatus" AS ENUM ('PENDING_ACTIVATION', 'ACTIVE');

-- AlterTable
ALTER TABLE "users" ADD COLUMN "activation_status" "AccountActivationStatus" NOT NULL DEFAULT 'ACTIVE';

-- CreateIndex
CREATE INDEX "users_activation_status_idx" ON "users"("activation_status");
