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

  create(comment: CreateCommentDto, authorId: string): Promise<CommentEntity> {
    return this.prisma.comment.create({
      data: {
        ...comment,
        authorId,
      },
    });
  }

  async getManyForPost(
    postId: number,
    { orderBy = 'createdAt', order = 'desc', depth = 5 }: GetCommentDto,
  ): Promise<CommentEntityWithDepth[]> {
    const ordering = this.pickOrdering(orderBy, order);

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

  async getManyForPostWithChildrenCount(
    postId: number,
    { depth = 5, ...getCommentOptions }: GetCommentDto,
  ): Promise<CommentEntityWithChildrenCount[]> {
    const comments = await this.getManyForPost(postId, {
      depth,
      ...getCommentOptions,
    });

    return Promise.all(
      comments.map(async (comment) => ({
        ...comment,
        childrenCount:
          comment.depth === depth
            ? Number(await this.getCountOfDescendants(comment.id))
            : undefined,
      })),
    );
  }

  getDescendants(
    ancestorId: number,
    { orderBy = 'createdAt', order = 'desc', depth = 10 }: GetCommentDto,
  ): Promise<CommentEntityWithDepth[]> {
    const ordering = this.pickOrdering(orderBy, order);

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

  async getDescendantsWithChildrenCount(
    ancestorId: number,
    { depth = 5, ...getCommentOptions }: GetCommentDto,
  ): Promise<CommentEntityWithChildrenCount[]> {
    const comments = await this.getDescendants(ancestorId, {
      depth,
      ...getCommentOptions,
    });

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

  async getCountOfDescendants(ancestorId: number): Promise<number> {
    const [{ count }] = await this.prisma.$queryRaw<{ count: bigint }[]>`
      WITH RECURSIVE d AS (
        SELECT
          c.id,
          c.id AS child_id
        FROM "Comment" c
        WHERE c.ancestor_id = ${ancestorId}
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

    return Number(count);
  }

  getOne(id: number): Promise<CommentEntity> {
    return this.prisma.comment.findFirstOrThrow({
      where: {
        id,
      },
    });
  }

  getAuthorId(id: number): Promise<{ authorId: string }> {
    return this.prisma.comment.findFirstOrThrow({
      where: {
        id,
      },
      select: {
        authorId: true,
      },
    });
  }

  update(id: number, comment: UpdateCommentDto): Promise<CommentEntity> {
    return this.prisma.comment.update({
      data: comment,
      where: {
        id,
      },
    });
  }

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
