import { PrismaService } from '@app/prisma';
import { NotFoundError } from '@app/shared/errors/not-found.error';
import { ConflictError } from '@core/src/common/errors/conflict.error';
import { UnprocessableEntityError } from '@core/src/common/errors/unprocessable-entity.error';
import { PostRepository } from '@core/src/post/post.repository';
import { UserNameImageEntity } from '@core/src/user/entities/user.entity';
import { Injectable } from '@nestjs/common';
import { Prisma } from 'prisma/generated/client';
import {
  CreateCommentDto,
  CreateResponseToCommentDto,
} from './dto/create-comment.dto';
import { CommentOrderBy, GetCommentDto } from './dto/get-comment.dto';
import { UpdateCommentDto } from './dto/update-comment.dto';
import {
  CommentEntity,
  CommentEntityWithChildrenCount,
  CommentEntityWithDepth,
  CommentLike,
} from './entities/comment.entity';

@Injectable()
export class CommentRepository {
  constructor(
    private prisma: PrismaService,
    private postRepository: PostRepository,
  ) {}

  /**
   * @param {CommentOrderBy} orderBy - The field to order by
   * @param {Prisma.SortOrder} order - The order of the field
   * @description This private method is used to pick the ordering of the comments
   * @example this.pickOrdering('createdAt', 'desc')
   */
  private pickOrdering(
    orderBy: CommentOrderBy,
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
      case 'likesCount':
        return order === 'desc'
          ? Prisma.sql`likes_count DESC`
          : Prisma.sql`likes_count ASC`;
      default:
        return Prisma.sql``;
    }
  }

  /**
   * @param {CreateResponseToCommentDto} comment - The comment to create
   * @param {string} authorId - Id of the author of the comment
   * @description This method is used to create a comment that is a response to another comment
   * @throws {NotFoundError} if the comment to respond to does not exist
   * @throws {ConflictError} if the comment is a response to a deleted comment
   * @throws {ConflictError} if the comment is a response to a comment for another post
   * @example
   * const response = await commentRepository.createResponse({
   *    postId: 1,
   *    ancestorId: 1,
   *    content: 'This is a response to a comment',
   * }, '1');
   */
  async createResponse(
    comment: CreateResponseToCommentDto,
    authorId: string,
  ): Promise<CommentEntity> {
    let ancestor: CommentEntity | undefined;
    // Check if the comment to respond to exists
    try {
      ancestor = await this.getOne(comment.ancestorId);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      )
        throw new NotFoundError('Comment to respond to does not exist');
      throw error;
    }
    if (ancestor.postId !== comment.postId)
      throw new ConflictError('Cannot respond to comment for another post');
    if (ancestor.isDeleted)
      throw new ConflictError('Cannot respond to deleted comment');

    return this.create(comment, authorId);
  }

  /**
   * @param {CreateCommentDto} comment - The comment to create
   * @param {string} authorId - Id of the author of the comment
   * @description This method is used to create a comment
   * @throws {NotFoundError} if the comment does not exist
   * @example
   * const comment = await commentRepository.create({
   *    postId: 1,
   *    content: 'This is a comment',
   * }, '1');
   */
  create(comment: CreateCommentDto, authorId: string): Promise<CommentEntity> {
    return this.prisma.comment.create({
      data: {
        ...comment,
        authorId,
      },
    });
  }

  /**
   * @param {number} postId - Id of the post to get the comments for
   * @param {GetCommentDto} options - The options to get the comments with
   * @throws {NotFoundError} if the post does not exist
   * @description This method is used to get the comments for a post
   * @example
   * const comments = await commentRepository.getManyForPost(1, {
   *    orderBy: 'createdAt',
   *    order: 'desc',
   *    depth: 5,
   * });
   */
  async getManyForPost(
    postId: number,
    { orderBy = 'createdAt', order = 'desc', depth = 5 }: GetCommentDto = {},
  ): Promise<CommentEntityWithDepth[]> {
    // Pick the ordering
    const ordering = this.pickOrdering(orderBy, order);

    // Check if the post exists
    try {
      await this.postRepository.getOne(postId);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      )
        throw new NotFoundError('Post does not exist');
      throw error;
    }

    // Get the comments for the post with the specified depth and ordering (using a recursive CTE)
    return this.prisma.$queryRaw<CommentEntityWithDepth[]>`   
      WITH RECURSIVE d AS (
        SELECT
          c.id,
          c.post_id,
          c.author_id,
          c.ancestor_id,
          c."content",
          c.created_at,
          c.updated_at,
          c.is_deleted,
          1 AS "depth"
        FROM "Comment" c
        WHERE
          c.post_id = ${postId}
          AND ancestor_id ISNULL
        UNION ALL
        SELECT
          c.id,
          c.post_id,
          c.author_id,
          c.ancestor_id,
          c."content",
          c.created_at,
          c.updated_at,
          c.is_deleted,
          d."depth" + 1
        FROM "Comment" c
        JOIN d
          ON c.ancestor_id = d.id
        WHERE d."depth" < ${depth}
      )
      SELECT
      id,
      post_id AS "postId",
      author_id AS "authorId",
      ancestor_id AS "ancestorId",
      "content",
      created_at AS "createdAt",
      updated_at AS "updatedAt",
      is_deleted AS "isDeleted",
      "depth"
      FROM d
      ORDER BY
        "depth" ASC,
        ancestor_id ASC,
        ${ordering}`;
  }

  /**
   * @param {number} postId - Id of the post to get the comments for
   * @param {GetCommentDto} options - The options to get the comments with
   * @throws {NotFoundError} if the post does not exist
   * @description
   * This method is used to get the comments for a post with the children count
   * for comments that could have children (are not at the set maximum depth)
   * @example
   * const comments = await commentRepository.getManyForPostWithChildrenCount(1, {
   *    orderBy: 'createdAt',
   *    order: 'desc',
   *    depth: 5,
   * });
   */
  async getManyForPostWithChildrenCount(
    postId: number,
    { depth = 5, ...getCommentOptions }: GetCommentDto = {},
  ): Promise<CommentEntityWithChildrenCount[]> {
    // Get the comments for the post
    const comments = await this.getManyForPost(postId, {
      depth,
      ...getCommentOptions,
    });

    // Get the count of descendants for each comment that could have children (is not at the set maximum depth)
    return Promise.all(
      comments.map(async (comment) => ({
        ...comment,
        childrenCount:
          comment.depth === depth
            ? await this.getCountOfDescendants(comment.id)
            : undefined,
      })),
    );
  }

  /**
   * @param {number} ancestorId - Id of the ancestor to get the descendants for
   * @param {GetCommentDto} options - The options to get the comments with
   * @throws {NotFoundError} if the ancestor does not exist
   * @description This method is used to get the descendants for a comment
   * @example
   * const comments = await commentRepository.getDescendants(1, {
   *    orderBy: 'createdAt',
   *    order: 'desc',
   *    depth: 10,
   * });
   */
  async getDescendants(
    ancestorId: number,
    { orderBy = 'createdAt', order = 'desc', depth = 10 }: GetCommentDto = {},
  ): Promise<CommentEntityWithDepth[]> {
    // Pick the ordering
    const ordering = this.pickOrdering(orderBy, order);
    // If the ancestor does not exist, will throw a NotFoundError
    try {
      await this.getOne(ancestorId);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      )
        throw new NotFoundError('Comment does not exist');
      throw error;
    }

    // Get the descendants for the ancestor with the specified depth and ordering (using a recursive CTE)
    return this.prisma.$queryRaw<CommentEntityWithDepth[]>`   
      WITH RECURSIVE d AS (
        SELECT
          c.id,
          c.post_id,
          c.author_id,
          c.ancestor_id,
          c."content",
          c.created_at,
          c.updated_at,
          c.is_deleted,
          1 AS "depth"
        FROM "Comment" c
        WHERE c.ancestor_id = ${ancestorId}
        UNION ALL
        SELECT 
          c.id,
          c.post_id,
          c.author_id,
          c.ancestor_id,
          c."content",
          c.created_at,
          c.updated_at,
          c.is_deleted,
          d."depth" + 1
        FROM "Comment" c
        JOIN d
          ON c.ancestor_id = d.id
        WHERE d."depth" < ${depth}
      )
      SELECT 
        id,
        post_id AS "postId",
        author_id AS "authorId",
        ancestor_id AS "ancestorId",
        "content",
        created_at AS "createdAt",
        updated_at AS "updatedAt",
        is_deleted AS "isDeleted",
        "depth"
      FROM d
      ORDER BY
        "depth" ASC,
        ancestor_id ASC,
        ${ordering}`;
  }

  /**
   * @param {number} ancestorId - Id of the ancestor to get the descendants for
   * @param {GetCommentDto} options - The options to get the comments with
   * @throws {NotFoundError} if the ancestor does not exist
   * @description
   * This method is used to get the descendants for a comment with the children count
   * for comments that could have children (are not at the set maximum depth)
   * @example
   * const comments = await commentRepository.getDescendantsWithChildrenCount(1, {
   *    orderBy: 'createdAt',
   *    order: 'desc',
   *    depth: 10,
   * });
   */
  async getDescendantsWithChildrenCount(
    ancestorId: number,
    { depth = 5, ...getCommentOptions }: GetCommentDto = {},
  ): Promise<CommentEntityWithChildrenCount[]> {
    // Get the descendants for the comment
    const comments = await this.getDescendants(ancestorId, {
      depth,
      ...getCommentOptions,
    });

    // Get the count of descendants for each comment that could have children (is not at the set maximum depth)
    return Promise.all(
      comments.map(async (comment) => ({
        ...comment,
        childrenCount:
          comment.depth === depth
            ? await this.getCountOfDescendants(comment.id)
            : undefined,
      })),
    );
  }

  /**
   * @param {number} commentId - Id of the comment to get the count of descendants for
   * @description This method is used to get the count of descendants for a comment
   * @example
   * const count = await commentRepository.getCountOfDescendants(1);
   */
  async getCountOfDescendants(commentId: number): Promise<number> {
    // Get the count of descendants for the comment (using a recursive CTE)
    // The count is returned as a bigint, so it needs to be converted to a number
    const [{ count }] = await this.prisma.$queryRaw<{ count: bigint }[]>`
      WITH RECURSIVE d AS (
        SELECT
          c.id,
          c.id AS child_id
        FROM "Comment" c
        WHERE c.ancestor_id = ${commentId}
        UNION ALL
        SELECT
          d.id,
          c.id
        FROM "Comment" c
        JOIN d
          ON c.ancestor_id = d.child_id
      )
      SELECT count(*) AS "count"
      FROM d`;

    // Return the count as a number instead of a bigint
    return Number(count);
  }

  /**
   * @param {number} id - comment id
   * @throws {Prisma.PrismaClientKnownRequestError} - if comment with given id does not exist
   * @description This method is used to get comment by id.
   * @example
   * const comment = await commentRepository.getOne(1);
   */
  getOne(id: number): Promise<CommentEntity> {
    return this.prisma.comment.findFirstOrThrow({
      where: {
        id,
      },
    });
  }

  /**
   * @param {number} id - comment id
   * @throws {Prisma.PrismaClientKnownRequestError} - if comment with given id does not exist
   * @description This method is used to get author id of comment.
   * @example
   * const authorId = await commentRepository.getAuthorId(1);
   */
  getAuthorId(id: number): Promise<{ authorId: string | null }> {
    return this.prisma.comment.findFirstOrThrow({
      where: {
        id,
      },
      select: {
        authorId: true,
      },
    });
  }

  /**
   * @param {number} postId - Id of the post
   * @description
   * Gets Id of the author of post with the given id
   */
  async getPostAuthorId(postId: number): Promise<{ authorId: string | null }> {
    return this.postRepository.getAuthorById(postId);
  }

  /**
   * @param {number} id - comment id
   * @param {UpdateCommentDto} comment - comment data
   * @description
   * This method is used to update comment data.
   * It does not allow to change post_id, author_id and ancestor_id.
   */
  update(id: number, comment: UpdateCommentDto): Promise<CommentEntity> {
    return this.prisma.comment.update({
      data: comment,
      where: {
        id,
      },
    });
  }

  /**
   * @param {number} id - Comment id
   * @description Get comment's likes
   * @throws {Prisma.PrismaClientKnownRequestError} - If comment is not found
   * @throws {Prisma.PrismaClientKnownRequestError} - If comment is deleted
   */
  async getLikes(id: number): Promise<{ user: UserNameImageEntity }[]> {
    await this.getOne(id);

    return this.prisma.commentLikes.findMany({
      where: {
        commentId: id,
        comment: {
          isDeleted: false,
        },
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
   * @param {number} id - Comment id
   * @param {string} userId - User id
   * @description Like comment creating like record and incrementing likes count
   * @throws {UnprocessableEntityError} - If comment is not found
   * @throws {Prisma.PrismaClientKnownRequestError} - If like record already exists
   * @throws {UnprocessableEntityError} - If comment is deleted
   */
  async like(id: number, userId: string): Promise<CommentLike> {
    try {
      await this.prisma.comment.findFirstOrThrow({
        where: {
          id,
          isDeleted: false,
        },
      });
    } catch (error) {
      // If comment is not found or is soft deleted
      if (error.code === 'P2025') {
        throw new UnprocessableEntityError('Comment does not exist');
      }
      throw error;
    }

    await this.prisma.commentLikes.create({
      data: {
        commentId: id,
        userId,
      },
    });

    return this.prisma.comment.update({
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
        postId: true,
      },
    });
  }

  /**
   * @param {number} id - Comment id
   * @param {string} userId - User id
   * @description Unlike comment deleting like record and decrementing likes count
   * @throws {Prisma.PrismaClientKnownRequestError} - If comment is not found
   * @throws {Prisma.PrismaClientKnownRequestError} - If like record is not found
   */
  async unlike(id: number, userId: string): Promise<CommentLike> {
    await this.prisma.commentLikes.delete({
      where: {
        commentId_userId: {
          commentId: id,
          userId,
        },
      },
      select: {
        userId: true,
        commentId: true,
      },
    });

    return this.prisma.comment.update({
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
        postId: true,
      },
    });
  }

  /**
   * @param {number} id - comment id
   * @throws {Prisma.PrismaClientKnownRequestError} - if comment with given id does not exist
   * @throws {Prisma.PrismaClientKnownRequestError} - if comment is already deleted
   * @description
   * Soft remove comment by setting isDeleted to true and content to 'COMMENT IS DELETED'
   * It is used to prevent comment from being returned in queries.
   * Comments are not actually deleted from the database!
   * Likes for the comment are actually deleted.
   * @example
   * await commentRepository.softRemove(1);
   */
  async softRemove(id: number): Promise<CommentEntity> {
    await this.prisma.commentLikes.deleteMany({
      where: {
        commentId: id,
      },
    });

    return this.prisma.comment.update({
      data: {
        isDeleted: true,
        content: 'COMMENT IS DELETED',
        likesCount: 0,
      },
      where: {
        id,
      },
    });
  }
}
