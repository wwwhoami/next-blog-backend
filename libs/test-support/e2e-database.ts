import '@dotenvx/dotenvx/config';
import 'tsconfig-paths/register';

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from 'prisma/generated/client';

export async function withE2eDatabase(
  run: (prisma: PrismaClient) => Promise<void>,
) {
  const adapter = new PrismaPg({ connectionString: process.env.POSTGRES_URL });
  const prisma = new PrismaClient({ adapter });

  try {
    await run(prisma);
  } catch (err) {
    console.error(err);
  } finally {
    await prisma.$disconnect();
  }
}

export async function clearBlogFixtures(prisma: PrismaClient) {
  await prisma.$transaction([
    prisma.postToCategory.deleteMany(),
    prisma.user.deleteMany(),
    prisma.post.deleteMany(),
    prisma.category.deleteMany(),
    prisma.comment.deleteMany(),
    prisma.notification.deleteMany(),
  ]);
}
