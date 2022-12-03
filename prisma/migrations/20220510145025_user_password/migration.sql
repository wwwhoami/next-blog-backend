/*
  Warnings:

  - You are about to drop the column `color` on the `Category` table. All the data in the column will be lost.
  - You are about to alter the column `description` on the `Category` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(350)`.
  - A unique constraint covering the columns `[hex_color]` on the table `Category` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `password` to the `User` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "Category_color_key";

-- AlterTable
ALTER TABLE "Category" DROP COLUMN "color",
ADD COLUMN     "hex_color" CHAR(7),
ALTER COLUMN "name" SET DATA TYPE VARCHAR,
ALTER COLUMN "description" SET DATA TYPE VARCHAR(350);

-- AlterTable
ALTER TABLE "Post" ALTER COLUMN "title" SET DATA TYPE VARCHAR;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "password" CHAR(60) NOT NULL,
ALTER COLUMN "email" SET DATA TYPE VARCHAR,
ALTER COLUMN "name" SET DATA TYPE VARCHAR;

-- CreateIndex
CREATE UNIQUE INDEX "Category_hex_color_key" ON "Category"("hex_color");
