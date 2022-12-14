import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import slugify from 'slugify';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreatePostDto } from './dto/create-post.dto';
import {
  GetPostDto,
  GetPostsByCategoriesDto,
  SearchPostDto,
  SearchPostsByCategoriesDto,
} from './dto/get-post.dto';
import { UpdatePostDto } from './dto/update-post.dto';
import { PostEntity } from './entities/post.entity';
import { selectPostWithAuthorCategories } from './utils/select.objects';

@Injectable()
export class PostRepository {
  constructor(private prisma: PrismaService) {}

  async getIds({
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

  async findIds({
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

  async getMany({
    take = 10,
    skip = 0,
    orderBy = 'createdAt',
    order = 'desc',
    content = false,
  }: GetPostDto): Promise<PostEntity[]> {
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

  async findMany({
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

  async getManyByCategories({
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

  async findManyByCategories({
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

  async getSlugsForPublished(): Promise<{ slug: string }[]> {
    return this.prisma.post.findMany({
      select: {
        slug: true,
      },
      where: {
        published: true,
      },
    });
  }

  async getOnePublishedBySlug(slug: string): Promise<PostEntity> {
    return this.prisma.post.findFirstOrThrow({
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

  async getAuthorById(id: number): Promise<{ authorId: string }> {
    return this.prisma.post.findUniqueOrThrow({
      select: {
        authorId: true,
      },
      where: {
        id,
      },
    });
  }

  async getAuthorBySlug(slug: string): Promise<{ authorId: string }> {
    return this.prisma.post.findUniqueOrThrow({
      select: {
        authorId: true,
      },
      where: {
        slug,
      },
    });
  }

  async publishOneBySlug(slug: string): Promise<PostEntity> {
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

  async create(post: CreatePostDto, authorId: string): Promise<PostEntity> {
    const { categories, ...postData } = post;
    const slug = slugify(postData.title, { lower: true });

    return this.prisma.post.create({
      data: {
        ...postData,
        slug,
        authorId,
        categories: {
          create: categories?.map((category) => ({
            category: {
              connectOrCreate: {
                where: { name: category.name },
                create: category,
              },
            },
          })),
        },
      },
      select: {
        ...selectPostWithAuthorCategories,
        content: true,
      },
    });
  }

  async update(id: number, post: UpdatePostDto): Promise<PostEntity> {
    const { categories, ...postData } = post;
    const slug = slugify(postData.title, { lower: true });

    return this.prisma.post.update({
      where: {
        id,
      },
      data: {
        ...postData,
        slug,
        categories: {
          deleteMany: {
            categoryName: {
              notIn: categories?.map((category) => category.name),
            },
          },
          upsert: categories?.map((category) => ({
            where: {
              postId_categoryName: {
                postId: id,
                categoryName: category.name,
              },
            },
            update: {},
            create: {
              category: {
                connectOrCreate: {
                  where: { name: category.name },
                  create: category,
                },
              },
            },
          })),
        },
      },
      select: {
        ...selectPostWithAuthorCategories,
        content: true,
      },
    });
  }

  async deleteById(id: number): Promise<PostEntity> {
    return this.prisma.post.delete({
      where: {
        id,
      },
      select: {
        ...selectPostWithAuthorCategories,
      },
    });
  }

  async deleteBySlug(slug: string): Promise<PostEntity> {
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
