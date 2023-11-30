import { PrismaService } from '@app/prisma';
import { UserNameImageEntity } from '@core/src/user/entities/user.entity';
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import slugify from 'slugify';
import { CreatePostDto } from './dto/create-post.dto';
import { GetPostDto, PostOrderBy, SearchPostDto } from './dto/get-post.dto';
import { UpdatePostDto } from './dto/update-post.dto';
import { PostEntity, PostLike } from './entities/post.entity';
import { selectPostWithAuthorCategories } from './utils/select.objects';

@Injectable()
export class PostRepository {
  constructor(private prisma: PrismaService) {}

  /**
   * @param {PostOrderBy} orderBy - The field to order by
   * @param {Prisma.SortOrder} order - The order of the field
   * @description This private method is used to pick the ordering of the posts
   */
  private pickOrdering(
    orderBy: PostOrderBy,
    order: Prisma.SortOrder,
  ): Prisma.Sql {
    switch (orderBy) {
      case 'createdAt':
        return order === 'desc'
          ? Prisma.sql`created_at DESC`
          : Prisma.sql`created_at ASC`;
      case 'updatedAt':
        return order === 'desc'
          ? Prisma.sql`updated_at DESC`
          : Prisma.sql`updated_at ASC`;
      case 'id':
        return order === 'desc' ? Prisma.sql`id DESC` : Prisma.sql`id ASC`;
      case 'title':
        return order === 'desc'
          ? Prisma.sql`title DESC`
          : Prisma.sql`title ASC`;
      case 'content':
        return order === 'desc'
          ? Prisma.sql`content DESC`
          : Prisma.sql`content ASC`;
      case 'published':
        return order === 'desc'
          ? Prisma.sql`published DESC`
          : Prisma.sql`published ASC`;
      case 'coverImage':
        return order === 'desc'
          ? Prisma.sql`cover_image DESC`
          : Prisma.sql`cover_image ASC`;
      case 'authorId':
        return order === 'desc'
          ? Prisma.sql`author_id DESC`
          : Prisma.sql`author_id ASC`;
      case 'excerpt':
        return order === 'desc'
          ? Prisma.sql`excerpt DESC`
          : Prisma.sql`excerpt ASC`;
      case 'likesCount':
        return order === 'desc'
          ? Prisma.sql`likes_count DESC`
          : Prisma.sql`likes_count ASC`;
      case 'slug':
        return order === 'desc' ? Prisma.sql`slug DESC` : Prisma.sql`slug ASC`;
      default:
        return Prisma.empty;
    }
  }

  /**
   * @param {object} getPostOptions - Post options
   * @param {boolean} getPostOptions.published - Whether the post is published or not
   * @param {string} getPostOptions.searchTerm - Search term
   * @param {string} getPostOptions.category - Category name(s)
   * @description
   * This private method is used to construct the where clause of the posts select query
   */
  private pickWhere({
    published,
    searchTerm,
    category,
    authorId,
  }: Pick<
    GetPostDto,
    'category' | 'published' | 'searchTerm' | 'authorId'
  >): Prisma.Sql {
    const where: Prisma.Sql[] = [];

    if (typeof published === 'boolean')
      where.push(Prisma.sql`published = ${published}`);
    if (authorId?.length) where.push(Prisma.sql`author_id = uuid(${authorId})`);
    if (category?.length)
      where.push(Prisma.sql`
      p.id IN(
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
          AND p1.category_names @> string_to_array(${category}, ' '))`);
    if (searchTerm?.length)
      where.push(Prisma.sql`
      (title % ${searchTerm} OR
      excerpt % ${searchTerm})`);

    return where.length
      ? Prisma.sql`
    WHERE
      ${Prisma.join(where, ' AND ')}`
      : Prisma.empty;
  }

  /**
   * @param {number} id - Post id
   * @throws {Prisma.PrismaClientKnownRequestError} - If post with given id does not exist
   * @description Get post by id
   */
  getOne(id: number): Promise<PostEntity> {
    return this.prisma.post.findFirstOrThrow({
      select: selectPostWithAuthorCategories,
      where: { id },
    });
  }

  /**
   * @param {GetPostDto} getPostOptions - Options for getting posts
   * @description Get posts' ids
   */
  getIds({
    take = 10,
    skip = 0,
    orderBy = 'createdAt',
    order = 'desc',
    published,
  }: GetPostDto = {}): Promise<{ id: number }[]> {
    return this.prisma.post.findMany({
      select: {
        id: true,
      },
      where: typeof published === 'boolean' ? { published } : undefined,
      orderBy: { [orderBy]: order },
      take,
      skip,
    });
  }

  /**
   * @param {SearchPostDto} searchPostOptions - Options for searching posts
   * @description Find posts' ids by search term
   */
  findIds({
    take = 10,
    skip = 0,
    orderBy = 'createdAt',
    order = 'desc',
    published,
    searchTerm,
  }: SearchPostDto): Promise<{ id: number }[]> {
    const ordering = this.pickOrdering(orderBy, order);
    const wherePublished =
      typeof published === 'boolean'
        ? Prisma.sql`AND published = ${published}`
        : Prisma.empty;

    return this.prisma.$queryRaw`
      SELECT
        id
      FROM
        "Post"
      WHERE
        title % ${searchTerm} OR 
        excerpt % ${searchTerm}
        ${wherePublished}
      ORDER BY
        title <-> ${searchTerm},
        excerpt <-> ${searchTerm},
        ${ordering}
      LIMIT ${take}
      OFFSET ${skip}`;
  }

  /**
   * @param {GetPostDto} getPostOptions - Options for getting posts
   * @description Get posts
   */
  getMany({
    take = 10,
    skip = 0,
    orderBy = 'createdAt',
    order = 'desc',
    content = false,
    published,
    category,
    searchTerm,
    authorId,
  }: GetPostDto = {}): Promise<PostEntity[]> {
    const selectContent = content ? Prisma.sql`content,` : Prisma.empty;
    const ordering = this.pickOrdering(orderBy, order);
    const orderBySearchTerm = searchTerm?.length
      ? Prisma.sql`
        title <-> ${searchTerm},
        excerpt <-> ${searchTerm},`
      : Prisma.empty;
    const whereClause = this.pickWhere({
      published,
      category,
      searchTerm,
      authorId,
    });

    return this.prisma.$queryRaw<PostEntity[]>`
      SELECT
        p.id,
        p.created_at AS "createdAt",
        p.updated_at AS "updatedAt",
        p.title,
        p.slug,
        p.excerpt,
        p.cover_image AS "coverImage",
        p.likes_count AS "likesCount",
        ${selectContent}
        json_build_object('name', u. "name", 'image', u.image) AS author,
        array_to_json(array_agg(json_build_object('category', json_build_object('name', c. "name", 'hexColor', c.hex_color)))) AS categories
      FROM
        "Post" AS p
        JOIN "User" AS u ON p.author_id = u.id
        JOIN "PostToCategory" AS ptc ON ptc.post_id = p.id
        JOIN "Category" AS c ON c.name = ptc.category_name
      ${whereClause}
      GROUP BY
        p.id,
        u."name",
        u.image
      ORDER BY
        ${orderBySearchTerm}
        ${ordering}
      LIMIT ${take}
      OFFSET ${skip}`;
  }

  /**
   * @description Get all published posts' slugs
   */
  getSlugsForPublished(): Promise<{ slug: string }[]> {
    return this.prisma.post.findMany({
      select: {
        slug: true,
      },
      where: {
        published: true,
      },
    });
  }

  /**
   * @param {string} slug - Post slug
   * @description Get published post by slug
   * @throws {Prisma.PrismaClientKnownRequestError} - If post is not found
   */
  getOnePublishedBySlug(slug: string): Promise<PostEntity> {
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

  /**
   * @param {number} id - Post id
   * @description Get post's author id by post id
   * @throws {Prisma.PrismaClientKnownRequestError} - If post is not found
   */
  getAuthorById(id: number): Promise<{ authorId: string }> {
    return this.prisma.post.findUniqueOrThrow({
      select: {
        authorId: true,
      },
      where: {
        id,
      },
    });
  }

  /**
   * @param {string} slug - Post slug
   * @description Get post's author id by post slug
   * @throws {Prisma.PrismaClientKnownRequestError} - If post is not found
   */
  getAuthorBySlug(slug: string): Promise<{ authorId: string }> {
    return this.prisma.post.findUniqueOrThrow({
      select: {
        authorId: true,
      },
      where: {
        slug,
      },
    });
  }

  /**
   * @param {string} slug - Post slug
   * @description Publish post by slug
   * @throws {Prisma.PrismaClientKnownRequestError} - If post is not found
   */
  publishOneBySlug(slug: string): Promise<PostEntity> {
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

  /**
   * @param {CreatePostDto} post - Post data
   * @param {string} authorId - Author id
   * @description Create post
   */
  create(post: CreatePostDto, authorId: string): Promise<PostEntity> {
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

  /**
   * @param {number} id - Post id
   * @param {UpdatePostDto} post - Post data
   * @description Update post
   * @throws {Prisma.PrismaClientKnownRequestError} - If post is not found
   */
  update(id: number, post: UpdatePostDto): Promise<PostEntity> {
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

  /**
   * @param {number} id - Post id
   * @description Get post's likes
   * @throws {Prisma.PrismaClientKnownRequestError} - If post is not found
   */
  async getLikes(id: number): Promise<{ user: UserNameImageEntity }[]> {
    await this.getOne(id);

    return this.prisma.postLikes.findMany({
      where: {
        postId: id,
      },
      select: {
        user: {
          select: {
            name: true,
            image: true,
          },
        },
      },
    });
  }

  /**
   * @param {number} id - Post id
   * @param {string} userId - User id
   * @description Like post creating like record and incrementing likes count
   * @throws {Prisma.PrismaClientKnownRequestError} - If post is not found
   * @throws {Prisma.PrismaClientKnownRequestError} - If like record already exists
   */
  async like(id: number, userId: string): Promise<PostLike> {
    await this.prisma.postLikes.create({
      data: {
        postId: id,
        userId,
      },
    });

    return this.prisma.post.update({
      where: {
        id,
      },
      data: {
        likesCount: {
          increment: 1,
        },
      },
      select: {
        id: true,
        likesCount: true,
      },
    });
  }

  /**
   * @param {number} id - Post id
   * @param {string} userId - User id
   * @description Unlike post deleting like record and decrementing likes count
   * @throws {Prisma.PrismaClientKnownRequestError} - If post is not found
   * @throws {Prisma.PrismaClientKnownRequestError} - If like record is not found
   */
  async unlike(id: number, userId: string): Promise<PostLike> {
    await this.prisma.postLikes.delete({
      where: {
        postId_userId: {
          postId: id,
          userId,
        },
      },
      select: {
        userId: true,
        postId: true,
      },
    });

    return this.prisma.post.update({
      where: {
        id,
      },
      data: {
        likesCount: {
          decrement: 1,
        },
      },
      select: {
        id: true,
        likesCount: true,
      },
    });
  }

  /**
   * @param {number} id - Post id
   * @description Delete post by id
   * @throws {Prisma.PrismaClientKnownRequestError} - If post is not found
   */
  deleteById(id: number): Promise<PostEntity> {
    return this.prisma.post.delete({
      where: {
        id,
      },
      select: {
        ...selectPostWithAuthorCategories,
      },
    });
  }

  /**
   * @param {string} slug - Post slug
   * @description Delete post by slug
   * @throws {Prisma.PrismaClientKnownRequestError} - If post is not found
   */
  deleteBySlug(slug: string): Promise<PostEntity> {
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
