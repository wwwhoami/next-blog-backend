import { Prisma, PrismaClient } from '@prisma/client';
import {
  generateCategories,
  generatePosts,
  generatePostToCategory,
  generateUsers,
  generateUuid,
} from 'data/data-gen';
import { getMockPostData } from 'data/post';
import { categoryData, userData } from 'data/seed-data';

const prisma = new PrismaClient();

async function seedUsers(users: Prisma.UserCreateWithoutPostsInput[]) {
  await prisma.user.createMany({
    data: users,
  });
}

async function seedCategories(categories: Prisma.CategoryCreateInput[]) {
  await prisma.category.createMany({
    data: categories,
  });
}

async function seedMockPosts(posts: Prisma.PostCreateInput[]) {
  for (const p of posts) {
    await prisma.post.create({
      data: p,
    });
  }
}

async function seedPosts(posts: Prisma.PostCreateManyInput[]) {
  await prisma.post.createMany({
    data: posts,
  });
}

async function seedPostToCategory(
  postToCategory: Prisma.PostToCategoryCreateManyInput[],
) {
  await prisma.postToCategory.createMany({
    data: postToCategory,
  });
}

async function main() {
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
  const createdUsers = seedUsers(randUserData);
  createdUsers.then(() => {
    console.timeEnd(timeTakenUsers);
  });

  console.log('Seeding categories 🏷️');
  console.time(timeTakenCategories);
  const createdCategories = seedCategories(randCategoryData);
  createdCategories.then(() => {
    console.timeEnd(timeTakenCategories);
  });

  const createdPosts = Promise.all([createdUsers, createdCategories])
    .then(async () => {
      console.log('Seeding posts 📝');
      console.time(timeTakenPosts);
      const createdPosts = seedPosts(randPostData);
      const createdMockPosts = seedMockPosts(postData);

      await Promise.all([createdPosts, createdMockPosts]);
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
    seedPostToCategory(randPostToCategoryData);
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
