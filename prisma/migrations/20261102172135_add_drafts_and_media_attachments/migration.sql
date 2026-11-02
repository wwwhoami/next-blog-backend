-- CreateEnum
CREATE TYPE "DraftStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "MediaRole" AS ENUM ('COVER', 'BODY');

-- AlterTable
ALTER TABLE "Media" ADD COLUMN     "draft_id" UUID,
ADD COLUMN     "role" "MediaRole" NOT NULL DEFAULT 'BODY';

-- CreateTable
CREATE TABLE "Draft" (
    "id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "title" TEXT NOT NULL DEFAULT '',
    "excerpt" TEXT NOT NULL DEFAULT '',
    "content" TEXT NOT NULL DEFAULT '',
    "category_names" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "cover_media_id" UUID,
    "post_id" INTEGER,
    "status" "DraftStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "archived_at" TIMESTAMPTZ(6),

    CONSTRAINT "Draft_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Draft_post_id_key" ON "Draft"("post_id");

-- CreateIndex
CREATE INDEX "Draft_owner_id_status_idx" ON "Draft"("owner_id", "status");

-- CreateIndex
CREATE INDEX "Draft_updated_at_idx" ON "Draft"("updated_at");

-- CreateIndex
CREATE INDEX "Media_draft_id_idx" ON "Media"("draft_id");

-- AddForeignKey
ALTER TABLE "Draft" ADD CONSTRAINT "Draft_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Draft" ADD CONSTRAINT "Draft_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "Post"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Media" ADD CONSTRAINT "Media_draft_id_fkey" FOREIGN KEY ("draft_id") REFERENCES "Draft"("id") ON DELETE SET NULL ON UPDATE CASCADE;
