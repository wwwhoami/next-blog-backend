import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PostService } from 'src/post/post.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { GetCategoryDto } from './dto/get-category-dto';
import { CategoryEntity } from './entities/category.entity';

@Injectable()
export class CategoryRepository {
  constructor(
    private prisma: PrismaService,
    private postService: PostService,
  ) {}

  async getCategories({
    take = undefined,
    skip = undefined,
  }: GetCategoryDto): Promise<CategoryEntity[]> {
    return await this.prisma.category.findMany({
      select: {
        name: true,
        hexColor: true,
      },
      take,
      skip,
    });
  }

  async getCategoryCombinations(): Promise<string[][]> {
    const categoryComb = await this.prisma.$queryRaw<
      Record<'category_list', string>[]
    >`
      WITH T AS (
        SELECT
            "public"."PostToCategory"."post_id",
            STRING_AGG (category_name, ',') category_list
        FROM
            "public"."PostToCategory"
        GROUP BY
            "public"."PostToCategory"."post_id"
      )
      SELECT
          DISTINCT T.category_list
      FROM T`;

    const categoryLists = categoryComb.map((category) =>
      category.category_list.split(','),
    );

    return categoryLists;
  }

  async getCategoryCombinationsForSearchTerm(
    searchTerm: string,
  ): Promise<string[][]> {
    const postIds = (await this.postService.getPostIds({ searchTerm })).map(
      (post) => post.id,
    );

    if (postIds.length === 0) return [];

    const categoryComb = await this.prisma.$queryRaw<
      Record<'category_list', string>[]
    >`
        WITH T AS (
          SELECT
              "public"."PostToCategory"."post_id",
              STRING_AGG (category_name, ',') category_list
          FROM
              "public"."PostToCategory"
          WHERE "public"."PostToCategory"."post_id" IN (${Prisma.join(postIds)})
          GROUP BY
              "public"."PostToCategory"."post_id"
        )
        SELECT
            DISTINCT T.category_list
        FROM T`;

    const categoryLists = categoryComb.map((category) =>
      category.category_list.split(','),
    );

    return categoryLists;
  }
}
