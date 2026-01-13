import path from 'node:path';
import { defineConfig, env } from 'prisma/config';
export default defineConfig({
  schema: path.join('prisma', 'schema.prisma'),
  migrations: {
    path: path.join('prisma', 'migrations'),
    seed: 'tsx prisma/seeders/seed.ts',
  },
  datasource: {
    url: env('POSTGRES_URL'),
  },
});
