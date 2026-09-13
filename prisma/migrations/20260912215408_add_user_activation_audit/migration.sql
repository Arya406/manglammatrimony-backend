-- AlterTable
ALTER TABLE "users" ADD COLUMN     "activated_at" TIMESTAMP(3),
ADD COLUMN     "activated_by_user_id" TEXT;

-- CreateIndex
CREATE INDEX "users_activated_at_idx" ON "users"("activated_at");

-- CreateIndex
CREATE INDEX "users_activated_by_user_id_idx" ON "users"("activated_by_user_id");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_activated_by_user_id_fkey" FOREIGN KEY ("activated_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
