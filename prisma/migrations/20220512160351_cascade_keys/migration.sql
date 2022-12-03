-- DropForeignKey
ALTER TABLE "Post" DROP CONSTRAINT "Post_author_id_fkey";

-- DropForeignKey
ALTER TABLE "PostToCategory" DROP CONSTRAINT "PostToCategory_category_name_fkey";

-- DropForeignKey
ALTER TABLE "PostToCategory" DROP CONSTRAINT "PostToCategory_post_id_fkey";

-- AddForeignKey
ALTER TABLE "Post" ADD CONSTRAINT "Post_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostToCategory" ADD CONSTRAINT "PostToCategory_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostToCategory" ADD CONSTRAINT "PostToCategory_category_name_fkey" FOREIGN KEY ("category_name") REFERENCES "Category"("name") ON DELETE CASCADE ON UPDATE CASCADE;
