-- Remove the redundant media role. Draft.cover_media_id is the single
-- source of truth for cover media; all other attached media are body media.
ALTER TABLE "Media" DROP COLUMN "role";
DROP TYPE "MediaRole";
