import { Injectable } from '@nestjs/common';
import { EntityWithAuthorService } from 'src/common/entity-with-author.service';
import { NotFoundError } from 'src/common/errors/not-found.error';
import { CommentRepository } from './comment.repository';
import { CreateCommentDto } from './dto/create-comment.dto';
import { GetCommentDto } from './dto/get-comment.dto';
import { UpdateCommentDto } from './dto/update-comment.dto';
import {
  CommentEntity,
  CommentEntityWithChildrenCount,
} from './entities/comment.entity';

@Injectable()
export class CommentService implements EntityWithAuthorService {
  constructor(private readonly commentRepository: CommentRepository) {}

  /**
   *
   * @param {CreateCommentDto} createCommentOptions - The comment to be created
   * @param {string} authorId - The id of the author of the comment
   * @description
   * If the comment is a response to another comment, the ancestorId is passed
   * in the createCommentOptions. If it is not, the ancestorId is undefined.
   */
  create(
    createCommentOptions: CreateCommentDto,
    authorId: string,
  ): Promise<CommentEntity> {
    const { ancestorId: responseToCommentId } = createCommentOptions;

    if (responseToCommentId)
      return this.commentRepository.createResponse(
        { ...createCommentOptions, ancestorId: responseToCommentId },
        authorId,
      );

    return this.commentRepository.create(createCommentOptions, authorId);
  }

  /**
   * @param {number} id - The id of the comment
   * @description
   * Gets the id of the author of the comment with the given id
   */
  getAuthorId(id: number): Promise<{ authorId: string | null }> {
    return this.commentRepository.getAuthorId(id);
  }

  /**
   * @param {number} postId - The id of the post
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
   * @param {number} id - The id of the comment
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
   * @param {number} id - The id of the comment
   * @description
   * Gets the comment with the given id
   */
  getOne(id: number): Promise<CommentEntity> {
    return this.commentRepository.getOne(id);
  }

  /**
   * @param {number} id - The id of the comment
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
   * @param {number} id - The id of the comment
   * @description
   * Soft deletes the comment with the given id
   */
  softRemove(id: number) {
    return this.commentRepository.softRemove(id);
  }
}
