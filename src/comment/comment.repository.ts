import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ConflictError } from 'src/common/errors/conflict.error';
import { PrismaService } from 'src/prisma/prisma.service';
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
} from './entities/comment.entity';

@Injectable()
export class CommentRepository {
  constructor(private prisma: PrismaService) {}

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
      default:
        return Prisma.sql``;
    }
  }

  /**
   * @param {CreateResponseToCommentDto} comment - The comment to create
   * @param {string} authorId - The id of the author of the comment
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
    const ancestor = await this.getOne(comment.ancestorId);

    if (ancestor.postId !== comment.postId)
      throw new ConflictError('Cannot respond to comment for another post');
    if (ancestor.isDeleted)
      throw new ConflictError('Cannot respond to deleted comment');

    return this.create(comment, authorId);
  }

  /**
   * @param {CreateCommentDto} comment - The comment to create
   * @param {string} authorId - The id of the author of the comment
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
   * @param {number} postId - The id of the post to get the comments for
   * @param {GetCommentDto} options - The options to get the comments with
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
   * @param {number} postId - The id of the post to get the comments for
   * @param {GetCommentDto} options - The options to get the comments with
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
   * @param {number} ancestorId - The id of the ancestor to get the descendants for
   * @param {GetCommentDto} options - The options to get the comments with
   * @description This method is used to get the descendants for a comment
   * @example
   * const comments = await commentRepository.getDescendants(1, {
   *    orderBy: 'createdAt',
   *    order: 'desc',
   *    depth: 10,
   * });
   */
  getDescendants(
    ancestorId: number,
    { orderBy = 'createdAt', order = 'desc', depth = 10 }: GetCommentDto = {},
  ): Promise<CommentEntityWithDepth[]> {
    // Pick the ordering
    const ordering = this.pickOrdering(orderBy, order);

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
   * @param {number} ancestorId - The id of the ancestor to get the descendants for
   * @param {GetCommentDto} options - The options to get the comments with
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
   * @param {number} commentId - The id of the comment to get the count of descendants for
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
   * @returns {Promise<{ authorId: string | null }>} - author id
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
   * @param {number} id - comment id
   * @param {UpdateCommentDto} comment - comment data
   * @returns {Promise<CommentEntity>} - updated comment
   * @throws {Prisma.PrismaClientKnownRequestError} - if comment with given id does not exist
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
   * @param {number} id - comment id
   * @throws {Prisma.PrismaClientKnownRequestError} - if comment with given id does not exist
   * @description
   * Soft remove comment by setting isDeleted to true and content to 'COMMENT IS DELETED'
   * It is used to prevent comment from being returned in queries.
   * Comments are not actually deleted from the database!
   * @example
   * await commentRepository.softRemove(1);
   */
  softRemove(id: number): Promise<CommentEntity> {
    return this.prisma.comment.update({
      data: {
        isDeleted: true,
        content: 'COMMENT IS DELETED',
      },
      where: {
        id,
      },
    });
  }
}
