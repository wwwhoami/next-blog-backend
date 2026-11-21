ALTER TABLE "User" ADD COLUMN "avatar_media_id" UUID;

CREATE INDEX "User_avatar_media_id_idx" ON "User"("avatar_media_id");

ALTER TABLE "User" ADD CONSTRAINT "User_avatar_media_id_fkey"
    FOREIGN KEY ("avatar_media_id") REFERENCES "Media"("id") ON DELETE SET NULL ON UPDATE CASCADE;
