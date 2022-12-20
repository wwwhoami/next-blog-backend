import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Post, Prisma } from '@prisma/client';
import { mock, MockProxy } from 'jest-mock-extended';
import { PostController } from '../post.controller';
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

describe('PostController', () => {
  let controller: PostController;
  let postService: MockProxy<PostService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PostController,
        {
          provide: PostService,
          useValue: mock<PostService>(),
        },
      ],
    }).compile();

    controller = module.get<PostController>(PostController);
    postService = module.get(PostService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getPosts', () => {
    it('should get posts', async () => {
      postService.getPosts.mockResolvedValue(postArray);

      const posts = await controller.getPosts({});

      expect(posts).toEqual(postArray);
    });
  });

  describe('getPublishedPostsSlugs', () => {
    it('should get published posts slugs', async () => {
      const payload = [
        { slug: 'slug1' },
        { slug: 'slug2' },
      ] as unknown as Prisma.Prisma__PostClient<Array<Post>>;
      postService.getPublishedPostsSlugs.mockResolvedValue(payload);

      const posts = await controller.getPublishedPostsSlugs();

      expect(posts).toEqual(payload);
    });
  });

  describe('getPublishedPostBySlug', () => {
    it('should get published post by slug', async () => {
      postService.getPublishedPostBySlug.mockResolvedValue(onePost);

      const posts = await controller.getPublishedPostBySlug('slug');

      expect(posts).toEqual(onePost);
    });

    it('should throw NotFoundException if no post found', async () => {
      postService.getPublishedPostBySlug.mockResolvedValue(null);

      const getPublishedPostBySlug = controller.getPublishedPostBySlug('slug');

      await expect(getPublishedPostBySlug).rejects.toThrowError(
        NotFoundException,
      );
    });
  });
});
