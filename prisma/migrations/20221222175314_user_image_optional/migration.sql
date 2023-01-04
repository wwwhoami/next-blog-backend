-- DropForeignKey

ALTER TABLE "Post" DROP CONSTRAINT "Post_author_id_fkey";

-- AlterTable

ALTER TABLE "User" ALTER COLUMN "image" DROP NOT NULL;

-- AddForeignKey

ALTER TABLE "Post"
ADD
    CONSTRAINT "Post_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;