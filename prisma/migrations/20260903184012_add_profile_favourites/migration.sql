-- CreateTable
CREATE TABLE "profile_favourites" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "target_profile_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "profile_favourites_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "profile_favourites_user_id_idx" ON "profile_favourites"("user_id");

-- CreateIndex
CREATE INDEX "profile_favourites_target_profile_id_idx" ON "profile_favourites"("target_profile_id");

-- CreateIndex
CREATE INDEX "profile_favourites_created_at_idx" ON "profile_favourites"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "profile_favourites_user_id_target_profile_id_key" ON "profile_favourites"("user_id", "target_profile_id");

-- AddForeignKey
ALTER TABLE "profile_favourites" ADD CONSTRAINT "profile_favourites_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profile_favourites" ADD CONSTRAINT "profile_favourites_target_profile_id_fkey" FOREIGN KEY ("target_profile_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
