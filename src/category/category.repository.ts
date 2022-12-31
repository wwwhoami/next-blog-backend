import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PostRepository } from 'src/post/post.repository';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateCategoriesDto } from './dto/create-category.dto';
import { GetCategoryDto } from './dto/get-category-dto';
import { CategoryEntity } from './entities/category.entity';

@Injectable()
export class CategoryRepository {
  constructor(
    private prisma: PrismaService,
    private postRepository: PostRepository,
  ) {}

  getMany({
    take = undefined,
    skip = undefined,
  }: GetCategoryDto): Promise<CategoryEntity[]> {
    return this.prisma.category.findMany({
      select: {
        name: true,
        hexColor: true,
      },
      take,
      skip,
    });
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
