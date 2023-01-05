import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PostRepository } from 'src/post/post.repository';
import { PrismaService } from 'src/prisma/prisma.service';
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

  getMany({
    take = 25,
    skip = 0,
  }: GetCategoryDto): Promise<CategoryNoDescription[]> {
    return this.prisma.category.findMany({
      select: {
        name: true,
        hexColor: true,
      },
      take,
      skip,
    });
  }

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

    return categories.map((category) => ({
      name: category.name,
      description: category.description,
      hexColor: category.hexColor,
      hotness: category._count.PostToCategory,
    }));
  }

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

    const categoryLists = categoryComb.map((category) =>
      category.category_list.split(','),
    );

    return categoryLists;
  }

  async getCombinationsForSearchTerm(searchTerm: string): Promise<string[][]> {
    const postIds = (await this.postRepository.findIds({ searchTerm })).map(
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

  create(category: CreateCategoriesDto) {
    return this.prisma.category.createMany({
      data: category.categories,
      skipDuplicates: true,
    });
  }
}
