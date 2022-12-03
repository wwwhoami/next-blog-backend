-- CreateIndex
CREATE INDEX "Post_slug_idx" ON "Post"("slug");

-- CreateIndex
CREATE INDEX "Post_created_at_idx" ON "Post"("created_at");

-- CreateIndex
CREATE INDEX "Post_view_count_idx" ON "Post"("view_count");

-- CreateIndex
CREATE INDEX "Post_published_idx" ON "Post"("published");
