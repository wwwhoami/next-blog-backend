import { Test, TestingModule } from '@nestjs/testing';
import { Comment, Prisma, PrismaClient } from '@prisma/client';
import { DeepMockProxy, mockDeep } from 'jest-mock-extended';
import { ConflictError } from 'src/common/errors/conflict.error';
import { NotFoundError } from 'src/common/errors/not-found.error';
import { PostRepository } from 'src/post/post.repository';
import { PrismaService } from 'src/prisma/prisma.service';
import { CommentRepository } from '../comment.repository';
import {
  CreateCommentDto,
  CreateResponseToCommentDto,
} from '../dto/create-comment.dto';
import { CommentOrderBy } from '../dto/get-comment.dto';
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

describe('CommentService', () => {
  let repository: CommentRepository;
  let prisma: DeepMockProxy<PrismaService>;
  let postRepository: DeepMockProxy<PostRepository>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CommentRepository,
        { provide: PostRepository, useValue: mockDeep<PostRepository>() },
        {
          provide: PrismaService,
          useValue: mockDeep<PrismaClient>(),
        },
      ],
    }).compile();

    prisma = module.get(PrismaService);
    postRepository = module.get(PostRepository);
    repository = module.get<CommentRepository>(CommentRepository);
  });

  it('should be defined', () => {
    expect(repository).toBeDefined();
  });

  describe('pickOrdering', () => {
    it('returns correct order as Prisma.sql', () => {
      const orderBy: CommentOrderBy[] = ['createdAt', 'updatedAt'];
      const order: Prisma.SortOrder[] = ['desc', 'asc'];
      const expected = [
        Prisma.sql`created_at DESC`,
        Prisma.sql`created_at ASC`,
        Prisma.sql`updated_at DESC`,
        Prisma.sql`updated_at ASC`,
      ];

      const results = orderBy.flatMap((commentOrderBy) =>
        order.map((sortOrder) =>
          (repository as any).pickOrdering(commentOrderBy, sortOrder),
        ),
      );

      expect(results).toEqual(expected);
    });

    it('returns empty Prisma.sql as default', () => {
      const orderBy = 'test' as CommentOrderBy;
      const order: Prisma.SortOrder = 'desc';
      const expected = Prisma.sql``;

      const result = (repository as any).pickOrdering(orderBy, order);

      expect(result).toEqual(expected);
    });
  });

  describe('create', () => {
    const commentData: CreateCommentDto = {
      postId: 1,
      content: 'content',
    };

    it('should create comment with commentData, authorId provided', async () => {
      const resolvedComment = {
        ...commentData,
        id: 12312,
        authorId,
        updatedAt: new Date(),
        createdAt: new Date(),
        ancestorId: null,
        isDeleted: false,
      };
      prisma.comment.create.mockResolvedValue(resolvedComment);

      const createdComment = await repository.create(commentData, authorId);

      expect(createdComment).toMatchObject(resolvedComment);
    });
  });

  describe('createResponse', () => {
    const commentData: CreateResponseToCommentDto = {
      postId: 1,
      content: 'content',
      ancestorId: 12,
    };

    it('should create response to comment', async () => {
      const resolvedComment = {
        ...commentData,
        id: 12312,
        authorId,
        updatedAt: new Date(),
        createdAt: new Date(),
        isDeleted: false,
      };
      const commentAncestor = {
        id: 12,
        authorId,
        postId: 1,
        updatedAt: new Date(),
        createdAt: new Date(),
        isDeleted: false,
        content: 'content',
        ancestorId: null,
      };

      prisma.comment.findFirstOrThrow.mockResolvedValue(commentAncestor);
      prisma.comment.create.mockResolvedValue(resolvedComment);

      const createdResponse = await repository.createResponse(
        commentData,
        authorId,
      );

      expect(createdResponse).toEqual(resolvedComment);
    });

    it('should throw NotFoundError if ancestor is not found', async () => {
      const exception = new Prisma.PrismaClientKnownRequestError(
        'An operation failed because it depends on one or more records that were required but not found. {cause}',
        {
          code: 'P2025',
          clientVersion: '2.19.0',
        },
      );
      const getOne = jest.spyOn(repository, 'getOne');
      getOne.mockRejectedValue(exception);

      const createdResponse = repository.createResponse(commentData, authorId);

      expect(createdResponse).rejects.toThrow(NotFoundError);
    });

    it('should throw ConflictError if ancestor and comment to create have different postIds', async () => {
      const resolvedComment = {
        ...commentData,
        id: 12312,
        authorId,
        updatedAt: new Date(),
        createdAt: new Date(),
        isDeleted: false,
      };
      const commentAncestor = {
        id: 12,
        authorId,
        postId: 189,
        updatedAt: new Date(),
        createdAt: new Date(),
        isDeleted: false,
        content: 'content',
        ancestorId: null,
      };

      prisma.comment.findFirstOrThrow.mockResolvedValue(commentAncestor);
      prisma.comment.create.mockResolvedValue(resolvedComment);

      const createdResponse = repository.createResponse(commentData, authorId);

      expect(createdResponse).rejects.toThrow(ConflictError);
    });

    it('should throw ConflictError if ancestor is deleted', () => {
      const resolvedComment = {
        ...commentData,
        id: 12312,
        authorId,
        updatedAt: new Date(),
        createdAt: new Date(),
        isDeleted: false,
      };
      const commentAncestor = {
        id: 12,
        authorId,
        postId: 1,
        updatedAt: new Date(),
        createdAt: new Date(),
        isDeleted: true,
        content: 'content',
        ancestorId: null,
      };

      prisma.comment.findFirstOrThrow.mockResolvedValue(commentAncestor);
      prisma.comment.create.mockResolvedValue(resolvedComment);

      const createResponse = repository.createResponse(commentData, authorId);

      expect(createResponse).rejects.toThrow(ConflictError);
    });
  });

  describe('getManyForPost', () => {
    it('gets comments for provided post id', () => {
      const postId = 1;

      prisma.$queryRaw.mockResolvedValue(comments);

      expect(repository.getManyForPost(postId)).resolves.toEqual(comments);
    });

    it('should throw NotFoundError if post is not found', () => {
      const postId = 1;
      const exception = new Prisma.PrismaClientKnownRequestError(
        'An operation failed because it depends on one or more records that were required but not found. {cause}',
        {
          code: 'P2025',
          clientVersion: '2.19.0',
        },
      );

      postRepository.getOne.mockRejectedValue(exception);

      const getManyForPost = repository.getManyForPost(postId);

      expect(getManyForPost).rejects.toThrow(NotFoundError);
    });
  });

  describe('getManyForPostWithChildrenCount', () => {
    it('gets comments for provided post id, does not count children of elements that could not have children', () => {
      const postId = 1;
      const depth = 5;
      const descendants = comments.slice(3, 5);
      const descendantsWithChildrenCount = descendants.map((descendant) => ({
        ...descendant,
        childrenCount: undefined,
      }));

      prisma.$queryRaw.mockResolvedValue(descendants);

      const getCountOfDescendantsSpy = jest.spyOn(
        repository,
        'getCountOfDescendants',
      );

      expect(
        repository.getManyForPostWithChildrenCount(postId, { depth }),
      ).resolves.toEqual(descendantsWithChildrenCount);
      expect(getCountOfDescendantsSpy).toBeCalledTimes(0);
    });

    it('gets comments for provided post id, counts children of elements that could have children', () => {
      const postId = 1;
      const depth = 2;
      const descendants = comments.slice(3, 5);
      const countOfDescendants = 0;
      const descendantsWithChildrenCount = descendants.map((descendant) => ({
        ...descendant,
        childrenCount: countOfDescendants,
      }));

      prisma.$queryRaw.mockResolvedValue(descendants);
      jest
        .spyOn(repository, 'getCountOfDescendants')
        .mockResolvedValue(countOfDescendants);

      expect(
        repository.getManyForPostWithChildrenCount(postId, { depth }),
      ).resolves.toEqual(descendantsWithChildrenCount);
    });

    it('should throw NotFoundError if post is not found', () => {
      const postId = 1;
      const depth = 5;
      const exception = new Prisma.PrismaClientKnownRequestError(
        'An operation failed because it depends on one or more records that were required but not found. {cause}',
        {
          code: 'P2025',
          clientVersion: '2.19.0',
        },
      );

      postRepository.getOne.mockRejectedValue(exception);

      const getManyForPostWithChildrenCount =
        repository.getManyForPostWithChildrenCount(postId, { depth });

      expect(getManyForPostWithChildrenCount).rejects.toThrow(NotFoundError);
    });
  });

  describe('getDescendants', () => {
    it('gets comment descendants of comment id provided', () => {
      const commentId = comments[0].id;
      const descendants = comments.slice(3, 5);

      prisma.$queryRaw.mockResolvedValue(descendants);

      expect(repository.getDescendants(commentId)).resolves.toEqual(
        descendants,
      );
    });

    it('throws NotFoundError if comment with provided id does not exist', () => {
      const commentId = -1;
      const exception = new Prisma.PrismaClientKnownRequestError(
        'An operation failed because it depends on one or more records that were required but not found. {cause}',
        {
          code: 'P2025',
          clientVersion: '2.19.0',
        },
      );

      const getOne = jest.spyOn(repository, 'getOne');
      getOne.mockRejectedValue(exception);

      expect(repository.getDescendants(commentId)).rejects.toThrow(
        NotFoundError,
      );
    });
  });

  describe('getDescendantsWithChildrenCount', () => {
    it('gets descendants of comment with provided id, counts children of elements that could have children', () => {
      const commentId = comments[0].id;
      const depth = 2;
      const descendants = comments.slice(3, 5);
      const countOfDescendants = 0;
      const descendantsWithChildrenCount = descendants.map((descendant) => ({
        ...descendant,
        childrenCount: countOfDescendants,
      }));

      prisma.$queryRaw.mockResolvedValue(descendants);
      const getCountOfDescendantsSpy = jest.spyOn(
        repository,
        'getCountOfDescendants',
      );
      getCountOfDescendantsSpy.mockResolvedValue(countOfDescendants);

      expect(
        repository.getDescendantsWithChildrenCount(commentId, { depth }),
      ).resolves.toEqual(descendantsWithChildrenCount);
    });

    it('gets descendants of comment with provided id, does not count children of elements that could not have children', () => {
      const commentId = comments[0].id;
      const depth = 5;
      const descendants = comments.slice(3, 5);
      const descendantsWithChildrenCount = descendants.map((descendant) => ({
        ...descendant,
        childrenCount: undefined,
      }));

      prisma.$queryRaw.mockResolvedValue(descendants);

      const getCountOfDescendantsSpy = jest.spyOn(
        repository,
        'getCountOfDescendants',
      );

      expect(
        repository.getDescendantsWithChildrenCount(commentId, { depth }),
      ).resolves.toEqual(descendantsWithChildrenCount);
      expect(getCountOfDescendantsSpy).toBeCalledTimes(0);
    });

    it('throws NotFoundError if comment with provided id does not exist', () => {
      const commentId = -1;
      const depth = 5;
      const exception = new Prisma.PrismaClientKnownRequestError(
        'An operation failed because it depends on one or more records that were required but not found. {cause}',
        {
          code: 'P2025',
          clientVersion: '2.19.0',
        },
      );

      const getOne = jest.spyOn(repository, 'getOne');
      getOne.mockRejectedValue(exception);

      expect(
        repository.getDescendantsWithChildrenCount(commentId, { depth }),
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('getCountOfDescendants', () => {
    it('counts descendants of comment with provided id', () => {
      const commentId = comments[0].id;
      const countOfDescendants = BigInt(2);
      const expected = Number(countOfDescendants);

      prisma.$queryRaw.mockResolvedValue([{ count: countOfDescendants }]);

      expect(repository.getCountOfDescendants(commentId)).resolves.toEqual(
        expected,
      );
    });
  });

  describe('getOne', () => {
    const commentId = 1;

    it('gets comment by id', async () => {
      const expectedComment: CommentEntity = {
        id: commentId,
        authorId,
        postId: 1,
        ancestorId: null,
        content: 'content',
        createdAt: new Date(),
        updatedAt: new Date(),
        isDeleted: false,
      };

      prisma.comment.findFirstOrThrow.mockResolvedValue(expectedComment);

      const foundComment = await repository.getOne(commentId);

      expect(foundComment).toEqual(expectedComment);
    });
  });

  describe('getAuthorId', () => {
    const commentId = 1;

    it("gets comment's authorId by commentId", async () => {
      const expected =
        authorId as unknown as Prisma.Prisma__CommentClient<Comment>;

      prisma.comment.findFirstOrThrow.mockResolvedValue(expected);

      const foundAuthor = await repository.getAuthorId(commentId);

      expect(foundAuthor).toEqual(expected);
    });
  });

  describe('update', () => {
    const commentId = 1;
    const comment: UpdateCommentDto = {
      content: 'New content',
    };

    it('updates comment by id with data provided', async () => {
      const updatedComment: CommentEntity = {
        id: commentId,
        authorId,
        postId: 1,
        ancestorId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        isDeleted: false,
        ...comment,
      };

      prisma.comment.update.mockResolvedValue(updatedComment);

      const commentUpdated = await repository.update(commentId, comment);

      expect(commentUpdated).toEqual(updatedComment);
    });
  });

  describe('softRemove', () => {
    const commentId = 1;
    const authorId = 'ab182222-5603-4b01-909b-a68fbb3a2153';

    it('marks comment as deleted returns comment', async () => {
      const softRemovedComment: CommentEntity = {
        id: commentId,
        authorId,
        postId: 1,
        content: 'some content',
        ancestorId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        isDeleted: true,
      };

      prisma.comment.update.mockResolvedValue(softRemovedComment);

      const softRemove = await repository.softRemove(commentId);

      expect(softRemove).toEqual(softRemovedComment);
    });
  });
});
