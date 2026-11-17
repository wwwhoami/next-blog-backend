# Database and Configuration

Keep the Prisma schema in `prisma/schema.prisma`; commit a corresponding migration from `prisma/migrations/` whenever the schema changes. Use `pnpm db:migrate` to create and apply a development migration. Use `pnpm db:reset` only with disposable local data because it resets the database.

Seeders are in `prisma/seeders/`. Generated Prisma output in `prisma/generated/` is not source code and must not be edited manually.

With `POSTGRES_URL` set, run `pnpm prisma generate` before the first build or test run in a fresh checkout and after schema changes that affect the client. To use the local configuration, run `pnpm exec dotenvx run -f .env.dev -- pnpm prisma generate`.

Environment files contain credentials. Do not commit `.env*` secrets. The development start, Prisma database, and E2E scripts load `.env.dev`. The local Compose command `pnpm docker:compose:local:up` reads `.env` when starting Postgres, Redis, Kafka, and MinIO.
