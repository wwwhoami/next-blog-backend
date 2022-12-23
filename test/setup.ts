// eslint-disable-next-line @typescript-eslint/no-var-requires
require('ts-node').register({
  transpileOnly: true,
});

import { PrismaClient } from '@prisma/client';
import { seedWithMocks } from 'prisma/seed-with-mocks';

const setup = async () => {
  const prisma = new PrismaClient();
  try {
    // Seed database with mocks only
    await seedWithMocks(prisma);
  } catch (err) {
    console.log(err);
    await prisma.$disconnect();
  }
};

export default setup;
