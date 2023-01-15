import { Injectable } from '@nestjs/common';
import { EntityWithAuthorService } from 'src/common/entity-with-author.service';
import { ConflictError } from 'src/common/errors/conflict.error';
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

  getAuthorId(id: number): Promise<{ authorId: string }> {
    return this.commentRepository.getAuthorId(id);
  }

  getManyForPostWithChildrenCount(
    postId: number,
    getCommentOptions: GetCommentDto,
  ): Promise<CommentEntityWithChildrenCount[]> {
    return this.commentRepository.getManyForPostWithChildrenCount(
      postId,
      getCommentOptions,
    );
  }

  getDescendantsWithChildrenCount(
    id: number,
    getCommentOptions: GetCommentDto,
  ): Promise<CommentEntityWithChildrenCount[]> {
    return this.commentRepository.getDescendantsWithChildrenCount(
      id,
      getCommentOptions,
    );
  }

  getOne(id: number): Promise<CommentEntity> {
    return this.commentRepository.getOne(id);
  }

  async update(id: number, comment: UpdateCommentDto) {
    const { isDeleted } = await this.commentRepository.getOne(id);

    if (isDeleted) throw new ConflictError('Cannot update deleted comment');

    return this.commentRepository.update(id, comment);
  }

  softRemove(id: number) {
    return this.commentRepository.softRemove(id);
  }
}
