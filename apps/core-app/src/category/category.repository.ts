import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PostRepository } from '@core/src/post/post.repository';
import { PrismaService } from '@core/src/prisma/prisma.service';
import { CreateCategoriesDto } from './dto/create-category.dto';
import { FindCategoryDto, GetCategoryDto } from './dto/get-category-dto';
import {
  CategoryNoDescription,
  CategoryWithHotness,
} from './entities/category.entity';

@Injectable()
export class CategoryRepository {
  constructor(
    private prisma: PrismaService,
    private postRepository: PostRepository,
  ) {}

  /**
   * @param {GetCategoryDto} getCategoryOptions - Options for getting categories
   * @description Get categories with no description
   */
  getMany({ take = 25, skip = 0 }: GetCategoryDto = {}): Promise<
    CategoryNoDescription[]
  > {
    return this.prisma.category.findMany({
      select: {
        name: true,
        hexColor: true,
      },
      take,
      skip,
    });
  }

  /**
   * @param {FindCategoryDto} findCategoryOptions - Options for finding categories
   * @description Find categories with description and hotness score
   */
  async findMany({
    take = 25,
    skip = 0,
    searchTerm,
  }: FindCategoryDto): Promise<CategoryWithHotness[]> {
    const categories = await this.prisma.category.findMany({
      select: {
        name: true,
        description: true,
        hexColor: true,
        _count: {
          select: {
            PostToCategory: true,
          },
        },
      },
      where: {
        name: {
          startsWith: searchTerm,
          mode: 'insensitive',
        },
      },
      take,
      skip,
      orderBy: {
        PostToCategory: {
          _count: 'desc',
        },
      },
    });

    // Format categories to include hotness score
    return categories.map((category) => ({
      name: category.name,
      description: category.description,
      hexColor: category.hexColor,
      hotness: category._count.PostToCategory,
    }));
  }

  /**
   * @description Get all category combinations
   */
  async getCombinations(): Promise<string[][]> {
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

    // Split category list into array of categories for each category
    const categoryLists = categoryComb.map((category) =>
      category.category_list.split(','),
    );

    return categoryLists;
  }

  /**
   * @param {string} searchTerm - Search term to filter categories by
   * @description Get category combinations for posts that match search term
   */
  async getCombinationsForSearchTerm(searchTerm: string): Promise<string[][]> {
    // Get post ids that match search term
    const postIds = (await this.postRepository.findIds({ searchTerm })).map(
      (post) => post.id,
    );

    // Return empty array if no posts match search term
    if (postIds.length === 0) return [];

    // Get category combinations for posts that match search term
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

    // Split category list into array of categories for each category
    const categoryLists = categoryComb.map((category) =>
      category.category_list.split(','),
    );

    return categoryLists;
  }

  /**
   * @param {CreateCategoriesDto} category - Categories to create
   * @description Create categories
   */
  create(category: CreateCategoriesDto) {
    return this.prisma.category.createMany({
      data: category.categories,
      skipDuplicates: true,
    });
  }
}
