import { withE2eDatabase } from '../../../libs/test-support/e2e-database';

const teardown = () =>
  withE2eDatabase(async (prisma) => {
    // Cleanup database at the end of tests
    const deleteUsers = prisma.user.deleteMany();

    await prisma.$transaction([deleteUsers]);
  });

export default teardown;
