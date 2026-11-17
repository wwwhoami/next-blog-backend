ALTER TABLE "MediaStorageDeletion"
    ADD COLUMN "nextAttemptAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP;
CREATE INDEX "MediaStorageDeletion_nextAttemptAt_idx" ON "MediaStorageDeletion"("nextAttemptAt");

CREATE TABLE "MediaUploadReservation" (
    "scope" TEXT PRIMARY KEY,
    "key" TEXT NOT NULL,
    "bucket" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ(6) NOT NULL
);
CREATE UNIQUE INDEX "MediaUploadReservation_key_key" ON "MediaUploadReservation"("key");
CREATE INDEX "MediaUploadReservation_expiresAt_idx" ON "MediaUploadReservation"("expiresAt");
