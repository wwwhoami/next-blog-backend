import { Test, TestingModule } from '@nestjs/testing';
import { Post, Prisma } from '@prisma/client';
import { mock, MockProxy } from 'jest-mock-extended';
import slugify from 'slugify';
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

  describe('getMany', () => {
    it('should get posts', async () => {
      postService.getMany.mockResolvedValue(postArray);

      const posts = await controller.posts({});

      expect(posts).toEqual(postArray);
    });
  });

  describe('getSlugsForPublished', () => {
    it('should get published posts slugs', async () => {
      const payload = [
        { slug: 'slug1' },
        { slug: 'slug2' },
      ] as unknown as Prisma.Prisma__PostClient<Array<Post>>;
      postService.getSlugsForPublished.mockResolvedValue(payload);

      const posts = await controller.getSlugsForPublished();

      expect(posts).toEqual(payload);
    });
  });

  describe('getOnePublishedBySlug', () => {
    it('should get published post by slug', async () => {
      postService.getOnePublishedBySlug.mockResolvedValue(onePost);

      const posts = await controller.getOnePublishedBySlug('slug');

      expect(posts).toEqual(onePost);
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
    const authorData = {
      name: 'author name',
      image: 'author image',
    };

    it('should create new post with postData, authorId provided', async () => {
      postService.create.mockResolvedValue({
        ...postToCreate,
        id: 12312,
        author: authorData,
        updatedAt: new Date(),
      });

      const createdPost = await controller.create(authorId, postToCreate);

      expect(createdPost).toMatchObject({
        ...postToCreate,
        id: expect.any(Number),
        author: expect.objectContaining(authorData),
        updatedAt: expect.any(Date),
      });
    });
  });

  describe('update', () => {
    const postData = {
      id: 12312,
      createdAt: new Date(),
      title: 'Architecto iustos nesciunt.',
      excerpt:
        'Quam consectetur illo sit voluptatem est labore laborum debitis quia sint.',
      coverImage: 'http://loremflickr.com/1200/480/business',
      published: true,
      content: 'content',
    };
    const postToUpdate = postData;
    const authorData = {
      name: 'author name',
      image: 'author image',
    };

    it('should update post with postData provided', async () => {
      const updatedPostReturn = {
        ...postData,
        slug: 'architecto-iustos-nesciunt.',
      };

      postService.update.mockResolvedValue({
        ...updatedPostReturn,
        author: authorData,
        updatedAt: new Date(),
      });

      const updatedPost = await controller.update(postToUpdate);

      expect(updatedPost).toMatchObject({
        ...updatedPostReturn,
        id: expect.any(Number),
        author: expect.objectContaining(authorData),
        updatedAt: expect.any(Date),
      });
    });
  });

  describe('delete', () => {
    it('should delete post by id, if id provided', async () => {
      const id = onePost.id;
      postService.delete.mockResolvedValue(onePost);

      const deletedPost = await controller.delete({ id });

      expect(deletedPost).toEqual(onePost);
    });

    it('should delete post by slug, if no id, but slug provided', async () => {
      const slug = onePost.slug;

      postService.delete.mockResolvedValue(onePost);

      const deletedPost = await controller.delete({ slug });

      expect(deletedPost).toEqual(onePost);
    });
  });
});
