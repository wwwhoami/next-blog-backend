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

async function createUsers(users: Prisma.UserCreateWithoutPostsInput[]) {
  await prisma.user.createMany({
    data: users,
  });
}

async function createCategories(categories: Prisma.CategoryCreateInput[]) {
  await prisma.category.createMany({
    data: categories,
  });
}

async function createMockPosts(posts: Prisma.PostCreateInput[]) {
  for (const p of posts) {
    await prisma.post.create({
      data: p,
    });
  }
}

async function createPosts(posts: Prisma.PostCreateManyInput[]) {
  await prisma.post.createMany({
    data: posts,
  });
}

async function createPostToCategory(
  postToCategory: Prisma.PostToCategoryCreateManyInput[],
) {
  await prisma.postToCategory.createMany({
    data: postToCategory,
  });
}

async function main() {
  const handmadeData = 1;
  const userDataCount = 100;
  const postDataCount = 1000;
  const categoryDataCount = 20;

  const postData = await getMockPostData();

  console.log('Data generating ⚙️');

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

  console.log('Data generation completed ✅');

  const timeTakenDb = 'Seeded db in ';
  const timeTakenUsers = 'Seeded users in ';
  const timeTakenCategories = 'Seeded categories in ';
  const timeTakenPosts = 'Seeded posts in ';
  const timeTakenPostToCategory = 'Linked posts with categories in ';

  console.log(`Seeding database 🌱`);
  console.time(timeTakenDb);

  console.log('Seeding users 🙎‍♂️');
  console.time(timeTakenUsers);
  const createdUsers = createUsers(randUserData);
  createdUsers.then(() => {
    console.timeEnd(timeTakenUsers);
  });

  console.log('Seeding categories 🏷️');
  console.time(timeTakenCategories);
  const createdCategories = createCategories(randCategoryData);
  createdCategories.then(() => {
    console.timeEnd(timeTakenCategories);
  });

  const createdPosts = Promise.all([createdUsers, createdCategories])
    .then(async () => {
      console.log('Seeding posts 📝');
      console.time(timeTakenPosts);
      const createdPosts = createPosts(randPostData);
      const createdMockPosts = createMockPosts(postData);

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
    createPostToCategory(randPostToCategoryData);
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
    console.timeEnd(timeTakenDb);
    console.log(`Seeding completed ✅`);
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
