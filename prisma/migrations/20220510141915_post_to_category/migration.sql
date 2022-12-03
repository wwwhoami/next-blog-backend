/*
  Warnings:

  - You are about to drop the column `category_id` on the `Post` table. All the data in the column will be lost.
  - Added the required column `description` to the `Category` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "Post" DROP CONSTRAINT "Post_category_id_fkey";

-- AlterTable
ALTER TABLE "Category" ADD COLUMN     "description" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Post" DROP COLUMN "category_id";

-- CreateTable
CREATE TABLE "PostToCategory" (
    "post_id" INTEGER NOT NULL,
    "category_id" INTEGER NOT NULL,

    CONSTRAINT "PostToCategory_pkey" PRIMARY KEY ("post_id","category_id")
);

-- AddForeignKey
ALTER TABLE "PostToCategory" ADD CONSTRAINT "PostToCategory_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "Post"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostToCategory" ADD CONSTRAINT "PostToCategory_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
