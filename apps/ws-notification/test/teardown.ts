import '@dotenvx/dotenvx/config';
import 'tsconfig-paths/register';

import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { PrismaClient } from 'prisma/generated/client';

const teardown = async () => {
  const pool = new Pool({ connectionString: process.env.POSTGRES_URL });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });
  try {
    // Cleanup database at the end of tests
    const deleteUsers = prisma.user.deleteMany();

    await prisma.$transaction([deleteUsers]);
  } catch (err) {
    console.error(err);
    await prisma.$disconnect();
  }
};

export default teardown;
