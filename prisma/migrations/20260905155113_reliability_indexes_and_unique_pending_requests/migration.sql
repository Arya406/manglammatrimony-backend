-- CreateIndex
CREATE INDEX "castes_community_id_idx" ON "castes"("community_id");

-- CreateIndex
CREATE INDEX "communities_religion_id_idx" ON "communities"("religion_id");

-- CreateIndex
CREATE INDEX "gotras_community_id_idx" ON "gotras"("community_id");

-- CreateIndex
CREATE INDEX "profile_photos_profile_id_moderation_status_sort_order_idx" ON "profile_photos"("profile_id", "moderation_status", "sort_order");

-- CreateIndex
CREATE INDEX "profiles_profile_status_completion_percentage_idx" ON "profiles"("profile_status", "completion_percentage");

-- CreateIndex
CREATE INDEX "users_status_idx" ON "users"("status");

-- CreateIndex: Partial unique index to prevent duplicate pending message requests between the same pair of users
CREATE UNIQUE INDEX "unique_active_pending_request" ON "message_requests" (LEAST("sender_user_id", "receiver_user_id"), GREATEST("sender_user_id", "receiver_user_id")) WHERE "status" = 'PENDING';
