/*
  Warnings:

  - You are about to drop the column `authorId` on the `Post` table. All the data in the column will be lost.
  - You are about to drop the column `categoryId` on the `Post` table. All the data in the column will be lost.
  - You are about to drop the column `createdAt` on the `Post` table. All the data in the column will be lost.
  - You are about to drop the column `updatedAt` on the `Post` table. All the data in the column will be lost.
  - You are about to drop the column `viewCount` on the `Post` table. All the data in the column will be lost.
  - Added the required column `author_id` to the `Post` table without a default value. This is not possible if the table is not empty.
  - Added the required column `category_id` to the `Post` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updated_at` to the `Post` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "Post" DROP CONSTRAINT "Post_authorId_fkey";

-- DropForeignKey
ALTER TABLE "Post" DROP CONSTRAINT "Post_categoryId_fkey";

-- AlterTable
ALTER TABLE "Post" DROP COLUMN "authorId",
DROP COLUMN "categoryId",
DROP COLUMN "createdAt",
DROP COLUMN "updatedAt",
DROP COLUMN "viewCount",
ADD COLUMN     "author_id" INTEGER NOT NULL,
ADD COLUMN     "category_id" INTEGER NOT NULL,
ADD COLUMN     "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "view_count" INTEGER NOT NULL DEFAULT 0;

-- AddForeignKey
ALTER TABLE "Post" ADD CONSTRAINT "Post_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Post" ADD CONSTRAINT "Post_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
