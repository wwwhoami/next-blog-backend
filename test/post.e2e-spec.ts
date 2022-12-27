import { HttpStatus, INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import { AppModule } from 'src/app.module';
import { CreateCategoryDto } from 'src/category/dto/create-category.dto';
import { CreatePostData } from 'src/post/dto/create-post.dto';
import request from 'supertest';

const postsWithNoContent = [
  {
    id: 1006,
    createdAt: '2021-05-15T00:00:00.000Z',
    updatedAt: '2022-05-23T23:47:35.677Z',
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
  },
  {
    id: 335,
    createdAt: '2021-05-12T15:39:50.348Z',
    updatedAt: '2022-05-23T23:47:32.957Z',
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
  },
  {
    id: 995,
    createdAt: '2021-05-12T02:32:34.229Z',
    updatedAt: '2022-05-23T23:47:35.613Z',
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
  },
  {
    id: 23,
    createdAt: '2021-05-12T01:11:27.097Z',
    updatedAt: '2022-05-23T23:47:31.638Z',
    title: 'Quo vel illum.',
    slug: 'quo-vel-illum.',
    excerpt:
      'A error officia rem eligendi maiores quasi voluptatum ipsum autem sit praesentium aperiam qui eius.',
    viewCount: 0,
    coverImage: 'http://loremflickr.com/1200/480/business',
    author: {
      name: 'Keara',
      image:
        'https://cloudflare-ipfs.com/ipfs/Qmd3W5DuhgHirLHGVixi6V76LhCkZUz6pnFt5AJBiyvHye/avatar/315.jpg',
    },
    categories: [
      {
        category: {
          name: 'PHP',
          hexColor: '#9333ea',
        },
      },
    ],
  },
];

const authCredentials = {
  name: 'Alice Johnson',
  email: 'alice@prisma.io',
  password: 'password',
};

const author = {
  image: 'https://randomuser.me/api/portraits/women/12.jpg',
  name: 'Alice Johnson',
};

const newPost: CreatePostData = {
  title: 'Architectom iustoa nesciunts.',
  slug: 'architectom-iustoa-nesciunts.',
  excerpt:
    'Quamas este est iste voluptatem consectetur illo sit voluptatem est labore laborum debitis quia sint.',
  content: 'Content',
  published: true,
  coverImage: 'http://loremflickr.com/1200/480/business',
};

const categoriesForNewPost: CreateCategoryDto[] = [
  {
    name: 'name',
    description: 'description',
  },
  {
    name: 'JavaScript',
    description: 'description',
    hexColor: '#ca8a04',
  },
  {
    name: 'PHP',
    description: 'description',
    hexColor: '#9333ea',
  },
];

describe('Post (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();

    app.useGlobalPipes(new ValidationPipe({ transform: true }));
    app.use(cookieParser());

    await app.init();
  });

  describe('/post (GET)', () => {
    it('should get posts as array of PostEntity in response body by default', () => {
      return request(app.getHttpServer())
        .get('/post')
        .expect(HttpStatus.OK)
        .expect((response: request.Response) => {
          expect(response.body).toBeInstanceOf(Array);
          expect(Object.keys(response.body[0])).toEqual(
            Object.keys(postsWithNoContent[0]),
          );
        });
    });

    it('should return 400 BAD_REQUEST if query params are wrong', () => {
      const wrongQueryParams = {
        take: 'asd',
        skip: 'asd',
        orderBy: 12,
        order: 12,
        content: 12,
      };

      const notFoundResponseBody = {
        error: 'Bad Request',
        message: [
          'take must be an integer number',
          'skip must be an integer number',
          'orderBy must be a valid enum value',
          'order must be a valid enum value',
          'content must be a boolean value',
        ],
        statusCode: 400,
      };

      return request(app.getHttpServer())
        .get('/post')
        .query(wrongQueryParams)
        .expect(HttpStatus.BAD_REQUEST)
        .expect((response: request.Response) => {
          expect(response.body).toMatchObject(notFoundResponseBody);
        });
    });

    it('should get as many posts as in take query param', () => {
      const take = 3;

      return request(app.getHttpServer())
        .get('/post')
        .query({ take })
        .expect(HttpStatus.OK)
        .expect((response: request.Response) => {
          expect(response.body).toBeInstanceOf(Array);
          expect(response.body.length).toEqual(take);
        });
    });

    it('should get no post if take query param equals zero', () => {
      const take = 0;

      return request(app.getHttpServer())
        .get('/post')
        .query({ take })
        .expect(HttpStatus.OK)
        .expect((response: request.Response) => {
          expect(response.body).toEqual([]);
          expect(response.body.length).toEqual(take);
        });
    });

    it('should get posts with content if content query param set to "true"', () => {
      const content = true;

      return request(app.getHttpServer())
        .get('/post')
        .query({ content })
        .expect(HttpStatus.OK)
        .expect((response: request.Response) => {
          expect(response.body).toBeInstanceOf(Array);
          expect(Object.keys(response.body[0])).toEqual(
            Object.keys({ ...postsWithNoContent[0], content: 'content' }),
          );
        });
    });

    it('should get posts without content if content query param set to "false"', () => {
      const content = false;

      return request(app.getHttpServer())
        .get('/post')
        .query({ content })
        .expect(HttpStatus.OK)
        .expect((response: request.Response) => {
          expect(response.body).toBeInstanceOf(Array);
          expect(Object.keys(response.body[0])).toEqual(
            Object.keys({ ...postsWithNoContent[0] }),
          );
        });
    });
  });

  describe('/post/article/:slug (GET)', () => {
    it('should get post matching provided slug with content by default', () => {
      const slug = 'tailwind-vs.-bootstrap';

      return request(app.getHttpServer())
        .get(`/post/article/${slug}`)
        .expect(HttpStatus.OK)
        .expect((response: request.Response) => {
          expect(Object.keys(response.body)).toEqual(
            Object.keys({
              ...postsWithNoContent[0],
              content: 'content',
            }),
          );
          expect(response.body.slug).toMatch(slug);
        });
    });

    it('should return 404 if post with provided slug does not exist', () => {
      const slug = 'not exists';
      const notFoundResponseBody = {
        error: 'Not Found',
        message: 'Post with slug not exists not found',
        statusCode: 404,
      };

      return request(app.getHttpServer())
        .get(`/post/article/${slug}`)
        .expect(HttpStatus.NOT_FOUND)
        .expect((response: request.Response) => {
          expect(response.body).toMatchObject(notFoundResponseBody);
        });
    });
  });

  describe('/post/slug (GET)', () => {
    it('should get slugs of published posts', () => {
      return request(app.getHttpServer())
        .get(`/post/slug`)
        .expect(HttpStatus.OK)
        .expect((response: request.Response) => {
          expect(Array.isArray(response.body)).toBe(true);
          expect(Object.keys(response.body[0])).toEqual(
            Object.keys({ slug: 'slug' }),
          );
        });
    });
  });

  describe('/post (POST)', () => {
    it('should create new post if user is logged in', async () => {
      const agent = request.agent(app.getHttpServer());
      let accessToken: string;

      await agent
        .post(`/auth/login`)
        .send(authCredentials)
        .expect((response: request.Response) => {
          accessToken = response.body.accessToken;
        })
        .then(() => {
          return agent
            .post(`/post`)
            .auth(accessToken, { type: 'bearer' })
            .send({ post: newPost, categories: categoriesForNewPost })
            .expect(HttpStatus.CREATED)
            .expect((response: request.Response) => {
              expect(response.body).toMatchObject({
                title: newPost.title,
                slug: newPost.slug,
                excerpt: newPost.excerpt,
                content: newPost.content,
                coverImage: newPost.coverImage,
                author: expect.objectContaining(author),
              });
            });
        });
    });

    it('should return 400 if bad body provided', async () => {
      const agent = request.agent(app.getHttpServer());
      let accessToken: string;

      await agent
        .post(`/auth/login`)
        .send(authCredentials)
        .expect((response: request.Response) => {
          accessToken = response.body.accessToken;
        })
        .then(() => {
          return agent
            .post(`/post`)
            .auth(accessToken, { type: 'bearer' })
            .send({ post: { name: 'name' } })
            .expect(HttpStatus.BAD_REQUEST);
        });
    });

    it('should return 401 if user is not logged in', async () => {
      return request(app.getHttpServer())
        .post(`/post`)
        .expect(HttpStatus.UNAUTHORIZED);
    });
  });

  afterAll(async () => {
    await app.close();
  });
});
