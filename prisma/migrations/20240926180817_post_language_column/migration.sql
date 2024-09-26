-- AlterTable
ALTER TABLE "Post" ADD COLUMN     "language" TEXT NOT NULL DEFAULT 'english';

-- CreateIndex
CREATE INDEX "Post_language_idx" ON "Post"("language");
