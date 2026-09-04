-- AlterTable
ALTER TABLE "profiles" ADD COLUMN "submitted_at" TIMESTAMP(3),
ADD COLUMN "reviewed_at" TIMESTAMP(3),
ADD COLUMN "rejection_reason" TEXT;
