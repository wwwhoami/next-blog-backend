import { PrismaClient } from '@prisma/client';
import {
  generateCategories,
  generatePosts,
  generatePostToCategory,
  generateUsers,
  generateUuid,
} from 'data/data-gen';
import { getMockPostData } from 'data/post';
import { categoryData, userData } from 'data/seed-data';
import { PrismaSeeder } from './seeders';

const prisma = new PrismaClient();

async function main() {
  const prismaSeeder = new PrismaSeeder(prisma);

  const handmadeData = parseInt(process.env.HANDMADE_DATA || '') || 1;
  const userDataCount = parseInt(process.env.USER_COUNT || '') || 100;
  const postDataCount = parseInt(process.env.POST_COUNT || '') || 1000;
  const categoryDataCount = parseInt(process.env.CATEGORY_COUNT || '') || 20;

  const timeTakenToGenerate = 'Data generated in';
  const timeTakenToGetMocks = 'Data mocks read in';
  const timeTakenDb = 'Seeded db in';
  const timeTakenUsers = 'Seeded users in';
  const timeTakenCategories = 'Seeded categories in';
  const timeTakenPosts = 'Seeded posts in';
  const timeTakenPostToCategory = 'Linked posts with categories in';

  console.time(timeTakenToGetMocks);
  console.log('Mock data reading 📚');

  const postData = await getMockPostData();

  console.timeEnd(timeTakenToGetMocks);

  console.log('Data generating ⚙️');
  console.time(timeTakenToGenerate);

  const randUuids = generateUuid(userDataCount);
  const randUserData = await generateUsers(userDataCount, randUuids);
  const randPostData = await generatePosts(postDataCount, randUuids);
  const randCategoryData = await generateCategories(categoryDataCount);

  if (handmadeData) {
    randUserData.push(...userData);
    randCategoryData.push(...categoryData);
  }

  const randPostToCategoryData = await generatePostToCategory(
    randCategoryData,
    randPostData.length,
  );

  console.timeEnd(timeTakenToGenerate);

  console.log(`Seeding database 🌱`);
  console.time(timeTakenDb);

  console.log('Seeding users 🤓');
  console.time(timeTakenUsers);
  const createdUsers = prismaSeeder.seedUsers(randUserData);
  createdUsers.then(() => {
    console.timeEnd(timeTakenUsers);
  });

  console.log('Seeding categories 🏷️');
  console.time(timeTakenCategories);
  const createdCategories = prismaSeeder.seedCategories(randCategoryData);
  createdCategories.then(() => {
    console.timeEnd(timeTakenCategories);
  });

  const createdPosts = Promise.all([createdUsers, createdCategories])
    .then(async () => {
      console.log('Seeding posts 📝');
      console.time(timeTakenPosts);

      await prismaSeeder.seedPosts(randPostData).then(() => {
        prismaSeeder.seedMockPosts(postData);
      });
    })
    .then(() => {
      console.timeEnd(timeTakenPosts);
    });

  const createdPostToCategory = Promise.all([
    createdPosts,
    createdCategories,
  ]).then(() => {
    console.log('Linking posts with categories 🔗');

    console.time(timeTakenPostToCategory);
    prismaSeeder.seedPostToCategory(randPostToCategoryData);
  });

  createdPostToCategory.then(() => {
    console.timeEnd(timeTakenPostToCategory);
  });

  Promise.all([
    createdUsers,
    createdCategories,
    createdPosts,
    createdPostToCategory,
  ]).then(() => {
    console.log(`Seeding complete ✅`);
    console.timeEnd(timeTakenDb);
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
