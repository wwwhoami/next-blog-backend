/*
  Warnings:

  - A unique constraint covering the columns `[image]` on the table `User` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `image` to the `User` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "User" ADD COLUMN     "image" VARCHAR NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "User_image_key" ON "User"("image");
