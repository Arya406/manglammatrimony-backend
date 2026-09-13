-- AlterTable
ALTER TABLE "users" ADD COLUMN "status_changed_at" TIMESTAMP(3),
ADD COLUMN "status_changed_by_user_id" TEXT;

-- CreateIndex
CREATE INDEX "users_status_changed_at_idx" ON "users"("status_changed_at");

-- CreateIndex
CREATE INDEX "users_status_changed_by_user_id_idx" ON "users"("status_changed_by_user_id");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_status_changed_by_user_id_fkey" FOREIGN KEY ("status_changed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
