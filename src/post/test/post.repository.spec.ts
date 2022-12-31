import { Test, TestingModule } from '@nestjs/testing';
import { Post, Prisma, PrismaClient } from '@prisma/client';
import { DeepMockProxy, mockDeep } from 'jest-mock-extended';
import slugify from 'slugify';
import { PrismaService } from 'src/prisma/prisma.service';
import { PostRepository } from '../post.repository';

const postArray = [
  {
    id: 1006,
    createdAt: new Date(),
    updatedAt: new Date(),
    title: 'Tailwind vs. Bootstrap',
    slug: 'tailwind-vs.-bootstrap',
    excerpt:
      'Both Tailwind and Bootstrap are very popular CSS frameworks. In this article, we will compare them',
    coverImage: '/images/posts/img2.jpg',
    authorId: '2',
    published: true,
    content: 'content',
  },
  {
    id: 335,
    createdAt: new Date(),
    updatedAt: new Date(),
    title: 'Nostrum velit non.',
    slug: 'nostrum-velit-non.',
    excerpt:
      'Deserunt aut dolor voluptatem pariatur at quia enim rerum quod omnis non harum harum velit.',
    coverImage: 'http://loremflickr.com/1200/480/business',
    authorId: '1',
    published: true,
    content: 'content',
  },
  {
    id: 995,
    createdAt: new Date(),
    updatedAt: new Date(),
    title: 'Architecto iusto nesciunt.',
    slug: 'architecto-iusto-nesciunt.',
    excerpt:
      'Quam est est iste voluptatem consectetur illo sit voluptatem est labore laborum debitis quia sint.',
    coverImage: 'http://loremflickr.com/1200/480/business',
    authorId: '4',
    published: true,
    content: 'content',
  },
];

const onePost = postArray[0];

describe('PostRepository', () => {
  let repository: PostRepository;
  let prisma: DeepMockProxy<PrismaService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PostRepository,
        {
          provide: PrismaService,
          useValue: mockDeep<PrismaClient>(),
        },
      ],
    }).compile();

    repository = module.get<PostRepository>(PostRepository);
    prisma = module.get(PrismaService);
  });

  it('should be defined', () => {
    expect(repository).toBeDefined();
  });

  describe('getIds', () => {
    it('should get postIds', async () => {
      const payload = [
        { id: 12 },
        { id: 11 },
      ] as unknown as Prisma.Prisma__PostClient<Array<Post>>;

      prisma.post.findMany.mockResolvedValue(payload);

      const postsIds = await repository.getIds({});

      expect(postsIds).toEqual(payload);
    });
  });

  describe('findIds', () => {
    it('should find postIds', async () => {
      const payload = [
        { id: 12 },
        { id: 11 },
      ] as unknown as Prisma.Prisma__PostClient<Array<Post>>;

      prisma.$queryRaw.mockResolvedValue(payload);

      // prisma.post.findMany.mockResolvedValue(payload);

      const postsIds = await repository.findIds({
        searchTerm: 'good search term',
      });

      expect(postsIds).toEqual(payload);
    });
  });

  describe('getMany', () => {
    it('should get posts', async () => {
      prisma.post.findMany.mockResolvedValue(postArray);

      const posts = await repository.getMany({});

      expect(posts).toEqual(postArray);
    });
  });

  describe('findMany', () => {
    it('should find posts', async () => {
      prisma.$queryRaw.mockResolvedValue(postArray);

      const posts = await repository.findMany({ searchTerm: 'test' });

      expect(posts).toEqual(postArray);
    });
  });

  describe('getManyByCategories', () => {
    it('should get posts', async () => {
      prisma.$queryRaw.mockResolvedValue(postArray);

      const posts = await repository.getManyByCategories({
        category: 'test',
      });

      expect(posts).toEqual(postArray);
    });
  });

  describe('findManyByCategories', () => {
    it('should find posts', async () => {
      prisma.$queryRaw.mockResolvedValue(postArray);

      const posts = await repository.findManyByCategories({
        searchTerm: 'test',
        category: 'test',
      });

      expect(posts).toEqual(postArray);
    });
  });

  describe('getSlugsForPublished', () => {
    it('should get published posts slugs', async () => {
      const payload = [
        { slug: 'slug1' },
        { slug: 'slug2' },
      ] as unknown as Prisma.Prisma__PostClient<Array<Post>>;
      prisma.post.findMany.mockResolvedValue(payload);

      const posts = await repository.getSlugsForPublished();

      expect(posts).toEqual(payload);
    });
  });

  describe('getOnePublishedBySlug', () => {
    it('should get published post by slug', async () => {
      prisma.post.findFirstOrThrow.mockResolvedValue(onePost);

      const post = await repository.getOnePublishedBySlug('slug');

      expect(post).toEqual(onePost);
    });

    it('should throw PrismaClientKnownRequestError if no post found', async () => {
      const exception = new Prisma.PrismaClientKnownRequestError(
        'An operation failed because it depends on one or more records that were required but not found. {cause}',
        {
          code: 'P2025',
          clientVersion: '2.19.0',
        },
      );

      prisma.post.findFirstOrThrow.mockRejectedValue(exception);

      const post = repository.getOnePublishedBySlug('slug');

      await expect(post).rejects.toThrowError(exception);
    });
  });

  describe('getAuthorById', () => {
    it("should get post's author by post id", async () => {
      const expectedAuthor = {
        authorId: 'afe39927-eb6b-4e73-8d06-239fe6b14eb4',
      } as unknown as Prisma.Prisma__PostClient<Post>;
      const postId = 12;

      prisma.post.findUniqueOrThrow.mockResolvedValue(expectedAuthor);

      const author = await repository.getAuthorById(postId);

      expect(author).toEqual(expectedAuthor);
    });
  });

  describe('getAuthorBySlug', () => {
    it("should get post's author by post slug", async () => {
      const expectedAuthor = {
        authorId: 'afe39927-eb6b-4e73-8d06-239fe6b14eb4',
      } as unknown as Prisma.Prisma__PostClient<Post>;
      const postSlug = 'slug';

      prisma.post.findUniqueOrThrow.mockResolvedValue(expectedAuthor);

      const author = await repository.getAuthorBySlug(postSlug);

      expect(author).toEqual(expectedAuthor);
    });
  });

  describe('getAuthorById', () => {
    it("should get post's author by post id", async () => {
      const expectedAuthor = {
        authorId: 'afe39927-eb6b-4e73-8d06-239fe6b14eb4',
      } as unknown as Prisma.Prisma__PostClient<Post>;
      const postId = 12;

      prisma.post.findUniqueOrThrow.mockResolvedValue(expectedAuthor);

      const author = await repository.getAuthorById(postId);

      expect(author).toEqual(expectedAuthor);
    });
  });

  describe('publishOneBySlug', () => {
    it('should publish post by slug', async () => {
      prisma.post.update.mockResolvedValue(onePost);

      const publishedPost = await repository.publishOneBySlug('slug');

      expect(publishedPost).toEqual(onePost);
    });
  });

  describe('create', () => {
    const postData = {
      createdAt: new Date(),
      title: 'Architecto iustos nesciunt.',
      excerpt:
        'Quam consectetur illo sit voluptatem est labore laborum debitis quia sint.',
      coverImage: 'http://loremflickr.com/1200/480/business',
      published: true,
      content: 'content',
    };
    const postToCreate = {
      ...postData,
      slug: slugify(postData.title, { lower: true }),
    };

    const authorId = 'ab182222-5603-4b01-909b-a68fbb3a2153';

    it('should create new post with postData, authorId provided', async () => {
      prisma.post.create.mockResolvedValue({
        ...postToCreate,
        id: 12312,
        authorId,
        updatedAt: new Date(),
      });

      const createdPost = await repository.create(postToCreate, authorId);

      expect(createdPost).toMatchObject({
        ...postToCreate,
        id: expect.any(Number),
        authorId: expect.any(String),
        updatedAt: expect.any(Date),
      });
    });
  });

  describe('update', () => {
    const postData = {
      id: 12312,
      createdAt: new Date(),
      title: 'Architecto iustos nesciunt.',
      slug: 'architecto-iustos-nesciunt.',
      excerpt:
        'Quam consectetur illo sit voluptatem est labore laborum debitis quia sint.',
      coverImage: 'http://loremflickr.com/1200/480/business',
      published: true,
      content: 'content',
    };
    const postToUpdate = { ...postData };

    const authorId = 'ab182222-5603-4b01-909b-a68fbb3a2153';

    it('should update post with postData provided', async () => {
      prisma.post.update.mockResolvedValue({
        ...postToUpdate,
        id: 12312,
        authorId,
        updatedAt: new Date(),
      });

      const updatedPost = await repository.update(postToUpdate);

      expect(updatedPost).toMatchObject({
        ...postToUpdate,
        id: expect.any(Number),
        authorId: expect.any(String),
        updatedAt: expect.any(Date),
      });
    });
  });

  describe('deleteById', () => {
    it('should delete post by id, return deleted post', async () => {
      prisma.post.delete.mockResolvedValue(onePost);

      const deletedPost = await repository.deleteById(1);

      expect(deletedPost).toEqual(onePost);
    });

    it('should throw Prisma.PrismaClientKnownRequestError if no post exists', async () => {
      const id = 1;
      const exception = new Prisma.PrismaClientKnownRequestError(
        'An operation failed because it depends on one or more records that were required but not found. {cause}',
        {
          code: 'P2025',
          clientVersion: '2.19.0',
        },
      );

      prisma.post.delete.mockRejectedValue(exception);

      const deletePostBySlug = repository.deleteById(id);

      await expect(deletePostBySlug).rejects.toThrowError(exception);
    });
  });

  describe('deleteBySlug', () => {
    it('should delete post by slug, return deleted post', async () => {
      prisma.post.delete.mockResolvedValue(onePost);

      const deletedPost = await repository.deleteBySlug('slug');

      expect(deletedPost).toEqual(onePost);
    });

    it('should throw Prisma.PrismaClientKnownRequestError if no post exists', async () => {
      const slug = 'a bad slug';
      const exception = new Prisma.PrismaClientKnownRequestError(
        'An operation failed because it depends on one or more records that were required but not found. {cause}',
        {
          code: 'P2025',
          clientVersion: '2.19.0',
        },
      );

      prisma.post.delete.mockRejectedValue(exception);

      const deletePostBySlug = repository.deleteBySlug(slug);

      await expect(deletePostBySlug).rejects.toThrowError(exception);
    });
  });
});
