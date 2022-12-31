/*
  Warnings:

  - You are about to drop the column `view_count` on the `Post` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "Post_view_count_idx";

-- AlterTable
ALTER TABLE "Post" DROP COLUMN "view_count";
