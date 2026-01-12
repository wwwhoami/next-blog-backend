import { EntityWithAuthorService } from '@core/src/common/entity-with-author.service';
import { Test, TestingModule } from '@nestjs/testing';
import { MockProxy, mock } from 'jest-mock-extended';
import { Post, Prisma } from 'prisma/generated/client';
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
    likesCount: 0,
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
    likesCount: 0,
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
    likesCount: 0,
  },
];
const onePost = postArray[0];

describe('PostController', () => {
  let controller: PostController;
  let postService: MockProxy<PostService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PostController],
      providers: [
        {
          provide: PostService,
          useValue: mock<PostService>(),
        },
        {
          provide: EntityWithAuthorService,
          useExisting: PostService,
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
      likesCount: 0,
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
      likesCount: 0,
    };
    const postToUpdate = postData;
    const authorData = {
      name: 'author name',
      image: 'author image',
    };

    it('should update post with postData provided', async () => {
      const postId = postData.id;
      const updatedPostReturn = {
        ...postData,
        slug: 'architecto-iustos-nesciunt.',
      };

      postService.update.mockResolvedValue({
        ...updatedPostReturn,
        author: authorData,
        updatedAt: new Date(),
      });

      const updatedPost = await controller.update(postId, postToUpdate);

      expect(updatedPost).toMatchObject({
        ...updatedPostReturn,
        id: expect.any(Number),
        author: expect.objectContaining(authorData),
        updatedAt: expect.any(Date),
      });
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

    it('should get post likes', async () => {
      const postId = 1;

      postService.getLikes.mockResolvedValue(likes);

      const postLikes = await controller.getLikes(postId);

      expect(postLikes).toEqual(likes);
    });

    it('should throw Prisma.PrismaClientKnownRequestError if no post exists', async () => {
      const postId = 1;
      const exception = new Prisma.PrismaClientKnownRequestError(
        'An operation failed because it depends on one or more records that were required but not found. {cause}',
        {
          code: 'P2025',
          clientVersion: '2.19.0',
        },
      );

      postService.getLikes.mockRejectedValue(exception);

      const getPostLikes = controller.getLikes(postId);

      await expect(getPostLikes).rejects.toThrow(exception);
    });
  });

  describe('like', () => {
    it('should like post', async () => {
      const postId = 1;
      const userId = 'afe39927-eb6b-4e73-8d06-239fe6b14eb4';
      const expected = {
        id: postId,
        likesCount: 1,
      };

      postService.like.mockResolvedValue(expected);

      const postLikes = await controller.like(postId, userId);
      expect(postLikes).toEqual(expected);
    });
  });

  describe('unlike', () => {
    it('unlike post', async () => {
      const postId = 1;
      const userId = 'afe39927-eb6b-4e73-8d06-239fe6b14eb4';
      const expected = {
        id: postId,
        likesCount: 1,
      };

      postService.unlike.mockResolvedValue(expected);

      const postLikes = await controller.unlike(postId, userId);
      expect(postLikes).toEqual(expected);
    });
  });

  describe('delete', () => {
    it('should delete post by id, if id as number provided', async () => {
      const id = onePost.id;
      postService.delete.mockResolvedValue(onePost);

      const deletedPost = await controller.delete(id);

      expect(deletedPost).toEqual(onePost);
    });
  });
});
