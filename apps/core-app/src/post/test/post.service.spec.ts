import { NotificationService } from '@core/src/notification/notification.service';
import { ClientProxy } from '@nestjs/microservices';
import { Test, TestingModule } from '@nestjs/testing';
import { Post, Prisma } from '@prisma/client';
import { MockProxy, mock } from 'jest-mock-extended';
import slugify from 'slugify';
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
        {
          provide: NotificationService,
          useValue: mock<ClientProxy>(),
        },
      ],
    }).compile();

    service = module.get<PostService>(PostService);
    postRepository = module.get(PostRepository);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getIds', () => {
    it('should get postIds', async () => {
      const payload = [
        { id: 12 },
        { id: 11 },
      ] as unknown as Prisma.Prisma__PostClient<Array<Post>>;

      postRepository.getIds.mockResolvedValue(payload);

      const postsIds = await service.getIds();

      expect(postsIds).toEqual(payload);
    });

    it('should find postIds if searchTerm provided', async () => {
      const searchTerm = 'search term';
      const payload = [
        { id: 12 },
        { id: 11 },
      ] as unknown as Prisma.Prisma__PostClient<Array<Post>>;

      postRepository.findIds.mockResolvedValue(payload);

      const postsIds = await service.getIds({ searchTerm });

      expect(postsIds).toEqual(payload);
    });
  });

  describe('getMany', () => {
    it('should get posts', async () => {
      postRepository.getMany.mockResolvedValue(postArray);

      const posts = await service.getMany();

      expect(posts).toEqual(postArray);
    });

    it('should get posts by category if category property is provided', async () => {
      const category = 'category';
      postRepository.getMany.mockResolvedValue(postArray);

      const posts = await service.getMany({ category });

      expect(posts).toEqual(postArray);
    });

    it('should find posts if searchTerm property is provided', async () => {
      const searchTerm = 'search term';
      postRepository.getMany.mockResolvedValue(postArray);

      const posts = await service.getMany({ searchTerm });

      expect(posts).toEqual(postArray);
    });

    it('should find posts by category if both searchTerm and category properties are provided', async () => {
      const category = 'category';
      const searchTerm = 'search term';
      postRepository.getMany.mockResolvedValue(postArray);

      const posts = await service.getMany({ category, searchTerm });

      expect(posts).toEqual(postArray);
    });
  });

  describe('getSlugsForPublished', () => {
    it('should get published posts slugs', async () => {
      const payload = [
        { slug: 'slug1' },
        { slug: 'slug2' },
      ] as unknown as Prisma.Prisma__PostClient<Array<Post>>;
      postRepository.getSlugsForPublished.mockResolvedValue(payload);

      const posts = await service.getSlugsForPublished();

      expect(posts).toEqual(payload);
    });
  });

  describe('getOnePublishedBySlug', () => {
    it('should get published post by slug', async () => {
      postRepository.getOnePublishedBySlug.mockResolvedValue(onePost);

      const posts = await service.getOnePublishedBySlug('slug');

      expect(posts).toEqual(onePost);
    });

    it('should should throw PrismaClientKnownRequestError if no post found', async () => {
      const exception = new Prisma.PrismaClientKnownRequestError(
        'An operation failed because it depends on one or more records that were required but not found. {cause}',
        {
          code: 'P2025',
          clientVersion: '2.19.0',
        },
      );

      postRepository.getOnePublishedBySlug.mockRejectedValue(exception);

      const getPublishedPostBySlug = service.getOnePublishedBySlug('slug');

      await expect(getPublishedPostBySlug).rejects.toThrow(exception);
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
      postRepository.create.mockResolvedValue({
        ...postToCreate,
        id: 12312,
        author: authorData,
        updatedAt: new Date(),
        likesCount: 0,
      });

      const createdPost = await service.create(postToCreate, authorId);

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

      postRepository.update.mockResolvedValue({
        ...updatedPostReturn,
        author: authorData,
        updatedAt: new Date(),
      });

      const updatedPost = await service.update(postId, postToUpdate);

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

      postRepository.getLikes.mockResolvedValue(likes);

      const postLikes = await service.getLikes(postId);

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

      postRepository.getLikes.mockRejectedValue(exception);

      const getPostLikes = service.getLikes(postId);

      await expect(getPostLikes).rejects.toThrow(exception);
    });
  });

  describe('like', () => {
    it('should like post', async () => {
      const postId = 1;
      const userId = 'afe39927-eb6b-4e73-8d06-239fe6b14eb4';
      const authorId = 'afe39927-eb6b-4e73-8d06-239fe6b14eb5';
      const expected = {
        id: postId,
        likesCount: 1,
      };

      postRepository.like.mockResolvedValue(expected);
      postRepository.getAuthorById.mockResolvedValue({ authorId });

      const postLikes = await service.like(postId, userId);

      expect(postLikes).toEqual(expected);
    });
  });

  describe('unlike', () => {
    it('unlike post', async () => {
      const postId = 1;
      const userId = 'afe39927-eb6b-4e73-8d06-239fe6b14eb4';
      const authorId = 'afe39927-eb6b-4e73-8d06-239fe6b14eb5';
      const expected = {
        id: postId,
        likesCount: 1,
      };

      postRepository.unlike.mockResolvedValue(expected);
      postRepository.getAuthorById.mockResolvedValue({ authorId });

      const postLikes = await service.unlike(postId, userId);

      expect(postLikes).toEqual(expected);
    });
  });

  describe('publishOneBySlug', () => {
    it('should publish post by slug', async () => {
      postRepository.publishOneBySlug.mockResolvedValue(onePost);

      const publishedPost = await service.publishOneBySlug('slug');

      expect(publishedPost).toEqual(onePost);
    });
  });

  describe('getAuthorId', () => {
    const authorId = 'ab182222-5603-4b01-909b-a68fbb3a2153';

    it("should get post's author id by post's id", async () => {
      const id = onePost.id;
      postRepository.getAuthorById.mockResolvedValue({ authorId });

      const author = await service.getAuthorId(id);

      expect(author).toEqual({ authorId });
    });

    it("should get post's author id by post's slug", async () => {
      const slug = onePost.slug;

      postRepository.getAuthorBySlug.mockResolvedValue({ authorId });

      const author = await service.getAuthorId(slug);

      expect(author).toEqual({ authorId });
    });
  });

  describe('delete', () => {
    it('should delete post by id, if id as number provided', async () => {
      const id = onePost.id;
      postRepository.deleteById.mockResolvedValue(onePost);

      const deletedPost = await service.delete(id);

      expect(deletedPost).toEqual(onePost);
    });

    it('should delete post by slug, if slug as string provided', async () => {
      const slug = onePost.slug;

      postRepository.deleteBySlug.mockResolvedValue(onePost);

      const deletedPost = await service.delete(slug);

      expect(deletedPost).toEqual(onePost);
    });
  });
});
