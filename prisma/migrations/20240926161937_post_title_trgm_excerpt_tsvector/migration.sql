-- DropIndex
DROP INDEX "Post_title_excerpt_idx";

-- DropExtension btree_gist
DROP EXTENSION IF EXISTS "btree_gist";

-- CreateIndex Post_title_trgm_idx
CREATE INDEX "Post_title_trgm_idx" ON "Post" USING GIN ("title" gin_trgm_ops);

-- CreateIndex Post_excerpt_tsvector_idx
CREATE INDEX "Post_excerpt_tsvector_idx" ON "Post" USING GIN(to_tsvector('english', "excerpt"));
