import { PrismaService } from '@app/prisma';
import { Test, TestingModule } from '@nestjs/testing';
import { DeepMockProxy, mockDeep } from 'jest-mock-extended';
import { Post, PostLikes, Prisma, PrismaClient } from 'prisma/generated/client';
import slugify from 'slugify';
import { PostOrderBy } from '../dto/get-post.dto';
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
    likesCount: 0,
    language: 'english',
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
    likesCount: 0,
    language: 'english',
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
    likesCount: 0,
    language: 'english',
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

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(repository).toBeDefined();
  });

  describe('pickOrdering', () => {
    it('returns correct order as Prisma.sql', () => {
      const orderBy: PostOrderBy[] = [
        'id',
        'title',
        'content',
        'published',
        'coverImage',
        'authorId',
        'createdAt',
        'updatedAt',
        'excerpt',
        'slug',
        'likesCount',
      ];
      const order: Prisma.SortOrder[] = ['desc', 'asc'];
      const expected = [
        Prisma.sql`id DESC`,
        Prisma.sql`id ASC`,
        Prisma.sql`title DESC`,
        Prisma.sql`title ASC`,
        Prisma.sql`content DESC`,
        Prisma.sql`content ASC`,
        Prisma.sql`published DESC`,
        Prisma.sql`published ASC`,
        Prisma.sql`cover_image DESC`,
        Prisma.sql`cover_image ASC`,
        Prisma.sql`author_id DESC`,
        Prisma.sql`author_id ASC`,
        Prisma.sql`created_at DESC`,
        Prisma.sql`created_at ASC`,
        Prisma.sql`updated_at DESC`,
        Prisma.sql`updated_at ASC`,
        Prisma.sql`excerpt DESC`,
        Prisma.sql`excerpt ASC`,
        Prisma.sql`slug DESC`,
        Prisma.sql`slug ASC`,
        Prisma.sql`likes_count DESC`,
        Prisma.sql`likes_count ASC`,
      ];

      const results = orderBy.flatMap((postOrderBy) =>
        order.map((sortOrder) =>
          (repository as any).pickOrdering(postOrderBy, sortOrder),
        ),
      );

      expect(results).toEqual(expected);
    });

    it('returns empty Prisma.sql as default', () => {
      const orderBy = 'test' as PostOrderBy;
      const order: Prisma.SortOrder = 'desc';
      const expected = Prisma.sql``;

      const result = (repository as any).pickOrdering(orderBy, order);

      expect(result).toEqual(expected);
    });
  });

  describe('pickWhere', () => {
    it('returns correct where as Prisma.sql', () => {
      const published = true;
      const authorId = '00000000-0000-0000-0000-000000000000';
      const category = 'testCategory';
      const searchTerm = 'testSearchTerm';
      const language = 'english';
      const expected = Prisma.sql`
      published = ${published}
      AND author_id = ${authorId}
      AND p.id IN(
        SELECT
          p1.id
        FROM
          (
          SELECT
            p2.id,
            array_agg(LOWER(ptc1.category_name)) AS category_names
          FROM
            "Post" AS p2
          JOIN "PostToCategory" AS ptc1 ON
            (ptc1.post_id) = (p2.id)
          GROUP BY
            p2.id) AS p1
        WHERE
          p1.id IS NOT NULL
          AND p1.category_names @> string_to_array(${category}, ' '))
      AND title % ${searchTerm} 
        OR to_tsvector(${language}::regconfig, excerpt) @@ websearch_to_tsquery(${language}::regconfig, ${searchTerm})`;

      const result: Prisma.Sql = (repository as any).pickWhere({
        searchTerm,
        category,
        published,
        authorId,
      });

      expect(result.values).toEqual(expected.values);
    });

    it('returns Prisma.empty as default', () => {
      const searchTerm = '';
      const expected = Prisma.empty;

      const result = (repository as any).pickWhere(searchTerm);

      expect(result).toEqual(expected);
    });
  });

  describe('getIds', () => {
    it('should get postIds', async () => {
      const payload = [
        { id: 12 },
        { id: 11 },
      ] as unknown as Prisma.Prisma__PostClient<Array<Post>>;

      prisma.post.findMany.mockResolvedValue(await payload);

      const postsIds = await repository.getIds();

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

  describe('getOne', () => {
    it('should get post by id', () => {
      const postId = 1;

      prisma.post.findFirstOrThrow.mockResolvedValue(onePost);

      expect(repository.getOne(postId)).resolves.toEqual(onePost);
    });
  });

  describe('getMany', () => {
    it('should get posts', async () => {
      prisma.$queryRaw.mockResolvedValue(postArray);

      const posts = await repository.getMany({});

      expect(posts).toEqual(postArray);
    });
  });

  describe('getSlugsForPublished', () => {
    it('should get published posts slugs', async () => {
      const payload = [
        { slug: 'slug1' },
        { slug: 'slug2' },
      ] as unknown as Prisma.Prisma__PostClient<Array<Post>>;
      prisma.post.findMany.mockResolvedValue(await payload);

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

      await expect(post).rejects.toThrow(exception);
    });
  });

  describe('getAuthorById', () => {
    it("should get post's author by post id", async () => {
      const expectedAuthor = {
        authorId: 'afe39927-eb6b-4e73-8d06-239fe6b14eb4',
      } as unknown as Prisma.Prisma__PostClient<Post>;
      const postId = 12;

      prisma.post.findUniqueOrThrow.mockResolvedValue(await expectedAuthor);

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

      prisma.post.findUniqueOrThrow.mockResolvedValue(await expectedAuthor);

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

      prisma.post.findUniqueOrThrow.mockResolvedValue(await expectedAuthor);

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
        likesCount: 0,
        language: 'english',
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
      likesCount: 0,
    };
    const postToUpdate = { ...postData };

    const authorId = 'ab182222-5603-4b01-909b-a68fbb3a2153';

    it('should update post with postData provided', async () => {
      const postId = postToUpdate.id;
      prisma.post.update.mockResolvedValue({
        ...postToUpdate,
        id: postId,
        authorId,
        updatedAt: new Date(),
        language: 'english',
      });

      const updatedPost = await repository.update(postId, postToUpdate);

      expect(updatedPost).toMatchObject({
        ...postToUpdate,
        id: expect.any(Number),
        authorId: expect.any(String),
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

      prisma.postLikes.findMany.mockResolvedValue(
        await (likes as unknown as Prisma.Prisma__PostClient<Array<PostLikes>>),
      );

      const postLikes = await repository.getLikes(postId);

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

      prisma.postLikes.findMany.mockRejectedValue(exception);

      const getPostLikes = repository.getLikes(postId);

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
      } as unknown as Prisma.Prisma__PostClient<Post>;

      prisma.postLikes.create.mockResolvedValue({
        postId,
        userId,
      });
      prisma.post.update.mockResolvedValue(await expected);

      const postLikes = await repository.like(postId, userId);
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
      } as unknown as Prisma.Prisma__PostClient<Post>;

      prisma.postLikes.delete.mockResolvedValue({
        postId,
        userId,
      });
      prisma.post.update.mockResolvedValue(await expected);

      const postLikes = await repository.unlike(postId, userId);
      expect(postLikes).toEqual(expected);
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

      await expect(deletePostBySlug).rejects.toThrow(exception);
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

      await expect(deletePostBySlug).rejects.toThrow(exception);
    });
  });
});
