import { PrismaClient } from '@prisma/client';
import { getPostMocks } from 'data/post';
import { categoryData, commentData, userData } from 'data/seed-data';
import { PrismaSeeder } from './seeders';

export async function seedWithMocks(prisma: PrismaClient) {
  const prismaSeeder = new PrismaSeeder(prisma);

  const postData = await getPostMocks();

  await prismaSeeder.seedUsers(userData);
  await prismaSeeder.seedCategories(categoryData);
  await prismaSeeder.seedMockPosts(postData);
  await prismaSeeder.seedMockComments(commentData);
}
