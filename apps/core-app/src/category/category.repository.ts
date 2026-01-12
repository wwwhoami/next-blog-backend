import { PrismaService } from '@app/prisma';
import { PostRepository } from '@core/src/post/post.repository';
import { Injectable } from '@nestjs/common';
import { Prisma } from 'prisma/generated/client';
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
   * @param {string} categories - Categories to find available combinations for
   * @description
   * Get all categories, able to combine with provided categories.
   * (When any post tagged with these categories exists)
   */
  async getCombinations(categories?: string): Promise<string[]> {
    // Return all categories if no categories provided
    if (!categories?.length)
      return (await this.getMany()).map((category) => category.name);

    const categoryCombinationsList = await this.prisma.$queryRaw<
      Array<Record<'category_name', string>>
    >`WITH T AS (
        SELECT
            "public"."PostToCategory"."post_id",
            ARRAY_AGG (category_name) category_list
        FROM
            "public"."PostToCategory"
        GROUP BY
            "public"."PostToCategory"."post_id"
      ), A AS (
        SELECT
            DISTINCT T.category_list
        FROM 
            T
        WHERE 
            T.category_list @> string_to_array(${categories}, ' ')
      )
      SELECT
          DISTINCT unnest(A.category_list) as category_name
      FROM A`;

    // Format category combinations
    const categoryCombinations = categoryCombinationsList.map(
      (category) => category.category_name,
    );

    return categoryCombinations;
  }

  /**
   * @param {string} searchTerm - Search term to filter categories by
   * @description
   *  Get all categories, able to combine with provided categories.
   * (When any post tagged with these categories and matching searchTerm exists)
   */
  async getCombinationsForSearchTerm({
    categories,
    searchTerm,
  }: {
    categories?: string;
    searchTerm: string;
  }): Promise<string[]> {
    const prismaSql = categories?.length
      ? // If categories provided, get categories that match searchTerm
        // and are able to make combinations with provided categories
        Prisma.sql`, A AS (
        SELECT
          DISTINCT T.category_list
        FROM T
        WHERE 
          T.category_list @> string_to_array(${categories}, ' ')
      )
      SELECT
        DISTINCT unnest(A.category_list) as category_name
      FROM A`
      : // If no categories provided, get all categories for the searchTerm provided
        Prisma.sql`
      SELECT
          DISTINCT unnest(T.category_list) as category_name
      FROM T`;

    // Get post ids that match search term
    const postIds = (await this.postRepository.findIds({ searchTerm })).map(
      (post) => post.id,
    );

    // Return empty array if no posts match search term
    if (postIds.length === 0) return [];

    // Get category combinations for posts that match search term
    const categoryCombinationsList = await this.prisma.$queryRaw<
      Array<Record<'category_name', string>>
    >`
      WITH T AS (
        SELECT
            "public"."PostToCategory"."post_id",
            ARRAY_AGG (category_name) category_list
        FROM
            "public"."PostToCategory"
        WHERE "public"."PostToCategory"."post_id" IN (${Prisma.join(postIds)})
        GROUP BY
            "public"."PostToCategory"."post_id"
      )${prismaSql}`;

    // Format category combinations
    const categoryCombinations = categoryCombinationsList.map(
      (category) => category.category_name,
    );

    return categoryCombinations;
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
