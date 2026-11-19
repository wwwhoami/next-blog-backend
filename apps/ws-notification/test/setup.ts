import 'tsconfig-paths/register';

import { seedWithMockUsers } from 'prisma/seeders/seed-with-mock-users';
import {
  clearBlogFixtures,
  withE2eDatabase,
} from '../../../libs/test-support/e2e-database';

const setup = () =>
  withE2eDatabase(async (prisma) => {
    await clearBlogFixtures(prisma);

    // Seed database with user mocks only
    await seedWithMockUsers(prisma);
  });

export default setup;
