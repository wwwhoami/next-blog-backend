import { Test, TestingModule } from '@nestjs/testing';
import { mock, MockProxy } from 'jest-mock-extended';
import { EntityWithAuthorService } from 'src/common/entity-with-author.service';
import { CommentController } from '../comment.controller';
import { CommentService } from '../comment.service';
import { CreateCommentDto } from '../dto/create-comment.dto';
import { UpdateCommentDto } from '../dto/update-comment.dto';
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
  },
];

describe('CommentController', () => {
  let controller: CommentController;
  let commentService: MockProxy<CommentService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CommentController],
      providers: [
        {
          provide: CommentService,
          useValue: mock<CommentService>(),
        },
        {
          provide: EntityWithAuthorService,
          useExisting: CommentService,
        },
      ],
    }).compile();

    commentService = module.get(CommentService);
    controller = module.get<CommentController>(CommentController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    it('should create a comment calling commentService.create', async () => {
      const commentData: CreateCommentDto = {
        postId: 1,
        content: 'content',
      };
      const resolvedComment: CommentEntity = {
        ...commentData,
        id: 1,
        ancestorId: null,
        authorId,
        createdAt: new Date(),
        updatedAt: new Date(),
        isDeleted: false,
      };

      commentService.create.mockResolvedValueOnce(resolvedComment);

      expect(controller.create(authorId, commentData)).resolves.toEqual(
        resolvedComment,
      );
      expect(commentService.create).toBeCalledWith(commentData, authorId);
    });
  });

  describe('getOne', () => {
    it('should get a comment by id calling commentService.getOne', async () => {
      const commentId = 1;
      const resolvedComment: CommentEntityWithDepth = {
        ...comments[0],
      };

      commentService.getOne.mockResolvedValueOnce(resolvedComment);

      expect(controller.getOne(commentId)).resolves.toEqual(resolvedComment);
      expect(commentService.getOne).toBeCalledWith(commentId);
    });
  });

  describe('getReplies', () => {
    it('should get replies of a comment by id calling commentService.getReplies', async () => {
      const commentId = 1;
      const resolvedComments: CommentEntityWithDepth[] = comments.slice(2);

      commentService.getDescendantsWithChildrenCount.mockResolvedValueOnce(
        resolvedComments,
      );

      expect(controller.getReplies(commentId, {})).resolves.toEqual(
        resolvedComments,
      );
      expect(commentService.getDescendantsWithChildrenCount).toBeCalledWith(
        commentId,
        {},
      );
    });
  });

  describe('getForPost', () => {
    it('should get comments for a post with provided id calling commentService.getForPost', async () => {
      const postId = 1;
      const resolvedComments: CommentEntityWithDepth[] = comments.slice(0, 2);

      commentService.getManyForPostWithChildrenCount.mockResolvedValueOnce(
        resolvedComments,
      );

      expect(controller.getForPost(postId, {})).resolves.toEqual(
        resolvedComments,
      );
      expect(commentService.getManyForPostWithChildrenCount).toBeCalledWith(
        postId,
        {},
      );
    });
  });

  describe('update', () => {
    it('should update a comment by id calling commentService.update', async () => {
      const commentId = 1;
      const commentData: UpdateCommentDto = {
        content: 'new content',
      };
      const resolvedComment: CommentEntity = {
        ...commentData,
        id: commentId,
        postId: 1,
        ancestorId: null,
        authorId,
        createdAt: new Date(),
        updatedAt: new Date(),
        isDeleted: false,
      };

      commentService.update.mockResolvedValueOnce(resolvedComment);

      expect(controller.update(commentId, commentData)).resolves.toEqual(
        resolvedComment,
      );
      expect(commentService.update).toBeCalledWith(commentId, commentData);
    });
  });

  describe('remove', () => {
    it('should remove a comment by id calling commentService.softRemove', async () => {
      const commentId = 1;
      const resolvedComment = {
        ...comments[0],
        isDeleted: true,
      };

      commentService.softRemove.mockResolvedValueOnce(resolvedComment);

      expect(controller.remove(commentId)).resolves.toEqual(resolvedComment);
      expect(commentService.softRemove).toBeCalledWith(commentId);
    });
  });
});
