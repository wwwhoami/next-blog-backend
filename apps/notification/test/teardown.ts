import { withE2eDatabase } from '../../../libs/test-support/e2e-database';

const teardown = () =>
  withE2eDatabase(async (prisma) => {
    // Cleanup database at the end of tests
    const deleteNotifications = prisma.notification.deleteMany();

    await prisma.$transaction([deleteNotifications]);
  });

export default teardown;
