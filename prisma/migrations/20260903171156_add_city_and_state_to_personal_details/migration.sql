-- AlterTable
ALTER TABLE "profile_personal_details" ADD COLUMN     "city" TEXT,
ADD COLUMN     "state" TEXT;

-- CreateIndex
CREATE INDEX "profile_personal_details_city_idx" ON "profile_personal_details"("city");

-- CreateIndex
CREATE INDEX "profile_personal_details_state_idx" ON "profile_personal_details"("state");
