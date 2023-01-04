-- CreateExtension

CREATE EXTENSION IF NOT EXISTS "btree_gist";

-- CreateExtension

CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- CreateIndex

CREATE INDEX
    "Post_title_excerpt_idx" ON "Post" USING GIST (
        "title" gist_trgm_ops,
        "excerpt" gist_trgm_ops
    );