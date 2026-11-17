CREATE TABLE "MediaVariantPutIntent" (
    "key" TEXT PRIMARY KEY,
    "bucket" VARCHAR NOT NULL,
    "parentId" UUID NOT NULL,
    "token" UUID NOT NULL,
    "leaseUntil" TIMESTAMPTZ(6) NOT NULL
);

CREATE INDEX "MediaVariantPutIntent_parentId_idx" ON "MediaVariantPutIntent"("parentId");
