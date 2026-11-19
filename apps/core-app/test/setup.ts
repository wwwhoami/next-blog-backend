import 'tsconfig-paths/register';

import { PrismaClient } from 'prisma/generated/client';
import { seedWithMocks } from 'prisma/seeders/seed-with-mocks';
import {
  clearBlogFixtures,
  withE2eDatabase,
} from '../../../libs/test-support/e2e-database';

const resetAutoIncrement = async (prisma: PrismaClient) => {
  const resetCommentIdSeq = prisma.$queryRaw`ALTER SEQUENCE "public"."Comment_id_seq" RESTART`;
  const resetPostIdSeq = prisma.$queryRaw`ALTER SEQUENCE "public"."Post_id_seq" RESTART`;
  const resetNotificationIdSeq = prisma.$queryRaw`ALTER SEQUENCE "public"."Notification_id_seq" RESTART`;

  await prisma.$transaction([
    resetCommentIdSeq,
    resetPostIdSeq,
    resetNotificationIdSeq,
  ]);
};

const setup = () =>
  withE2eDatabase(async (prisma) => {
    await clearBlogFixtures(prisma);

    // Reset auto-increment id sequences
    await resetAutoIncrement(prisma);

    // Seed database with mocks only
    await seedWithMocks(prisma);
  });

export default setup;
