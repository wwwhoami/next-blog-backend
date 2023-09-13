import { PrismaClient } from '@prisma/client';
import { userData } from 'data/seed-data';
import { PrismaSeeder } from './prisma-seeder';

export async function seedWithMockUsers(prisma: PrismaClient) {
  const prismaSeeder = new PrismaSeeder(prisma);

  await prismaSeeder.seedUsers(userData);
}
