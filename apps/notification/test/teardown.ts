// eslint-disable-next-line @typescript-eslint/no-var-requires
require('ts-node').register({
  transpileOnly: true,
});

import { PrismaClient } from '@prisma/client';

const teardown = async () => {
  const prisma = new PrismaClient();
  try {
    // Cleanup database at the end of tests
    const deleteNotifications = prisma.notification.deleteMany();

    await prisma.$transaction([deleteNotifications]);
  } catch (err) {
    console.log(err);
    await prisma.$disconnect();
  }
};

export default teardown;
