import { Test, TestingModule } from '@nestjs/testing';
import { Post, Prisma, PrismaClient } from '@prisma/client';
import { DeepMockProxy, mockDeep } from 'jest-mock-extended';
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
    viewCount: 0,
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
    viewCount: 0,
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
    viewCount: 0,
    coverImage: 'http://loremflickr.com/1200/480/business',
    authorId: '4',
    published: true,
    content: 'content',
  },
];

const onePost = postArray[0];

describe('PostService', () => {
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

  describe('getPostIds', () => {
    it('should get postIds', async () => {
      const payload = [
        { id: 12 },
        { id: 11 },
      ] as unknown as Prisma.Prisma__PostClient<Array<Post>>;

      prisma.post.findMany.mockResolvedValue(payload);

      const postsIds = await repository.getPostIds({});

      expect(postsIds).toEqual(payload);
    });
  });

  describe('findPostIds', () => {
    it('should find postIds', async () => {
      const payload = [
        { id: 12 },
        { id: 11 },
      ] as unknown as Prisma.Prisma__PostClient<Array<Post>>;

      prisma.$queryRaw.mockResolvedValue(payload);

      // prisma.post.findMany.mockResolvedValue(payload);

      const postsIds = await repository.findPostIds({
        searchTerm: 'good search term',
      });

      expect(postsIds).toEqual(payload);
    });
  });

  describe('getPosts', () => {
    it('should get posts', async () => {
      prisma.post.findMany.mockResolvedValue(postArray);

      const posts = await repository.getPosts({});

      expect(posts).toEqual(postArray);
    });
  });

  describe('findPosts', () => {
    it('should find posts', async () => {
      prisma.$queryRaw.mockResolvedValue(postArray);

      const posts = await repository.findPosts({ searchTerm: 'test' });

      expect(posts).toEqual(postArray);
    });
  });

  describe('getPostsByCategories', () => {
    it('should find no posts if postToCategory.groupBy resolved value is empty', async () => {
      prisma.postToCategory.groupBy.mockResolvedValue([]);
      prisma.post.findMany.mockResolvedValue(postArray);

      const posts = await repository.getPostsByCategories({
        category: 'test',
      });

      expect(posts).toEqual([]);
    });

    it('should find posts if postToCategory.groupBy resolved value is not empty', async () => {
      const groupedPosts = [
        { postId: 12, categoryName: 'test' },
        { postId: 12, categoryName: 'test' },
      ] as any;

      prisma.postToCategory.groupBy.mockResolvedValue(groupedPosts);
      prisma.post.findMany.mockResolvedValue(postArray);

      const posts = await repository.getPostsByCategories({
        category: 'test',
      });

      expect(posts).toEqual(postArray);
    });
  });

  describe('findPostsByCategories', () => {
    it('should find no posts if postToCategory.groupBy resolved value is empty', async () => {
      prisma.postToCategory.groupBy.mockResolvedValue([]);
      prisma.post.findMany.mockResolvedValue(postArray);

      const posts = await repository.findPostsByCategories({
        searchTerm: 'test',
        category: 'test',
      });

      expect(posts).toEqual([]);
    });

    it('should find posts if postToCategory.groupBy resolved value is not empty', async () => {
      const groupedPosts = [
        { postId: 12, categoryName: 'test' },
        { postId: 12, categoryName: 'test' },
      ] as any;

      prisma.postToCategory.groupBy.mockResolvedValue(groupedPosts);
      prisma.post.findMany.mockResolvedValue(postArray);

      const posts = await repository.findPostsByCategories({
        searchTerm: 'test',
        category: 'test',
      });

      expect(posts).toEqual(postArray);
    });
  });

  describe('getPublishedPostsSlugs', () => {
    it('should get published posts slugs', async () => {
      const payload = [
        { slug: 'slug1' },
        { slug: 'slug2' },
      ] as unknown as Prisma.Prisma__PostClient<Array<Post>>;
      prisma.post.findMany.mockResolvedValue(payload);

      const posts = await repository.getPublishedPostsSlugs();

      expect(posts).toEqual(payload);
    });
  });

  describe('getPublishedPostBySlug', () => {
    it('should get published post by slug', async () => {
      prisma.post.findFirst.mockResolvedValue(onePost);

      const post = await repository.getPublishedPostBySlug('slug');

      expect(post).toEqual(onePost);
    });

    it('should return null if no post found', async () => {
      prisma.post.findFirst.mockResolvedValue(null);

      const post = await repository.getPublishedPostBySlug('slug');

      expect(post).toEqual(null);
    });
  });

  describe('publishPostBySlug', () => {
    it('should publish post by slug', async () => {
      prisma.post.update.mockResolvedValue(onePost);

      const publishedPost = await repository.publishPostBySlug('slug');

      expect(publishedPost).toEqual(onePost);
    });
  });

  describe('deletePostBySlug', () => {
    it('should delete post by slug', async () => {
      prisma.post.delete.mockResolvedValue(onePost);

      const deletedPost = await repository.deletePostBySlug('slug');

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

      const deletePostBySlug = repository.deletePostBySlug(slug);

      await expect(deletePostBySlug).rejects.toThrowError(exception);
    });
  });
});
