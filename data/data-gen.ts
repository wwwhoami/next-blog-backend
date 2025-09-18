import { faker } from '@faker-js/faker';
import { Prisma } from '@prisma/client';
import { UniqueEnforcer } from 'enforce-unique';
import slugify from 'slugify';
import { getMockSlugs, getRandomPostMockContent } from './mdx';

export function generateUuid(count: number) {
  if (count <= 0) throw new Error('Count should be positive integer');

  const uniqueUUIDEnforcer = new UniqueEnforcer();

  const uuids: string[] = [];
  while (count > 0) {
    uuids.push(uniqueUUIDEnforcer.enforce(() => faker.string.uuid()));
    count--;
  }
  return uuids;
}

export async function generateUsers(count: number, uuids: string[]) {
  if (count <= 0) throw new Error('Count should be positive integer');

  const userData: Prisma.UserCreateWithoutPostsInput[] = [];

  const uniqueNameEnforcer = new UniqueEnforcer();
  const uniqueEmailEnforcer = new UniqueEnforcer();

  while (count > 0) {
    userData.push({
      id: uuids[count - 1],
      name: uniqueNameEnforcer.enforce(() => faker.person.firstName()),
      email: uniqueEmailEnforcer.enforce(() => faker.internet.email()),
      password: '$2a$12$lCGhm3HSmjkFJFtViSPpSemPLvSGpak1ljgC5WyGoIh/l5Igfyl/K',
      image: faker.image.avatar(),
    });
    count--;
  }

  return userData;
}

export async function generateCategories(count: number) {
  if (count <= 0) throw new Error('Count should be positive integer');

  const categoryData: Prisma.CategoryCreateInput[] = [];

  const uniqueCategoryNameEnforcer = new UniqueEnforcer();
  const uniqueHexColorEnforcer = new UniqueEnforcer();

  while (count > 0) {
    categoryData.push({
      name: uniqueCategoryNameEnforcer.enforce(() =>
        faker.lorem.word({ length: { min: 3, max: 10 } }),
      ),
      description: faker.lorem.sentence(),
      hexColor: uniqueHexColorEnforcer.enforce(() =>
        faker.color.rgb({ format: 'hex' }),
      ),
    });
    count--;
  }

  return categoryData;
}

export async function generatePosts(count: number, uuids: string[]) {
  if (count <= 0) throw new Error('Count should be positive integer');

  const postData: Prisma.PostCreateManyInput[] = [];
  const slugs = await getMockSlugs();
  const contents = await getRandomPostMockContent(slugs, count);

  const uniquePostTitleEnforcer = new UniqueEnforcer();

  for (let i = 0; i < count; i++) {
    const randTitle = uniquePostTitleEnforcer.enforce(() =>
      faker.lorem.sentence(3),
    );
    postData.push({
      createdAt: faker.date.between({
        from: 1589315917000,
        to: 1620851917000,
      }),
      title: randTitle,
      slug: slugify(randTitle, { lower: true }),
      excerpt: faker.lorem.sentence(15),
      content: contents[i],
      published: true,
      coverImage: faker.image.urlPicsumPhotos(),
      authorId: uuids[Math.floor(Math.random() * (uuids.length - 1) + 1)],
    });
  }

  return postData;
}

function getMeRandomElements<T>(sourceArray: Array<T>, maxLength: number) {
  const result = [];
  const resultLength = Math.floor(Math.random() * (maxLength - 1) + 1);

  for (let i = 0; i < resultLength; i++) {
    result.push(sourceArray[Math.floor(Math.random() * sourceArray.length)]);
  }

  // Removing duplicates using set
  return Array.from(new Set(result).values());
}

export async function generatePostToCategory(
  categories: Prisma.CategoryCreateInput[],
  generatedPostsCount: number,
) {
  const postToCount: Prisma.PostToCategoryCreateManyInput[] = [];

  while (generatedPostsCount > 0) {
    const randCategories = getMeRandomElements(categories, 3);

    randCategories.forEach((category) => {
      postToCount.push({
        postId: generatedPostsCount,
        categoryName: category.name,
      });
    });
    generatedPostsCount--;
  }

  return postToCount;
}

export async function generateComments(
  count: number,
  authorUuids: string[],
  generatedPostsCount: number,
) {
  if (count <= 0) throw new Error('Count should be positive integer');

  const commentData: Prisma.CommentCreateManyInput[] = [];

  while (count > 0) {
    commentData.push({
      createdAt: faker.date.between({
        from: 1589315917000,
        to: 1620851917000,
      }),
      content: faker.lorem.paragraph(),
      postId: Math.floor(Math.random() * (generatedPostsCount - 1) + 1),
      authorId:
        authorUuids[Math.floor(Math.random() * (authorUuids.length - 1) + 1)],
    });
    count--;
  }

  return commentData;
}
