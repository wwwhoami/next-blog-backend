import { Test, TestingModule } from '@nestjs/testing';
import { mock, MockProxy } from 'jest-mock-extended';
import { NotFoundError } from 'rxjs';
import { CommentRepository } from '../comment.repository';
import { CommentService } from '../comment.service';
import { CreateCommentDto } from '../dto/create-comment.dto';
import {
  CommentEntity,
  CommentEntityWithDepth,
} from '../entities/comment.entity';

const authorId = 'ab182222-5603-4b01-909b-a68fbb3a2153';

const comments: CommentEntityWithDepth[] = [
  {
    id: 1,
    authorId,
    postId: 1,
    ancestorId: null,
    content: 'content',
    createdAt: new Date(),
    updatedAt: new Date(),
    isDeleted: false,
    depth: 1,
    likesCount: 0,
  },
  {
    id: 2,
    authorId,
    postId: 1,
    ancestorId: null,
    content: 'content',
    createdAt: new Date(),
    updatedAt: new Date(),
    isDeleted: false,
    depth: 1,
    likesCount: 0,
  },
  {
    id: 3,
    authorId,
    postId: 1,
    ancestorId: 1,
    content: 'content',
    createdAt: new Date(),
    updatedAt: new Date(),
    isDeleted: false,
    depth: 2,
    likesCount: 0,
  },
  {
    id: 4,
    authorId,
    postId: 1,
    ancestorId: 1,
    content: 'content',
    createdAt: new Date(),
    updatedAt: new Date(),
    isDeleted: false,
    depth: 2,
    likesCount: 0,
  },
];

describe('CommentService', () => {
  let service: CommentService;
  let commentRepository: MockProxy<CommentRepository>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CommentService,
        { provide: CommentRepository, useValue: mock<CommentService>() },
      ],
    }).compile();

    commentRepository = module.get(CommentRepository);
    service = module.get<CommentService>(CommentService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create a comment to post with provided id', async () => {
      const commentData: CreateCommentDto = {
        postId: 1,
        content: 'content',
      };
      const resolvedComment = {
        ...commentData,
        id: 12312,
        authorId,
        updatedAt: new Date(),
        createdAt: new Date(),
        ancestorId: null,
        isDeleted: false,
        likesCount: 0,
      };

      commentRepository.create.mockResolvedValue(resolvedComment);

      const createdComment = await service.create(commentData, authorId);

      expect(createdComment).toMatchObject(resolvedComment);
    });

    it('should create a comment to post with provided id, responding to comment', async () => {
      const commentData: CreateCommentDto = {
        postId: 1,
        content: 'content',
        ancestorId: 1,
      };
      const resolvedComment = {
        ...commentData,
        id: 12312,
        authorId,
        updatedAt: new Date(),
        createdAt: new Date(),
        ancestorId: 1,
        isDeleted: false,
        likesCount: 0,
      };

      commentRepository.createResponse.mockResolvedValue(resolvedComment);

      const createdComment = await service.create(commentData, authorId);

      expect(createdComment).toMatchObject(resolvedComment);
    });
  });

  describe('getAuthorId', () => {
    it('should return authorId of comment with provided id', async () => {
      const commentId = 1;

      commentRepository.getAuthorId.mockResolvedValue({ authorId });

      const commentAuthorId = await service.getAuthorId(commentId);

      expect(commentAuthorId).toEqual({ authorId });
    });
  });

  describe('getManyForPostWithChildrenCount', () => {
    it('should return comments for post with provided id', async () => {
      const postId = 1;
      const resolvedComments: CommentEntity[] = comments.slice(3, 5);

      commentRepository.getManyForPostWithChildrenCount.mockResolvedValue(
        resolvedComments,
      );

      const postComments = await service.getManyForPostWithChildrenCount(
        postId,
        {},
      );

      expect(postComments).toEqual(resolvedComments);
    });
  });

  describe('getDescendantsWithChildrenCount', () => {
    it('should return descendants of comment with provided id', async () => {
      const commentId = 1;

      commentRepository.getDescendantsWithChildrenCount.mockResolvedValue(
        comments,
      );

      const descendants = await service.getDescendantsWithChildrenCount(
        commentId,
        {},
      );

      expect(descendants).toEqual(comments);
    });
  });

  describe('getOne', () => {
    it('should return comment with provided id', async () => {
      const commentId = 1;
      const resolvedComment = comments[0];

      commentRepository.getOne.mockResolvedValue(resolvedComment);

      const comment = await service.getOne(commentId);

      expect(comment).toEqual(resolvedComment);
    });
  });

  describe('update', () => {
    it('should update comment with provided id', async () => {
      const commentId = 1;
      const commentData = { content: 'new content' };
      const resolvedComment = {
        ...comments[0],
        ...commentData,
      };

      commentRepository.getOne.mockResolvedValue(resolvedComment);
      commentRepository.update.mockResolvedValue(resolvedComment);

      const updatedComment = await service.update(commentId, commentData);

      expect(updatedComment).toEqual(resolvedComment);
    });

    it('should throw NotFoundError if comment is deleted', () => {
      const commentId = 1;
      const commentData = { content: 'new content' };
      const resolvedComment = {
        ...comments[0],
        isDeleted: true,
      };

      commentRepository.getOne.mockResolvedValue(resolvedComment);

      expect(service.update(commentId, commentData)).rejects.toThrow(
        new NotFoundError('Comment not found'),
      );
    });
  });

  describe('softRemove', () => {
    it('should soft remove comment with provided id', async () => {
      const commentId = 1;
      const resolvedComment = {
        ...comments[0],
        isDeleted: true,
      };

      commentRepository.softRemove.mockResolvedValue(resolvedComment);

      const updatedComment = await service.softRemove(commentId);

      expect(updatedComment).toEqual(resolvedComment);
    });
  });
});
