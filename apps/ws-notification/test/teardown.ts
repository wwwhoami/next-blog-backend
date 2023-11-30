/* eslint-disable */
import 'tsconfig-paths/register';
/* eslint-enable */
import { PrismaClient } from '@prisma/client';

const teardown = async () => {
  const prisma = new PrismaClient();
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
