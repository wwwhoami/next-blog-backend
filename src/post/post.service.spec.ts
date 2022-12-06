import {
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Post, Prisma, PrismaClient } from '@prisma/client';
import { DeepMockProxy, mockDeep } from 'jest-mock-extended';
import { PrismaService } from 'src/prisma/prisma.service';
import { PostService } from './post.service';

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
  let service: PostService;
  let prisma: DeepMockProxy<PrismaService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PostService,
        {
          provide: PrismaService,
          useValue: mockDeep<PrismaClient>(),
        },
      ],
    }).compile();

    service = module.get<PostService>(PostService);
    prisma = module.get(PrismaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getPostIds', () => {
    it('should get postIds', async () => {
      const payload = [
        { id: 12 },
        { id: 11 },
      ] as unknown as Prisma.Prisma__PostClient<Array<Post>>;

      prisma.post.findMany.mockResolvedValue(payload);

      const postsIds = await service.getPosts({});

      await expect(postsIds).toEqual(payload);
    });
  });

  describe('findPostIds', () => {
    it('should find postIds', async () => {
      const payload = [
        { id: 12 },
        { id: 11 },
      ] as unknown as Prisma.Prisma__PostClient<Array<Post>>;

      prisma.post.findMany.mockResolvedValue(payload);

      const postsIds = await service.findPostIds({
        searchTerm: 'good search term',
      });

      expect(postsIds).toEqual(payload);
    });
  });

  describe('getPosts', () => {
    it('should get posts', async () => {
      prisma.post.findMany.mockResolvedValue(postArray);

      const posts = await service.getPosts({});

      expect(posts).toEqual(postArray);
    });
  });

  describe('findPosts', () => {
    it('should find posts', async () => {
      prisma.post.findMany.mockResolvedValue(postArray);

      const posts = await service.findPosts({ searchTerm: 'test' });

      expect(posts).toEqual(postArray);
    });
  });

  describe('getPostsByCategories', () => {
    it('should find no posts if postToCategory.groupBy resolved value is empty', async () => {
      prisma.postToCategory.groupBy.mockResolvedValue([]);
      prisma.post.findMany.mockResolvedValue(postArray);

      const posts = await service.getPostsByCategories({
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

      const posts = await service.getPostsByCategories({
        category: 'test',
      });

      expect(posts).toEqual(postArray);
    });
  });

  describe('findPostsByCategories', () => {
    it('should find no posts if postToCategory.groupBy resolved value is empty', async () => {
      prisma.postToCategory.groupBy.mockResolvedValue([]);
      prisma.post.findMany.mockResolvedValue(postArray);

      const posts = await service.findPostsByCategories({
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

      const posts = await service.findPostsByCategories({
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

      const posts = await service.getPublishedPostsSlugs();

      expect(posts).toEqual(payload);
    });
  });

  describe('getPublishedPostBySlug', () => {
    it('should get published post by slug', async () => {
      prisma.post.findFirst.mockResolvedValue(onePost);

      const posts = await service.getPublishedPostBySlug('slug');

      expect(posts).toEqual(onePost);
    });

    it('should throw NotFoundException if no post found', async () => {
      prisma.post.findFirst.mockResolvedValue(null);

      const getPublishedPostBySlug = service.getPublishedPostBySlug('slug');

      await expect(getPublishedPostBySlug).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('publishPostBySlug', () => {
    it('should publish post by slug', async () => {
      prisma.post.update.mockResolvedValue(onePost);

      const publishedPost = await service.publishPostBySlug('slug');

      expect(publishedPost).toEqual(onePost);
    });
  });

  describe('deletePostBySlug', () => {
    it('should delete post by slug', async () => {
      prisma.post.delete.mockResolvedValue(onePost);

      const deletedPost = await service.deletePostBySlug('slug');

      expect(deletedPost).toEqual(onePost);
    });

    it('should throw NotFoundException if no post exists', async () => {
      const slug = 'a bad slug';
      const exception = new Prisma.PrismaClientKnownRequestError(
        'An operation failed because it depends on one or more records that were required but not found. {cause}',
        {
          code: 'P2025',
          clientVersion: '2.19.0',
        },
      );
      const expectedException = new NotFoundException(
        `Post with slug ${slug} not found`,
      );

      prisma.post.delete.mockRejectedValue(exception);

      const deletePostBySlug = service.deletePostBySlug(slug);

      await expect(deletePostBySlug).rejects.toThrowError(expectedException);
    });

    it('should throw InternalServerErrorException if caught unknown exception', async () => {
      const slug = 'a bad slug';
      const exception = new Error('unknown error');
      const expectedException = new InternalServerErrorException();

      prisma.post.delete.mockRejectedValue(exception);

      const deletePostBySlug = service.deletePostBySlug(slug);

      await expect(deletePostBySlug).rejects.toThrowError(expectedException);
    });
  });
});
