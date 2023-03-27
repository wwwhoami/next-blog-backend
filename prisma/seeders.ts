import { Prisma, PrismaClient } from '@prisma/client';

export class PrismaSeeder {
  constructor(private prisma: PrismaClient) {}

  async seedUsers(users: Prisma.UserCreateWithoutPostsInput[]) {
    await this.prisma.user.createMany({
      data: users,
    });
  }

  async seedCategories(categories: Prisma.CategoryCreateInput[]) {
    await this.prisma.category.createMany({
      data: categories,
    });
  }

  async seedMockPosts(
    posts: Prisma.PostCreateInput[] | Prisma.PostUncheckedCreateInput[],
  ) {
    for (const p of posts) {
      await this.prisma.post.create({
        data: p,
      });
    }
  }

  async seedPosts(posts: Prisma.PostCreateManyInput[]) {
    await this.prisma.post.createMany({
      data: posts,
    });
  }

  async seedPostToCategory(
    postToCategory: Prisma.PostToCategoryCreateManyInput[],
  ) {
    await this.prisma.postToCategory.createMany({
      data: postToCategory,
    });
  }

  async seedMockComments(comments: Prisma.CommentCreateInput[]) {
    for (const c of comments) {
      await this.prisma.comment.create({
        data: c,
      });
    }
  }

  async seedComments(comments: Prisma.CommentCreateManyInput[]) {
    await this.prisma.comment.createMany({
      data: comments,
    });
  }
}
