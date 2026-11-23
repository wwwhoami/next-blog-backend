import { PrismaService } from '@app/prisma';
import { UserNameImageEntity } from '@core/src/user/entities/user.entity';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { isURL } from 'class-validator';
import { MediaTarget, Prisma } from 'prisma/generated/client';
import slugify from 'slugify';
import { ManagedMedia } from '../media/util/managed-media';
import { markdownImages } from '../media/util/markdown-images';
import { CreatePostDto } from './dto/create-post.dto';
import { GetPostDto, PostOrderBy, SearchPostDto } from './dto/get-post.dto';
import { PostEntity, PostEntityRanked, PostLike } from './entities/post.entity';
import { selectPostWithAuthorCategories } from './utils/select.objects';

@Injectable()
export class PostRepository {
  private readonly managedMedia: ManagedMedia;

  constructor(
    private readonly prisma: PrismaService,
    @Optional() config?: ConfigService,
  ) {
    this.managedMedia = new ManagedMedia(config);
  }

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
   * @param {string} getPostOptions.authorId - Author id
   * @param {string} getPostOptions.language - Language
   * @description
   * This private method is used to construct the where clause of the posts select query
   */
  private pickWhere({
    published,
    searchTerm,
    category,
    authorId,
    language = 'english',
  }: Pick<
    GetPostDto,
    'category' | 'published' | 'searchTerm' | 'authorId' | 'language'
  >): Prisma.Sql {
    const where: Prisma.Sql[] = [];

    if (typeof published === 'boolean')
      where.push(Prisma.sql`published = ${published}`);
    if (authorId?.length)
      where.push(Prisma.sql`author_id = uuid(${authorId}::text)`);
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
        (title % ${searchTerm}
        OR to_tsvector(${language}::regconfig, excerpt) @@ websearch_to_tsquery(${language}::regconfig, ${searchTerm}))`);

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
   * @description Find posts' ids by search term, language is used for search index utilization
   */
  findIds({
    take = 10,
    skip = 0,
    orderBy = 'createdAt',
    order = 'desc',
    published,
    searchTerm,
    language = 'english',
  }: SearchPostDto): Promise<{ id: number }[]> {
    const selectRank = Prisma.sql`
        (0.7 * similarity(p.title, ${searchTerm})) + 
        (0.3 * ts_rank_cd(to_tsvector(${language}::regconfig, p.excerpt),
        websearch_to_tsquery(${language}::regconfig, ${searchTerm}))) AS rank`;
    const ordering = this.pickOrdering(orderBy, order);
    const whereClause = this.pickWhere({ published, searchTerm });

    return this.prisma.$queryRaw`
      SELECT
        id,
        ${selectRank}
      FROM
        "Post" AS p
      ${whereClause}
      ORDER BY
        rank DESC,
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
    language = 'english',
  }: GetPostDto = {}): Promise<PostEntityRanked[]> {
    const selectContent = content ? Prisma.sql`content,` : Prisma.empty;
    const selectRank = searchTerm?.length
      ? Prisma.sql`
        (0.7 * similarity(p.title, ${searchTerm})) + 
        (0.3 *
        ts_rank_cd(to_tsvector(${language}::regconfig, p.excerpt),
        websearch_to_tsquery(${language}::regconfig, ${searchTerm}))) AS rank,`
      : Prisma.empty;
    const orderBySearchTerm = searchTerm?.length
      ? Prisma.sql`rank DESC,`
      : Prisma.empty;
    const ordering = this.pickOrdering(orderBy, order);
    const whereClause = this.pickWhere({
      published,
      category,
      searchTerm,
      authorId,
    });

    return this.prisma.$queryRaw<PostEntityRanked[]>`
      SELECT
        p.id,
        p.created_at AS "createdAt",
        p.updated_at AS "updatedAt",
        p.title,
        p.slug,
        p.excerpt,
        p.cover_image AS "coverImage",
        p.likes_count AS "likesCount",
        p.language,
        ${selectContent}
        ${selectRank}
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
  async create(post: CreatePostDto, authorId: string): Promise<PostEntity> {
    const { urls, hasHtml } = markdownImages(post.content);
    if (hasHtml) throw new BadRequestException('Raw HTML is not supported');

    const { title, excerpt, content, published, coverImage, categories } = post;
    const slug = slugify(title, { lower: true });
    const coverKey = this.managedMedia.key(post.coverImage);
    if (coverKey === undefined && !isURL(post.coverImage)) {
      throw new BadRequestException('coverImage must be a URL address');
    }
    const keys = this.managedMedia.keys([post.coverImage, ...urls]);
    const create = (tx: Prisma.TransactionClient, mediaIds: string[] = []) =>
      tx.post.create({
        data: {
          title,
          excerpt,
          content,
          published,
          coverImage,
          slug,
          authorId,
          ...(mediaIds.length && {
            postMedia: {
              createMany: { data: mediaIds.map((mediaId) => ({ mediaId })) },
            },
          }),
          categories: {
            create: categories?.map(({ name, description, hexColor }) => ({
              category: {
                connectOrCreate: {
                  where: { name },
                  create: { name, description, hexColor },
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
    if (!keys.length) return create(this.prisma);

    return this.prisma.$transaction(async (tx) => {
      const originals = await this.managedMedia.lockAndResolve(
        tx,
        keys,
        authorId,
        MediaTarget.POST,
      );
      return create(tx, originals);
    });
  }

  updatePublication(id: number, published: boolean): Promise<PostEntity> {
    return this.prisma.post.update({
      where: { id },
      data: { published },
      select: { ...selectPostWithAuthorCategories, content: false },
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
   * Creates a like and reads the count updated by the database trigger
   * within the same transaction.
   *
   * @param id - Post ID.
   * @param userId - ID of the user adding the like.
   * @returns The post ID and updated like count.
   * @throws {Prisma.PrismaClientKnownRequestError} If the post or user does not
   * exist, or the user has already liked the post.
   */
  async like(id: number, userId: string): Promise<PostLike> {
    return this.prisma.$transaction(async (tx) => {
      await tx.postLikes.create({ data: { postId: id, userId } });
      return this.readLikeCount(tx, id);
    });
  }

  /**
   * Deletes a user's like and reads the count updated by the database trigger
   * within the same transaction. Locks the post before deleting the like to
   * match the lock order used by {@link deleteById}.
   *
   * @param id - Post ID.
   * @param userId - ID of the user removing the like.
   * @returns The post ID and updated like count.
   * @throws {Prisma.PrismaClientKnownRequestError} If the like does not exist,
   * including when a concurrent post deletion has already removed it.
   */
  async unlike(id: number, userId: string): Promise<PostLike> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Post" WHERE "id" = ${id} FOR NO KEY UPDATE`;
      await tx.postLikes.delete({
        where: { postId_userId: { postId: id, userId } },
      });

      return this.readLikeCount(tx, id);
    });
  }

  private readLikeCount(tx: Prisma.TransactionClient, id: number) {
    return tx.post.findUniqueOrThrow({
      where: { id },
      select: { id: true, likesCount: true },
    });
  }

  /**
   * Deletes a post, archives active revisions, and detaches all revisions
   * in one transaction. Detached revisions retain the deleted post ID.
   *
   * @param id - Post ID.
   * @returns The deleted post with its author and categories.
   * @throws {ConflictException} If a revision is publishing.
   * @throws {Prisma.PrismaClientKnownRequestError} If the post does not exist.
   */
  async deleteById(id: number): Promise<PostEntity> {
    return this.prisma.$transaction(async (tx) => {
      // Match the parent-first lock order used by unlike before likes cascade.
      await tx.$queryRaw`SELECT "id" FROM "Post" WHERE "id" = ${id} FOR UPDATE`;

      // Keep revision statuses stable through the publication check and detach.
      const revisions = await tx.$queryRaw<{ status: string }[]>`
        SELECT "status" FROM "Draft" WHERE "post_id" = ${id} ORDER BY "id" FOR UPDATE
      `;
      if (revisions.some(({ status }) => status === 'PUBLISHING')) {
        throw new ConflictException(
          'Post cannot be deleted while a revision is publishing',
        );
      }

      await tx.draft.updateMany({
        where: { postId: id, status: 'ACTIVE' },
        data: {
          status: 'ARCHIVED',
          archivedAt: new Date(),
          deletedPostId: id,
          postId: null,
        },
      });
      await tx.draft.updateMany({
        where: { postId: id },
        data: { deletedPostId: id, postId: null },
      });

      return tx.post.delete({
        where: { id },
        select: { ...selectPostWithAuthorCategories },
      });
    });
  }

  /**
   * Resolves the post ID by slug and delegates to {@link deleteById}.
   *
   * @param slug - Post slug.
   * @returns The deleted post with its author and categories.
   * @throws {ConflictException} If a revision is publishing.
   * @throws {Prisma.PrismaClientKnownRequestError} If the post does not exist.
   */
  async deleteBySlug(slug: string): Promise<PostEntity> {
    const { id } = await this.prisma.post.findUniqueOrThrow({
      where: { slug },
      select: { id: true },
    });

    return this.deleteById(id);
  }
}
