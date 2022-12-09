CREATE EXTENSION pg_trgm;

CREATE EXTENSION btree_gist;

CREATE INDEX
    post_title_gist_index ON "Post" USING GIST (
        title gist_trgm_ops,
        excerpt gist_trgm_ops
    );

ALTER DATABASE next_blog SET pg_trgm.word_similarity_threshold = 0.3;