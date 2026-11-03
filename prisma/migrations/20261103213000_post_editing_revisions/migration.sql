ALTER TABLE "Post" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "Draft" DROP CONSTRAINT IF EXISTS "Draft_post_id_key";
ALTER TABLE "Draft" ADD COLUMN "source_version" INTEGER;
ALTER TABLE "Draft" ADD COLUMN "deleted_post_id" INTEGER;

CREATE TABLE "DraftMedia" (
    "draft_id" UUID NOT NULL,
    "media_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DraftMedia_pkey" PRIMARY KEY ("draft_id","media_id"),
    CONSTRAINT "DraftMedia_draft_id_fkey" FOREIGN KEY ("draft_id") REFERENCES "Draft"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DraftMedia_media_id_fkey" FOREIGN KEY ("media_id") REFERENCES "Media"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "DraftMedia_media_id_idx" ON "DraftMedia"("media_id");
CREATE INDEX "Draft_post_id_status_idx" ON "Draft"("post_id", "status");

INSERT INTO "DraftMedia" ("draft_id", "media_id")
SELECT d."id", m."id"
FROM "Draft" AS d
JOIN "Media" AS m ON m."draft_id" = d."id"
ON CONFLICT DO NOTHING;

UPDATE "Draft" AS d
SET "source_version" = p."version"
FROM "Post" AS p
WHERE d."post_id" = p."id";

CREATE UNIQUE INDEX "Draft_one_active_revision_per_post_idx"
ON "Draft" ("post_id")
WHERE "post_id" IS NOT NULL AND "status" IN ('ACTIVE', 'PUBLISHING');

DROP INDEX "Draft_post_id_key";
