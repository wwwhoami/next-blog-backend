/* eslint-disable */
import 'tsconfig-paths/register';
/* eslint-enable */
import { PrismaClient } from '@prisma/client';

const teardown = async () => {
  const prisma = new PrismaClient();
  try {
    // Cleanup database at the end of tests
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
  } catch (err) {
    console.error(err);
    await prisma.$disconnect();
  }
};

export default teardown;
