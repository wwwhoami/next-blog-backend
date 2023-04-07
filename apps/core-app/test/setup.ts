// eslint-disable-next-line @typescript-eslint/no-var-requires
require('ts-node').register({
  transpileOnly: true,
});

import { PrismaClient } from '@prisma/client';
import { seedWithMocks } from 'prisma/seed-with-mocks';

const resetAutoIncrement = async (prisma: PrismaClient) => {
  const resetCommentIdSeq = prisma.$queryRaw`ALTER SEQUENCE "public"."Comment_id_seq" RESTART`;
  const resetPostIdSeq = prisma.$queryRaw`ALTER SEQUENCE "public"."Post_id_seq" RESTART`;

  await prisma.$transaction([resetCommentIdSeq, resetPostIdSeq]);
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

    await prisma.$transaction([
      deletePostToCategory,
      deleteUsers,
      deletePosts,
      deleteCategory,
      deleteComments,
    ]);

    // Reset auto-increment id sequences
    await resetAutoIncrement(prisma);

    // Seed database with mocks only
    await seedWithMocks(prisma);
  } catch (err) {
    console.log(err);
    await prisma.$disconnect();
  }
};

export default setup;
