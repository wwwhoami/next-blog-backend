import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import {
  GetPostDto,
  GetPostsByCategoriesDto,
  SearchPostDto,
  SearchPostsByCategoriesDto,
} from './dto/get-post.dto';
import { PostEntity } from './entities/post.entity';
import { selectPostWithAuthorCategories } from './utils/select.objects';

@Injectable()
export class PostRepository {
  constructor(private prisma: PrismaService) {}

  async getPostIds({
    take = 10,
    skip = 0,
    orderBy = 'createdAt',
    order = 'desc',
  }: GetPostDto): Promise<{ id: number }[]> {
    return this.prisma.post.findMany({
      select: {
        id: true,
      },
      where: {
        published: true,
      },
      orderBy: { [orderBy]: order },
      take,
      skip,
    });
  }

  async findPostIds({
    take = 10,
    skip = 0,
    orderBy = 'createdAt',
    order = 'desc',
    searchTerm,
  }: SearchPostDto): Promise<{ id: number }[]> {
    const search = searchTerm.split(' ').join(' ');
    const ordering =
      order === 'desc'
        ? Prisma.sql`ORDER BY 
        title <-> ${search},
        excerpt <-> ${search},
        ${orderBy} DESC`
        : Prisma.sql`ORDER BY 
        title <-> ${search},
        excerpt <-> ${search},
        ${orderBy} ASC`;

    return this.prisma.$queryRaw`
      SELECT
        id
      FROM
        "Post"
      WHERE
        title % ${search} OR 
        excerpt % ${search}
      ${ordering}
      LIMIT ${take}
      OFFSET ${skip}`;
  }

  async getPosts({
    take = 10,
    skip = 0,
    orderBy = 'createdAt',
    order = 'desc',
    content = false,
  }: GetPostDto) {
    return this.prisma.post.findMany({
      select: {
        ...selectPostWithAuthorCategories,
        content,
      },
      where: {
        published: true,
      },
      orderBy: { [orderBy]: order },
      take,
      skip,
    });
  }

  async findPosts({
    take = 10,
    skip = 0,
    orderBy = 'createdAt',
    order = 'desc',
    content = false,
    searchTerm,
  }: SearchPostDto): Promise<PostEntity[]> {
    const search = searchTerm.split(' ').join(' ');

    const selectContent = content ? Prisma.sql`content,` : Prisma.sql``;

    const ordering =
      order === 'desc'
        ? Prisma.sql`${orderBy} DESC`
        : Prisma.sql`${orderBy} ASC`;

    return this.prisma.$queryRaw<PostEntity[]>`
      SELECT
        p.id,
        p.created_at,
        p.updated_at,
        p.title,
        p.slug,
        p.excerpt,
        p.view_count,
        p.cover_image,
        ${selectContent}
        json_build_object('name', u. "name", 'image', u.image) AS author,
        array_to_json(array_agg(json_build_object('category', json_build_object('name', c. "name", 'hexColor', c.hex_color)))) AS categories
      FROM
        "Post" AS p
        JOIN "User" AS u ON p.author_id = u.id
        JOIN "PostToCategory" AS ptc ON ptc.post_id = p.id
        JOIN "Category" AS c ON c.name = ptc.category_name
      WHERE
        title % ${search}
        OR excerpt % ${search}
      GROUP BY
        p.id,
        u."name",
        u.image
      ORDER BY
        title <-> ${search},
        excerpt <-> ${search},
        ${ordering}
      LIMIT ${take}
      OFFSET ${skip}`;
  }

  /**
   * Get postIds with cardinality >= categories count
   * @private
   */
  private async getPostsGroupedByIds(categoriesCount: number) {
    return this.prisma.postToCategory.groupBy({
      by: ['postId'],
      having: {
        categoryName: {
          _count: {
            gte: categoriesCount,
          },
        },
      },
    });
  }

  async getPostsByCategories({
    take = 10,
    skip = 0,
    orderBy = 'createdAt',
    order = 'desc',
    content = false,
    category,
  }: GetPostsByCategoriesDto): Promise<PostEntity[]> {
    const categories = category.split(' ');

    // Get postIds with cardinality >= categories count
    const groupedPosts = await this.getPostsGroupedByIds(categories.length);

    if (groupedPosts.length === 0) return [];

    const postIds = groupedPosts.map((data) => data.postId);

    return this.prisma.post.findMany({
      select: {
        ...selectPostWithAuthorCategories,
        content,
      },
      where: {
        id: {
          in: postIds,
        },
        published: true,
        categories: {
          some: {
            categoryName: {
              in: categories,
              mode: 'insensitive',
            },
          },
        },
      },
      orderBy: { [orderBy]: order },
      take,
      skip,
    });
  }

  async findPostsByCategories({
    take = 10,
    skip = 0,
    orderBy = 'createdAt',
    order = 'desc',
    content = false,
    category,
    searchTerm,
  }: SearchPostsByCategoriesDto): Promise<PostEntity[]> {
    const categories = category.split(' ');

    // Get postIds with cardinality >= categories count
    const groupedPosts = await this.getPostsGroupedByIds(categories.length);

    if (groupedPosts.length === 0) return [];

    const search = searchTerm.split(' ').join(' & ');
    const postIds = groupedPosts.map((data) => data.postId);

    return this.prisma.post.findMany({
      select: {
        ...selectPostWithAuthorCategories,
        content,
      },
      where: {
        id: {
          in: postIds,
        },
        published: true,
        categories: {
          some: {
            categoryName: {
              in: categories,
              mode: 'insensitive',
            },
          },
        },
        OR: [
          {
            title: {
              contains: search,
            },
          },
          {
            excerpt: {
              contains: search,
            },
          },
        ],
      },
      orderBy: [
        {
          _relevance: {
            fields: ['title', 'excerpt'],
            search,
            sort: 'desc',
          },
        },
        { [orderBy]: order },
      ],
      take,
      skip,
    });
  }

  async getPublishedPostsSlugs(): Promise<{ slug: string }[]> {
    return this.prisma.post.findMany({
      select: {
        slug: true,
      },
      where: {
        published: true,
      },
    });
  }

  async getPublishedPostBySlug(slug: string): Promise<PostEntity | null> {
    return this.prisma.post.findFirst({
      select: {
        ...selectPostWithAuthorCategories,
        content: true,
      },
      where: {
        slug,
        published: true,
      },
    });
  }

  async publishPostBySlug(slug: string): Promise<PostEntity> {
    return this.prisma.post.update({
      where: {
        slug,
      },
      data: {
        published: true,
      },
      select: {
        ...selectPostWithAuthorCategories,
        content: false,
      },
    });
  }

  async deletePostBySlug(slug: string): Promise<PostEntity> {
    return this.prisma.post.delete({
      where: {
        slug,
      },
      select: {
        ...selectPostWithAuthorCategories,
      },
    });
  }
}
