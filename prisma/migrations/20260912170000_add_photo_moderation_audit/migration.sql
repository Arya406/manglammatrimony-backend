-- AlterTable
ALTER TABLE "profile_photos" ADD COLUMN "moderated_at" TIMESTAMP(3),
ADD COLUMN "moderated_by_user_id" TEXT;

-- CreateIndex
CREATE INDEX "profile_photos_moderated_at_idx" ON "profile_photos"("moderated_at");
CREATE INDEX "profile_photos_moderated_by_user_id_idx" ON "profile_photos"("moderated_by_user_id");

-- AddForeignKey
ALTER TABLE "profile_photos" ADD CONSTRAINT "profile_photos_moderated_by_user_id_fkey" FOREIGN KEY ("moderated_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
