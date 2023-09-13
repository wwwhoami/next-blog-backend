import { NotFoundError } from '@app/shared/errors/not-found.error';
import { EntityWithAuthorService } from '@core/src/common/entity-with-author.service';
import { UserNameImageEntity } from '@core/src/user/entities/user.entity';
import { Injectable } from '@nestjs/common';
import { NotificationService } from '../notification/notification.service';
import { CommentRepository } from './comment.repository';
import { CreateCommentDto } from './dto/create-comment.dto';
import { GetCommentDto } from './dto/get-comment.dto';
import { UpdateCommentDto } from './dto/update-comment.dto';
import {
  CommentEntity,
  CommentEntityWithChildrenCount,
  CommentLike,
} from './entities/comment.entity';

@Injectable()
export class CommentService implements EntityWithAuthorService {
  constructor(
    private readonly commentRepository: CommentRepository,
    private readonly notificationService: NotificationService,
  ) {}

  /**
   *
   * @param {CreateCommentDto} createCommentOptions - The comment to be created
   * @param {string} authorId - Id of the author of the comment
   * @description
   * If the comment is a response to another comment, the ancestorId is passed
   * in the createCommentOptions. If it is not, the ancestorId is undefined.
   */
  async create(
    createCommentOptions: CreateCommentDto,
    authorId: string,
  ): Promise<CommentEntity> {
    const { ancestorId: responseToCommentId } = createCommentOptions;

    let commentCreated: CommentEntity;
    let target: string | null;

    if (responseToCommentId) {
      commentCreated = await this.commentRepository.createResponse(
        { ...createCommentOptions, ancestorId: responseToCommentId },
        authorId,
      );

      const { authorId: ancestorCommentAuthor } =
        await this.getAuthorId(responseToCommentId);

      target = ancestorCommentAuthor;
    } else {
      commentCreated = await this.commentRepository.create(
        createCommentOptions,
        authorId,
      );

      const { authorId: postAuthorId } = await this.getPostAuthorId(
        commentCreated.postId,
      );

      target = postAuthorId;
    }

    if (target !== null) {
      this.notificationService.emit('comment_create', {
        actor: authorId,
        target,
        data: commentCreated,
      });
    }

    return commentCreated;
  }

  /**
   * @param {number} id - Id of the comment
   * @description
   * Gets Id of the author of comment with the given id
   */
  getAuthorId(id: number): Promise<{ authorId: string | null }> {
    return this.commentRepository.getAuthorId(id);
  }

  /**
   * @param {number} postId - Id of the post
   * @description
   * Gets Id of the author of post with the given id
   */
  getPostAuthorId(postId: number): Promise<{ authorId: string | null }> {
    return this.commentRepository.getPostAuthorId(postId);
  }

  /**
   * @param {number} postId - Id of the post
   * @param {GetCommentDto} getCommentOptions - The options to get the comments
   * @description
   * Gets the comments for the post with the given id
   */
  getManyForPostWithChildrenCount(
    postId: number,
    getCommentOptions: GetCommentDto,
  ): Promise<CommentEntityWithChildrenCount[]> {
    return this.commentRepository.getManyForPostWithChildrenCount(
      postId,
      getCommentOptions,
    );
  }

  /**
   * @param {number} id - Id of the comment
   * @param {GetCommentDto} getCommentOptions - The options to get the comments
   * @description
   * Gets the descendants of the comment with the given id
   */
  getDescendantsWithChildrenCount(
    id: number,
    getCommentOptions: GetCommentDto,
  ): Promise<CommentEntityWithChildrenCount[]> {
    return this.commentRepository.getDescendantsWithChildrenCount(
      id,
      getCommentOptions,
    );
  }

  /**
   * @param {number} id - Id of the comment
   * @description
   * Gets the comment with the given id
   */
  getOne(id: number): Promise<CommentEntity> {
    return this.commentRepository.getOne(id);
  }

  /**
   * @param {number} id - Id of the comment
   * @description
   * Updates the comment with the given id
   * @throws {NotFoundError} - If the comment is deleted
   */
  async update(id: number, comment: UpdateCommentDto) {
    const { isDeleted } = await this.commentRepository.getOne(id);

    if (isDeleted) throw new NotFoundError('Comment not found');

    return this.commentRepository.update(id, comment);
  }

  /**
   * @param {number} id - Id of the comment
   * @description
   * Gets the likes of the comment with the given id
   */
  getLikes(id: number): Promise<{ user: UserNameImageEntity }[]> {
    return this.commentRepository.getLikes(id);
  }

  /**
   * @param {number} id - Id of the comment
   * @param {string} userId - Id of the user
   * @description
   * Likes the comment with the given id
   */
  async like(id: number, userId: string): Promise<CommentLike> {
    const liked = await this.commentRepository.like(id, userId);

    const { authorId } = await this.commentRepository.getAuthorId(id);

    if (authorId !== null) {
      this.notificationService.emit('comment_like', {
        actor: userId,
        target: authorId,
        data: liked,
      });
    }

    return liked;
  }

  /**
   * @param {number} id - Id of the comment
   * @param {string} userId - Id of the user
   * @description
   * Unlikes the comment with the given id
   */
  async unlike(id: number, userId: string): Promise<CommentLike> {
    const unliked = await this.commentRepository.unlike(id, userId);

    const { authorId } = await this.commentRepository.getAuthorId(id);

    if (authorId !== null) {
      this.notificationService.emit('comment_unlike', {
        actor: userId,
        target: authorId,
        data: unliked,
      });
    }

    return unliked;
  }

  /**
   * @param {number} id - Id of the comment
   * @description
   * Soft deletes the comment with the given id
   */
  softRemove(id: number) {
    return this.commentRepository.softRemove(id);
  }
}
