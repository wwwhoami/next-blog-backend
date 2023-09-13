/* eslint-disable */
import 'tsconfig-paths/register';
/* eslint-enable */
import { PrismaClient } from '@prisma/client';

export const resetNotificationAutoIncrement = async (prisma: PrismaClient) => {
  const resetNotificationIdSeq = prisma.$queryRaw`ALTER SEQUENCE "public"."Notification_id_seq" RESTART`;

  await prisma.$transaction([resetNotificationIdSeq]);
};

const setup = async () => {
  const prisma = new PrismaClient();
  try {
    // Cleanup database before seeding
    const deleteNotifications = prisma.notification.deleteMany();

    await prisma.$transaction([deleteNotifications]);

    // Reset auto-increment id sequences
    await resetNotificationAutoIncrement(prisma);
  } catch (err) {
    console.log(err);
    await prisma.$disconnect();
  }
};

export default setup;
