-- DropIndex
DROP INDEX "Media_hash_media_type_key";

-- CreateIndex
CREATE INDEX "Media_owner_id_hash_media_type_media_target_idx" ON "Media"("owner_id", "hash", "media_type", "media_target");
