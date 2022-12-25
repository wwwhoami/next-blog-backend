import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreatePostDto } from './dto/create-post.dto';
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
    const ordering =
      order === 'desc'
        ? Prisma.sql`${orderBy} DESC`
        : Prisma.sql`${orderBy} ASC`;

    return this.prisma.$queryRaw`
      SELECT
        id
      FROM
        "Post"
      WHERE
        title % ${searchTerm} OR 
        excerpt % ${searchTerm}
      ORDER BY
        title <-> ${searchTerm},
        excerpt <-> ${searchTerm},
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
        title % ${searchTerm}
        OR excerpt % ${searchTerm}
      GROUP BY
        p.id,
        u."name",
        u.image
      ORDER BY
        title <-> ${searchTerm},
        excerpt <-> ${searchTerm},
        ${ordering}
      LIMIT ${take}
      OFFSET ${skip}`;
  }

  async getPostsByCategories({
    take = 10,
    skip = 0,
    orderBy = 'createdAt',
    order = 'desc',
    content = false,
    category,
  }: GetPostsByCategoriesDto): Promise<PostEntity[]> {
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
        json_build_object('name', u."name", 'image', u.image) AS author,
        array_to_json(array_agg(json_build_object('category', json_build_object('name', c. "name", 'hexColor', c.hex_color)))) AS categories
      FROM
        "Post" AS p
        JOIN "User" AS u ON p.author_id = u.id
        JOIN "PostToCategory" AS ptc ON ptc.post_id = p.id
        JOIN "Category" AS c ON c.name = ptc.category_name
      WHERE
        p.published = TRUE
        AND p.id IN(
            SELECT
                p1.id
            FROM
              (
              SELECT
                p2.id,
                array_agg(LOWER(ptc1.category_name)) AS category_names
              FROM
                "Post" AS p2
              JOIN "PostToCategory" AS ptc1 ON
                (ptc1.post_id) = (p2.id)
              GROUP BY
                p2.id) AS p1
            WHERE
              p1.id IS NOT NULL
              AND p1.category_names @> string_to_array(${category}, ' '))
      GROUP BY
        p.id,
        u.name,
        u.image
      ORDER BY
        ${ordering}
      LIMIT ${take}
      OFFSET ${skip}`;
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
        json_build_object('name', u."name", 'image', u.image) AS author,
        array_to_json(array_agg(json_build_object('category', json_build_object('name', c. "name", 'hexColor', c.hex_color)))) AS categories
      FROM
        "Post" AS p
        JOIN "User" AS u ON p.author_id = u.id
        JOIN "PostToCategory" AS ptc ON ptc.post_id = p.id
        JOIN "Category" AS c ON c.name = ptc.category_name
      WHERE
        p.published = TRUE
        AND p.id IN(
            SELECT
                p1.id
            FROM
              (
              SELECT
                p2.id,
                array_agg(LOWER(ptc1.category_name)) AS category_names
              FROM
                "Post" AS p2
              JOIN "PostToCategory" AS ptc1 ON
                (ptc1.post_id) = (p2.id)
              GROUP BY
                p2.id) AS p1
            WHERE
              p1.id IS NOT NULL
              AND p1.category_names @> string_to_array(${category}, ' '))
        AND (title % ${searchTerm}
        OR excerpt % ${searchTerm})
      GROUP BY
        p.id,
        u.name,
        u.image
      ORDER BY
        title <-> ${searchTerm},
        excerpt <-> ${searchTerm},
        ${ordering}
      LIMIT ${take}
      OFFSET ${skip}`;
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

  async createPost(
    postData: CreatePostDto,
    authorId: string,
    categoryNames: string[],
  ) {
    return this.prisma.post.create({
      data: {
        ...postData,
        authorId,
        categories: {
          createMany: {
            data: categoryNames.map((categoryName) => ({
              categoryName,
            })),
          },
        },
      },
      select: {
        ...selectPostWithAuthorCategories,
        content: true,
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
