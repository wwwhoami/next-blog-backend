import { PrismaClient } from 'prisma/generated/client';
import { withE2eDatabase } from '../../../libs/test-support/e2e-database';

export const resetNotificationAutoIncrement = async (prisma: PrismaClient) => {
  const resetNotificationIdSeq = prisma.$queryRaw`ALTER SEQUENCE "public"."Notification_id_seq" RESTART`;

  await prisma.$transaction([resetNotificationIdSeq]);
};

const setup = () =>
  withE2eDatabase(async (prisma) => {
    // Cleanup database before seeding
    const deleteNotifications = prisma.notification.deleteMany();

    await prisma.$transaction([deleteNotifications]);

    // Reset auto-increment id sequences
    await resetNotificationAutoIncrement(prisma);
  });

export default setup;
