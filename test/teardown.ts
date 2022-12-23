// eslint-disable-next-line @typescript-eslint/no-var-requires
require('ts-node').register({
  transpileOnly: true,
});

import { PrismaClient } from '@prisma/client';

const teardown = async () => {
  const prisma = new PrismaClient();
  try {
    const deleteUsers = prisma.user.deleteMany();
    const deletePosts = prisma.post.deleteMany();
    const deletePostToCategory = prisma.postToCategory.deleteMany();
    const deleteCategory = prisma.category.deleteMany();

    await prisma.$transaction([
      deletePostToCategory,
      deleteUsers,
      deletePosts,
      deleteCategory,
    ]);
  } catch (err) {
    console.log(err);
    await prisma.$disconnect();
  }
};

export default teardown;
