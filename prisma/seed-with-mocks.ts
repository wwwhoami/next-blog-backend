import { PrismaClient } from '@prisma/client';
import { getPostMocksWithId } from 'data/post';
import { categoryData, userData } from 'data/seed-data';
import { PrismaSeeder } from './seeders';

export async function seedWithMocks(prisma: PrismaClient) {
  const prismaSeeder = new PrismaSeeder(prisma);
  const postData = await getPostMocksWithId();

  await prismaSeeder.seedUsers(userData);
  await prismaSeeder.seedCategories(categoryData);
  await prismaSeeder.seedMockPosts(postData);
}
