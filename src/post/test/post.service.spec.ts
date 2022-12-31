import { Test, TestingModule } from '@nestjs/testing';
import { Post, Prisma } from '@prisma/client';
import { mock, MockProxy } from 'jest-mock-extended';
import slugify from 'slugify';
import { WrongParamsError } from 'src/common/errors/wrong-params.error';
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

  describe('getIds', () => {
    it('should get postIds', async () => {
      const payload = [
        { id: 12 },
        { id: 11 },
      ] as unknown as Prisma.Prisma__PostClient<Array<Post>>;

      postRepository.getIds.mockResolvedValue(payload);

      const postsIds = await service.getIds({});

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

      const posts = await service.getMany({});

      expect(posts).toEqual(postArray);
    });

    it('should get posts by category if category property is provided', async () => {
      const category = 'category';
      postRepository.getManyByCategories.mockResolvedValue(postArray);

      const posts = await service.getMany({ category });

      expect(posts).toEqual(postArray);
    });

    it('should find posts if searchTerm property is provided', async () => {
      const searchTerm = 'search term';
      postRepository.findMany.mockResolvedValue(postArray);

      const posts = await service.getMany({ searchTerm });

      expect(posts).toEqual(postArray);
    });

    it('should find posts by category if both searchTerm and category properties are provided', async () => {
      const category = 'category';
      const searchTerm = 'search term';
      postRepository.findManyByCategories.mockResolvedValue(postArray);

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

      await expect(getPublishedPostBySlug).rejects.toThrowError(exception);
    });
  });

  describe('create', () => {
    const postData = {
      createdAt: new Date(),
      title: 'Architecto iustos nesciunt.',
      excerpt:
        'Quam consectetur illo sit voluptatem est labore laborum debitis quia sint.',
      viewCount: 0,
      coverImage: 'http://loremflickr.com/1200/480/business',
      published: true,
      content: 'content',
    };
    const postToCreate = {
      post: { ...postData, slug: slugify(postData.title, { lower: true }) },
    };

    const authorId = 'ab182222-5603-4b01-909b-a68fbb3a2153';
    const authorData = {
      name: 'author name',
      image: 'author image',
    };

    it('should create new post with postData, authorId provided', async () => {
      postRepository.create.mockResolvedValue({
        ...postToCreate.post,
        id: 12312,
        author: authorData,
        updatedAt: new Date(),
      });

      const createdPost = await service.create(postToCreate, authorId);

      expect(createdPost).toMatchObject({
        ...postToCreate.post,
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
      viewCount: 0,
      coverImage: 'http://loremflickr.com/1200/480/business',
      published: true,
      content: 'content',
    };
    const postToUpdate = postData;
    const authorId = 'afe39927-eb6b-4e73-8d06-239fe6b14eb4';
    const authorData = {
      name: 'author name',
      image: 'author image',
    };

    it('should update post with postData provided', async () => {
      const updatedPostReturn = {
        ...postData,
        slug: 'architecto-iustos-nesciunt.',
      };

      postRepository.update.mockResolvedValue({
        ...updatedPostReturn,
        author: authorData,
        updatedAt: new Date(),
      });

      postRepository.getAuthorById.mockResolvedValue({ authorId });

      const updatedPost = await service.update(postToUpdate);

      expect(updatedPost).toMatchObject({
        ...updatedPostReturn,
        id: expect.any(Number),
        author: expect.objectContaining(authorData),
        updatedAt: expect.any(Date),
      });
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

      const author = await service.getAuthorId({ id });

      expect(author).toEqual({ authorId });
    });

    it("should get post's author id by post's slug", async () => {
      const slug = onePost.slug;

      postRepository.getAuthorBySlug.mockResolvedValue({ authorId });

      const author = await service.getAuthorId({ slug });

      expect(author).toEqual({ authorId });
    });

    it('should throw WrongParamsError if neither id nor slug provided', async () => {
      const deletePost = service.getAuthorId({});

      await expect(deletePost).rejects.toThrowError(WrongParamsError);
    });
  });

  describe('delete', () => {
    it('should delete post by id, if id provided', async () => {
      const id = onePost.id;
      postRepository.deleteById.mockResolvedValue(onePost);

      const deletedPost = await service.delete({ id });

      expect(deletedPost).toEqual(onePost);
    });

    it('should delete post by slug, if no id, but slug provided', async () => {
      const slug = onePost.slug;

      postRepository.deleteBySlug.mockResolvedValue(onePost);

      const deletedPost = await service.delete({ slug });

      expect(deletedPost).toEqual(onePost);
    });

    it('should throw WrongParamsError if neither id nor slug provided', async () => {
      const deletePost = service.delete({});

      await expect(deletePost).rejects.toThrowError(WrongParamsError);
    });
  });
});
