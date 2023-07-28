import { Test, TestingModule } from '@nestjs/testing';
import { mock, MockProxy } from 'jest-mock-extended';
import { EntityWithAuthorService } from '@core/src/common/entity-with-author.service';
import { CommentController } from '../comment.controller';
import { CommentService } from '../comment.service';
import { CreateCommentDto } from '../dto/create-comment.dto';
import { UpdateCommentDto } from '../dto/update-comment.dto';
import {
  CommentEntity,
  CommentEntityWithDepth,
} from '../entities/comment.entity';
import { Prisma } from '@prisma/client';

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
        likesCount: 0,
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

  describe('getLikes', () => {
    const likes = [
      {
        user: {
          name: 'John',
          image: 'http://loremflickr.com/320/240/business',
        },
      },
      {
        user: {
          name: 'Jane',
          image: 'http://loremflickr.com/320/240/business',
        },
      },
    ];

    it('should get comment likes', async () => {
      const commentId = 1;

      commentService.getLikes.mockResolvedValue(likes);

      const commentLikes = await controller.getLikes(commentId);

      expect(commentLikes).toEqual(likes);
    });

    it('should throw Prisma.PrismaClientKnownRequestError if no comment exists', async () => {
      const commentId = 1;
      const exception = new Prisma.PrismaClientKnownRequestError(
        'An operation failed because it depends on one or more records that were required but not found. {cause}',
        {
          code: 'P2025',
          clientVersion: '2.19.0',
        },
      );

      commentService.getLikes.mockRejectedValue(exception);

      const getPostLikes = controller.getLikes(commentId);

      await expect(getPostLikes).rejects.toThrow(exception);
    });
  });

  describe('like', () => {
    it('should like comment', async () => {
      const commentId = 1;
      const userId = 'afe39927-eb6b-4e73-8d06-239fe6b14eb4';
      const expected = {
        id: commentId,
        likesCount: 1,
        postId: 1,
      };

      commentService.like.mockResolvedValue(expected);

      const commentLikes = await controller.like(commentId, userId);
      expect(commentLikes).toEqual(expected);
    });
  });

  describe('unlike', () => {
    it('unlike comment', async () => {
      const commentId = 1;
      const userId = 'afe39927-eb6b-4e73-8d06-239fe6b14eb4';
      const expected = {
        id: commentId,
        likesCount: 1,
        postId: 1,
      };

      commentService.unlike.mockResolvedValue(expected);

      const commentLikes = await controller.unlike(commentId, userId);
      expect(commentLikes).toEqual(expected);
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
        likesCount: 0,
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
