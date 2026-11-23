BEGIN;

ALTER TABLE "PostToCategory" DROP CONSTRAINT "PostToCategory_category_name_fkey";
DROP INDEX "Category_name_key";
ALTER TABLE "PostToCategory" ADD CONSTRAINT "PostToCategory_category_name_fkey"
    FOREIGN KEY ("category_name") REFERENCES "Category"("name") ON DELETE CASCADE ON UPDATE CASCADE;
DROP INDEX "Post_slug_idx";
DROP INDEX "Media_key_idx";
DROP INDEX "Media_owner_id_hash_media_type_media_target_idx";

ALTER TABLE "Media"
    DROP COLUMN "postId",
    DROP COLUMN "commentId",
    DROP COLUMN "draft_id",
    DROP COLUMN "ref_count";

CREATE INDEX "Media_parentId_idx" ON "Media"("parentId");
CREATE UNIQUE INDEX "Media_live_original_upload_key"
    ON "Media"("owner_id", "hash", "media_type", "media_target")
    WHERE "parentId" IS NULL AND "media_variant" = 'ORIGINAL' AND "deleted_at" IS NULL;

CREATE TABLE "PostMedia" (
    "post_id" INTEGER NOT NULL REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    "media_id" UUID NOT NULL REFERENCES "Media"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PostMedia_pkey" PRIMARY KEY ("post_id", "media_id")
);
CREATE INDEX "PostMedia_media_id_idx" ON "PostMedia"("media_id");

CREATE INDEX "Draft_cover_media_id_idx" ON "Draft"("cover_media_id");
ALTER TABLE "Draft" ADD CONSTRAINT "Draft_cover_media_id_fkey"
    FOREIGN KEY ("cover_media_id") REFERENCES "Media"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE FUNCTION "update_post_likes_count"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE "Post" SET "likes_count" = "likes_count" + 1 WHERE "id" = NEW."post_id";
    ELSE
        UPDATE "Post" SET "likes_count" = "likes_count" - 1 WHERE "id" = OLD."post_id";
    END IF;
    RETURN NULL;
END;
$$;

CREATE FUNCTION "update_comment_likes_count"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE "Comment" SET "likes_count" = "likes_count" + 1 WHERE "id" = NEW."comment_id";
    ELSE
        UPDATE "Comment" SET "likes_count" = "likes_count" - 1 WHERE "id" = OLD."comment_id";
    END IF;
    RETURN NULL;
END;
$$;

CREATE TRIGGER "PostLikes_update_count"
    AFTER INSERT OR DELETE ON "PostLikes" FOR EACH ROW EXECUTE FUNCTION "update_post_likes_count"();
CREATE TRIGGER "CommentLikes_update_count"
    AFTER INSERT OR DELETE ON "CommentLikes" FOR EACH ROW EXECUTE FUNCTION "update_comment_likes_count"();

COMMIT;
