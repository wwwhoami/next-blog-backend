ALTER TYPE "DraftStatus" ADD VALUE 'PUBLISHING';

ALTER TABLE "Draft"
ADD COLUMN "validation_error" TEXT;
