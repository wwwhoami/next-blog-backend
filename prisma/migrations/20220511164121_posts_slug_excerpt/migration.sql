/*
  Warnings:

  - The primary key for the `Category` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `id` on the `Category` table. All the data in the column will be lost.
  - The primary key for the `PostToCategory` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `category_id` on the `PostToCategory` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[slug]` on the table `Post` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `excerpt` to the `Post` table without a default value. This is not possible if the table is not empty.
  - Added the required column `slug` to the `Post` table without a default value. This is not possible if the table is not empty.
  - Added the required column `category_name` to the `PostToCategory` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "PostToCategory" DROP CONSTRAINT "PostToCategory_category_id_fkey";

-- AlterTable
ALTER TABLE "Category" DROP CONSTRAINT "Category_pkey",
DROP COLUMN "id",
ADD CONSTRAINT "Category_pkey" PRIMARY KEY ("name");

-- AlterTable
ALTER TABLE "Post" ADD COLUMN     "excerpt" VARCHAR NOT NULL,
ADD COLUMN     "slug" VARCHAR NOT NULL,
ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMPTZ,
ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMPTZ;

-- AlterTable
ALTER TABLE "PostToCategory" DROP CONSTRAINT "PostToCategory_pkey",
DROP COLUMN "category_id",
ADD COLUMN     "category_name" TEXT NOT NULL,
ADD CONSTRAINT "PostToCategory_pkey" PRIMARY KEY ("post_id", "category_name");

-- CreateIndex
CREATE UNIQUE INDEX "Post_slug_key" ON "Post"("slug");

-- AddForeignKey
ALTER TABLE "PostToCategory" ADD CONSTRAINT "PostToCategory_category_name_fkey" FOREIGN KEY ("category_name") REFERENCES "Category"("name") ON DELETE RESTRICT ON UPDATE CASCADE;
