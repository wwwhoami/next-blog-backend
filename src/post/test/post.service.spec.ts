import {
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Post, Prisma } from '@prisma/client';
import { mock, MockProxy } from 'jest-mock-extended';
import { PostRepository } from '../post.repository';
import { PostService } from '../post.service';

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
    author: {
      name: 'Alice Johnson',
      image: 'https://randomuser.me/api/portraits/women/12.jpg',
    },
    categories: [
      {
        category: {
          name: 'CSS',
          hexColor: '#2563eb',
        },
      },
    ],
    content: 'some content',
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
    author: {
      name: 'Vicky',
      image:
        'https://cloudflare-ipfs.com/ipfs/Qmd3W5DuhgHirLHGVixi6V76LhCkZUz6pnFt5AJBiyvHye/avatar/1205.jpg',
    },
    categories: [
      {
        category: {
          name: 'CSS',
          hexColor: '#2563eb',
        },
      },
    ],
    content: 'some content',
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
    author: {
      name: 'Maybell',
      image:
        'https://cloudflare-ipfs.com/ipfs/Qmd3W5DuhgHirLHGVixi6V76LhCkZUz6pnFt5AJBiyvHye/avatar/790.jpg',
    },
    categories: [
      {
        category: {
          name: 'JavaScript',
          hexColor: '#ca8a04',
        },
      },
    ],
    content: 'some content',
  },
];
const onePost = postArray[0];

describe('PostService', () => {
  let service: PostService;
  let postRepository: MockProxy<PostRepository>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PostService,
        {
          provide: PostRepository,
          useValue: mock<PostRepository>(),
        },
      ],
    }).compile();

    service = module.get<PostService>(PostService);
    postRepository = module.get(PostRepository);
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

      postRepository.getPostIds.mockResolvedValue(payload);

      const postsIds = await service.getPostIds({});

      expect(postsIds).toEqual(payload);
    });

    it('should find postIds if searchTerm provided', async () => {
      const searchTerm = 'search term';
      const payload = [
        { id: 12 },
        { id: 11 },
      ] as unknown as Prisma.Prisma__PostClient<Array<Post>>;

      postRepository.findPostIds.mockResolvedValue(payload);

      const postsIds = await service.getPostIds({ searchTerm });

      expect(postsIds).toEqual(payload);
    });
  });

  describe('getPosts', () => {
    it('should get posts', async () => {
      postRepository.getPosts.mockResolvedValue(postArray);

      const posts = await service.getPosts({});

      expect(posts).toEqual(postArray);
    });

    it('should get posts by category if category property is provided', async () => {
      const category = 'category';
      postRepository.getPostsByCategories.mockResolvedValue(postArray);

      const posts = await service.getPosts({ category });

      expect(posts).toEqual(postArray);
    });

    it('should find posts if searchTerm property is provided', async () => {
      const searchTerm = 'search term';
      postRepository.findPosts.mockResolvedValue(postArray);

      const posts = await service.getPosts({ searchTerm });

      expect(posts).toEqual(postArray);
    });

    it('should find posts by category if both searchTerm and category properties are provided', async () => {
      const category = 'category';
      const searchTerm = 'search term';
      postRepository.findPostsByCategories.mockResolvedValue(postArray);

      const posts = await service.getPosts({ category, searchTerm });

      expect(posts).toEqual(postArray);
    });
  });

  describe('getPublishedPostsSlugs', () => {
    it('should get published posts slugs', async () => {
      const payload = [
        { slug: 'slug1' },
        { slug: 'slug2' },
      ] as unknown as Prisma.Prisma__PostClient<Array<Post>>;
      postRepository.getPublishedPostsSlugs.mockResolvedValue(payload);

      const posts = await service.getPublishedPostsSlugs();

      expect(posts).toEqual(payload);
    });
  });

  describe('getPublishedPostBySlug', () => {
    it('should get published post by slug', async () => {
      postRepository.getPublishedPostBySlug.mockResolvedValue(onePost);

      const posts = await service.getPublishedPostBySlug('slug');

      expect(posts).toEqual(onePost);
    });

    it('should throw NotFoundException if no post found', async () => {
      postRepository.getPublishedPostBySlug.mockResolvedValue(null);

      const getPublishedPostBySlug = service.getPublishedPostBySlug('slug');

      await expect(getPublishedPostBySlug).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('publishPostBySlug', () => {
    it('should publish post by slug', async () => {
      postRepository.publishPostBySlug.mockResolvedValue(onePost);

      const publishedPost = await service.publishPostBySlug('slug');

      expect(publishedPost).toEqual(onePost);
    });
  });

  describe('deletePostBySlug', () => {
    it('should delete post by slug', async () => {
      postRepository.deletePostBySlug.mockResolvedValue(onePost);

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

      postRepository.deletePostBySlug.mockRejectedValue(exception);

      const deletePostBySlug = service.deletePostBySlug(slug);

      await expect(deletePostBySlug).rejects.toThrowError(expectedException);
    });

    it('should throw InternalServerErrorException if caught unknown exception', async () => {
      const slug = 'a bad slug';
      const exception = new Error('unknown error');
      const expectedException = new InternalServerErrorException();

      postRepository.deletePostBySlug.mockRejectedValue(exception);

      const deletePostBySlug = service.deletePostBySlug(slug);

      await expect(deletePostBySlug).rejects.toThrowError(expectedException);
    });
  });
});
