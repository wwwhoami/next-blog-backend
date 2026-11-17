CREATE TABLE "MediaStorageDeletion" (
    "id" BIGSERIAL NOT NULL,
    "bucket" VARCHAR NOT NULL,
    "key" TEXT NOT NULL,

    CONSTRAINT "MediaStorageDeletion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MediaStorageDeletion_bucket_key_key"
    ON "MediaStorageDeletion"("bucket", "key");
