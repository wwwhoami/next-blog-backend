import '@dotenvx/dotenvx/config';
import 'tsconfig-paths/register';

import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { PrismaClient } from 'prisma/generated/client';
import { seedWithMockUsers } from 'prisma/seeders/seed-with-mock-users';

const setup = async () => {
  const pool = new Pool({ connectionString: process.env.POSTGRES_URL });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });
  try {
    // Cleanup database before seeding
    const deleteUsers = prisma.user.deleteMany();
    const deletePosts = prisma.post.deleteMany();
    const deletePostToCategory = prisma.postToCategory.deleteMany();
    const deleteCategory = prisma.category.deleteMany();
    const deleteComments = prisma.comment.deleteMany();
    const deleteNotifications = prisma.notification.deleteMany();

    await prisma.$transaction([
      deletePostToCategory,
      deleteUsers,
      deletePosts,
      deleteCategory,
      deleteComments,
      deleteNotifications,
    ]);

    // Seed database with user mocks only
    await seedWithMockUsers(prisma);
  } catch (err) {
    console.error(err);
    await prisma.$disconnect();
  }
};

export default setup;
