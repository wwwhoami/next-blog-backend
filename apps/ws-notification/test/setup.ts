import 'tsconfig-paths/register';

import { PrismaClient } from '@prisma/client';
import { seedWithMockUsers } from 'prisma/seeders/seed-with-mock-users';

const setup = async () => {
  const prisma = new PrismaClient();
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
