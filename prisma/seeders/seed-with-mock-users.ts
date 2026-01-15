import { userData } from 'data/seed-data';
import { PrismaClient } from 'prisma/generated/client';
import { PrismaSeeder } from './prisma-seeder';

export async function seedWithMockUsers(prisma: PrismaClient) {
  const prismaSeeder = new PrismaSeeder(prisma);

  await prismaSeeder.seedUsers(userData);
}
