ALTER TABLE "Media" ADD COLUMN "retention_refreshed_at" TIMESTAMPTZ(6);
ALTER TABLE "MediaVariantPutIntent" ADD COLUMN "released" BOOLEAN NOT NULL DEFAULT false;
