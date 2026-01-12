import '@dotenvx/dotenvx/config'
import 'tsconfig-paths/register';

import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { PrismaClient } from 'prisma/generated/client';

export const resetNotificationAutoIncrement = async (prisma: PrismaClient) => {
  const resetNotificationIdSeq = prisma.$queryRaw`ALTER SEQUENCE "public"."Notification_id_seq" RESTART`;

  await prisma.$transaction([resetNotificationIdSeq]);
};

const setup = async () => {
  const pool = new Pool({ connectionString: process.env.POSTGRES_URL });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });
  try {
    // Cleanup database before seeding
    const deleteNotifications = prisma.notification.deleteMany();

    await prisma.$transaction([deleteNotifications]);

    // Reset auto-increment id sequences
    await resetNotificationAutoIncrement(prisma);
  } catch (err) {
    console.error(err);
    await prisma.$disconnect();
  }
};

export default setup;
