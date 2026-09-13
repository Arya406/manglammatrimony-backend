-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('USER', 'ADMIN');

-- AlterTable
ALTER TABLE "users" ADD COLUMN "password_hash" TEXT,
ADD COLUMN "role" "UserRole" NOT NULL DEFAULT 'USER';

-- CreateIndex
CREATE INDEX "users_role_idx" ON "users"("role");
