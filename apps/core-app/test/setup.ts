/* eslint-disable */
import 'tsconfig-paths/register';
/* eslint-enable */
import { PrismaClient } from '@prisma/client';
import { seedWithMocks } from 'prisma/seeders/seed-with-mocks';

const resetAutoIncrement = async (prisma: PrismaClient) => {
  const resetCommentIdSeq = prisma.$queryRaw`ALTER SEQUENCE "public"."Comment_id_seq" RESTART`;
  const resetPostIdSeq = prisma.$queryRaw`ALTER SEQUENCE "public"."Post_id_seq" RESTART`;
  const resetNotificationIdSeq = prisma.$queryRaw`ALTER SEQUENCE "public"."Notification_id_seq" RESTART`;

  await prisma.$transaction([
    resetCommentIdSeq,
    resetPostIdSeq,
    resetNotificationIdSeq,
  ]);
};

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

    // Reset auto-increment id sequences
    await resetAutoIncrement(prisma);

    // Seed database with mocks only
    await seedWithMocks(prisma);
  } catch (err) {
    console.error(err);
    await prisma.$disconnect();
  }
};

export default setup;
