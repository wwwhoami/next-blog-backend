CREATE TABLE "CommentMedia" (
    "comment_id" INTEGER NOT NULL,
    "media_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    CONSTRAINT "CommentMedia_pkey" PRIMARY KEY ("comment_id", "media_id"),
    CONSTRAINT "CommentMedia_comment_id_fkey" FOREIGN KEY ("comment_id") REFERENCES "Comment"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CommentMedia_media_id_fkey" FOREIGN KEY ("media_id") REFERENCES "Media"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "CommentMedia_media_id_idx" ON "CommentMedia"("media_id");
