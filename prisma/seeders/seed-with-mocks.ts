import { PrismaClient } from 'prisma/generated/client';
import { getPostMocks } from 'data/post';
import { categoryData, commentData, userData } from 'data/seed-data';
import { PrismaSeeder } from './prisma-seeder';

export async function seedWithMocks(prisma: PrismaClient) {
  const prismaSeeder = new PrismaSeeder(prisma);

  const postData = await getPostMocks();

  await prismaSeeder.seedUsers(userData);
  await prismaSeeder.seedCategories(categoryData);
  await prismaSeeder.seedMockPosts(postData);
  await prismaSeeder.seedMockComments(commentData);
}
