-- CreateEnum
CREATE TYPE "MediaType" AS ENUM ('IMAGE');

-- CreateEnum
CREATE TYPE "MediaTarget" AS ENUM ('POST', 'COMMENT', 'USER_AVATAR');

-- CreateEnum
CREATE TYPE "MediaVariant" AS ENUM ('ORIGINAL', 'PREVIEW', 'MEDIUM', 'LARGE', 'THUMBNAIL');

-- CreateTable
CREATE TABLE "Media" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "owner_id" UUID NOT NULL,
    "parentId" UUID,
    "postId" INTEGER,
    "commentId" INTEGER,
    "media_type" "MediaType" NOT NULL,
    "media_target" "MediaTarget" NOT NULL,
    "media_variant" "MediaVariant" NOT NULL DEFAULT 'ORIGINAL',
    "mime_type" VARCHAR NOT NULL,
    "size_bytes" BIGINT NOT NULL,
    "bucket" VARCHAR NOT NULL,
    "publicUrl" VARCHAR NOT NULL,
    "hash" CHAR(64),
    "ref_count" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "Media_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Media_key_key" ON "Media"("key");

-- CreateIndex
CREATE INDEX "Media_key_idx" ON "Media"("key");

-- CreateIndex
CREATE INDEX "Media_owner_id_idx" ON "Media"("owner_id");

-- CreateIndex
CREATE INDEX "Media_postId_idx" ON "Media"("postId");

-- CreateIndex
CREATE INDEX "Media_commentId_idx" ON "Media"("commentId");

-- CreateIndex
CREATE UNIQUE INDEX "Media_hash_media_type_key" ON "Media"("hash", "media_type");

-- AddForeignKey
ALTER TABLE "Media" ADD CONSTRAINT "Media_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Media" ADD CONSTRAINT "Media_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Media" ADD CONSTRAINT "Media_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "Comment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Media" ADD CONSTRAINT "Media_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Media"("id") ON DELETE SET NULL ON UPDATE CASCADE;
