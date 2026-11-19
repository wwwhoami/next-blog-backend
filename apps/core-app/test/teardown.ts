import {
  clearBlogFixtures,
  withE2eDatabase,
} from '../../../libs/test-support/e2e-database';

const teardown = () =>
  withE2eDatabase(async (prisma) => {
    await clearBlogFixtures(prisma);
  });

export default teardown;
