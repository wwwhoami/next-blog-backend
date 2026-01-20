#!/bin/bash
set -e

echo "Creating the MinIO media bucket..."

docker exec -t next-blog-minio /usr/bin/mc alias set dockerminio "${MINIO_ENDPOINT}" "${MINIO_ACCESS_KEY}" "${MINIO_SECRET_KEY}"
docker exec -t next-blog-minio /usr/bin/mc mb dockerminio/"$MINIO_MEDIA_BUCKET"
