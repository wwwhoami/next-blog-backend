CREATE EXTENSION pg_trgm;

CREATE EXTENSION btree_gin;

CREATE INDEX post_title_excerpt_gin_index ON "Post" USING GIN (
    to_tsvector('english', title),
    to_tsvector('english', excerpt)
)