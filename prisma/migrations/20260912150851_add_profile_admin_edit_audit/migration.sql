-- AlterTable
ALTER TABLE "profiles" ADD COLUMN     "last_edited_at" TIMESTAMP(3),
ADD COLUMN     "last_edited_by_user_id" TEXT;

-- CreateIndex
CREATE INDEX "profiles_last_edited_at_idx" ON "profiles"("last_edited_at");

-- CreateIndex
CREATE INDEX "profiles_last_edited_by_user_id_idx" ON "profiles"("last_edited_by_user_id");

-- AddForeignKey
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_last_edited_by_user_id_fkey" FOREIGN KEY ("last_edited_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
