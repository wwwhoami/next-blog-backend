/*
  Warnings:

  - A unique constraint covering the columns `[color]` on the table `Category` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Category" ADD COLUMN     "color" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Category_color_key" ON "Category"("color");
