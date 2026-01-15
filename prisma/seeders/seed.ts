import '@dotenvx/dotenvx/config';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  generateCategories,
  generateComments,
  generatePosts,
  generatePostToCategory,
  generateUsers,
  generateUuid,
} from 'data/data-gen';
import { getPostMocks } from 'data/post';
import { categoryData, commentData, userData } from 'data/seed-data';
import { Pool } from 'pg';
import { PrismaClient } from 'prisma/generated/client';
import { PrismaSeeder } from './prisma-seeder';

const pool = new Pool({ connectionString: process.env.POSTGRES_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  const prismaSeeder = new PrismaSeeder(prisma);

  // Parse optional env variables
  const handmadeData = parseInt(process.env.HANDMADE_DATA || '') || 1;
  const userDataCount = parseInt(process.env.USER_COUNT || '') || 100;
  const postDataCount = parseInt(process.env.POST_COUNT || '') || 1000;
  const categoryDataCount = parseInt(process.env.CATEGORY_COUNT || '') || 20;
  const commentDataCount = parseInt(process.env.COMMENT_COUNT || '') || 2000;

  // Print data counts
  console.log('Generating data with the following counts:');
  console.log(`Users: ${userDataCount}`);
  console.log(`Posts: ${postDataCount}`);
  console.log(`Categories: ${categoryDataCount}`);
  console.log(`Comments: ${commentDataCount}`);

  const timeTakenToGenerate = 'Data generated in';
  const timeTakenToGetMocks = 'Data mocks read in';
  const timeTakenDb = 'Seeded db in';
  const timeTakenUsers = 'Seeded users in';
  const timeTakenCategories = 'Seeded categories in';
  const timeTakenPosts = 'Seeded posts in';
  const timeTakenComments = 'Seeded comments in';
  const timeTakenPostToCategory = 'Linked posts with categories in';

  console.time(timeTakenToGetMocks);
  console.log('Mock data reading 📚');

  const postData = await getPostMocks();

  console.timeEnd(timeTakenToGetMocks);

  console.log('Data generating ⚙️');
  console.time(timeTakenToGenerate);

  // Generate random data
  const randUuids = generateUuid(userDataCount);
  const randUserData = await generateUsers(userDataCount, randUuids);
  const randPostData = await generatePosts(postDataCount, randUuids);
  const randCategoryData = await generateCategories(categoryDataCount);
  const randCommentData = await generateComments(
    commentDataCount,
    randUuids,
    postDataCount,
  );

  if (handmadeData) {
    randUserData.push(...userData);
    randCategoryData.push(...categoryData);
  }

  const randPostToCategoryData = await generatePostToCategory(
    randCategoryData,
    randPostData.length,
  );

  console.timeEnd(timeTakenToGenerate);

  // Seed database
  console.log(`Seeding database 🌱`);
  console.time(timeTakenDb);

  // Seed users
  console.log('Seeding users 🤓');
  console.time(timeTakenUsers);
  const createdUsers = prismaSeeder.seedUsers(randUserData).then(() => {
    console.timeEnd(timeTakenUsers);
  });

  // Seed categories
  console.log('Seeding categories 🏷️');
  console.time(timeTakenCategories);
  const createdCategories = prismaSeeder
    .seedCategories(randCategoryData)
    .then(() => {
      console.timeEnd(timeTakenCategories);
    });

  // Seed posts after users and categories are created
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

  // Seed post to category after posts and categories are created
  const createdPostToCategory = Promise.all([createdPosts, createdCategories])
    .then(() => {
      console.log('Linking posts with categories 🔗');

      console.time(timeTakenPostToCategory);
      prismaSeeder.seedPostToCategory(randPostToCategoryData);
    })
    .then(() => {
      console.timeEnd(timeTakenPostToCategory);
    });

  // Seed comments after posts are created
  const createdComments = createdPosts
    .then(async () => {
      console.log('Seeding comments 💬');
      console.time(timeTakenComments);

      await prismaSeeder.seedComments(randCommentData).then(() => {
        prismaSeeder.seedMockComments(commentData);
      });
    })
    .then(() => {
      console.timeEnd(timeTakenComments);
    });

  // Wait for all promises to resolve, log time taken to seed db
  Promise.all([
    createdUsers,
    createdCategories,
    createdPosts,
    createdPostToCategory,
    createdComments,
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
