import { HttpStatus, INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import slugify from 'slugify';
import { AppModule } from 'src/app.module';
import { AuthCredentialsDto } from 'src/auth/dto/auth-credentials.dto';
import { CreateCategoryDto } from 'src/category/dto/create-category.dto';
import { UpdateCategoryDto } from 'src/category/dto/update-category.dto';
import { ErrorInterceptor } from 'src/common/interceptors/error.interceptor';
import { CreatePostData } from 'src/post/dto/create-post.dto';
import { PostEntity } from 'src/post/entities/post.entity';
import request from 'supertest';

const postCategories = [
  {
    category: {
      name: 'CSS',
      hexColor: '#2563eb',
    },
  },
];

const postWithNoContent: PostEntity = {
  id: 1006,
  createdAt: new Date('2021-05-15T00:00:00.000Z'),
  updatedAt: new Date('2022-05-23T23:47:35.677Z'),
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
  categories: postCategories,
};

describe('Post (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();

    app.useGlobalPipes(new ValidationPipe({ transform: true }));
    app.useGlobalInterceptors(new ErrorInterceptor());
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
            Object.keys(postWithNoContent),
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
            Object.keys({ ...postWithNoContent, content: 'content' }),
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
            Object.keys({ ...postWithNoContent }),
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
              ...postWithNoContent,
              content: 'content',
            }),
          );
          expect(response.body.slug).toMatch(slug);
        });
    });

    it('should return 404 if post with provided slug does not exist', () => {
      const slug = 'not exists';

      return request(app.getHttpServer())
        .get(`/post/article/${slug}`)
        .expect(HttpStatus.NOT_FOUND);
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
    let agent: request.SuperAgentTest;
    let accessToken: string;

    beforeEach(async () => {
      const authCredentials: AuthCredentialsDto = {
        name: 'Alice Johnson',
        email: 'alice@prisma.io',
        password: 'password',
      };
      agent = request.agent(app.getHttpServer());

      accessToken = (await agent.post(`/auth/login`).send(authCredentials))
        .body['accessToken'];
    });

    it('should create new post if user is logged in', () => {
      const author = {
        image: 'https://randomuser.me/api/portraits/women/12.jpg',
        name: 'Alice Johnson',
      };
      const newPost: CreatePostData = {
        title: 'Architectom iustoa nesciunts.',
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

      return agent
        .post(`/post`)
        .auth(accessToken, { type: 'bearer' })
        .send({ post: newPost, categories: categoriesForNewPost })
        .expect(HttpStatus.CREATED)
        .expect((response: request.Response) => {
          expect(response.body).toMatchObject({
            title: newPost.title,
            excerpt: newPost.excerpt,
            content: newPost.content,
            coverImage: newPost.coverImage,
            author: expect.objectContaining(author),
          });
        });
    });

    it('should return 409 on unique constraint viiolation', () => {
      const newPost: CreatePostData = {
        title: postWithNoContent.title,
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

      return agent
        .post(`/post`)
        .auth(accessToken, { type: 'bearer' })
        .send({ post: newPost, categories: categoriesForNewPost })
        .expect(HttpStatus.CONFLICT);
    });

    it('should return 400 if bad body provided', () => {
      return agent
        .post(`/post`)
        .auth(accessToken, { type: 'bearer' })
        .send({ post: { name: 'name' } })
        .expect(HttpStatus.BAD_REQUEST);
    });

    it('should return 401 if user is not logged in', () => {
      return request(app.getHttpServer())
        .post(`/post`)
        .expect(HttpStatus.UNAUTHORIZED);
    });
  });

  describe('/post (PUT)', () => {
    const categoriesForUpdatedPost: UpdateCategoryDto[] = [
      {
        name: 'new category',
        description: 'new description',
        hexColor: '#9110ea',
      },
    ];
    const updatedPost = {
      id: 1,
      title: 'Updated title.',
      excerpt:
        'Quamas este est iste voluptatem consectetur illo sit voluptatem est labore laborum debitis quia sint.',
      content: 'Updated content',
      published: true,
      coverImage: 'http://loremflickr.com/1200/480/business',
    };

    let agent: request.SuperAgentTest;
    let accessToken: string;

    beforeEach(async () => {
      const authCredentials: AuthCredentialsDto = {
        name: 'Alice Johnson',
        email: 'alice@prisma.io',
        password: 'password',
      };
      agent = request.agent(app.getHttpServer());

      accessToken = (await agent.post(`/auth/login`).send(authCredentials))
        .body['accessToken'];
    });

    it('should replace post data with data provided if user is logged in and is author', () => {
      const author = {
        image: 'https://randomuser.me/api/portraits/women/12.jpg',
        name: 'Alice Johnson',
      };
      const expectedRecievedCategories = categoriesForUpdatedPost.map(
        (category) => ({
          category: { name: category.name, hexColor: category.hexColor },
        }),
      );

      return agent
        .put(`/post`)
        .auth(accessToken, { type: 'bearer' })
        .send({
          ...updatedPost,
          categories: categoriesForUpdatedPost,
        })
        .expect(HttpStatus.OK)
        .expect((response: request.Response) => {
          expect(response.body).toMatchObject({
            title: updatedPost.title,
            slug: slugify(updatedPost.title, { lower: true }),
            excerpt: updatedPost.excerpt,
            content: updatedPost.content,
            coverImage: updatedPost.coverImage,
            author: expect.objectContaining(author),
            categories: expect.arrayContaining(expectedRecievedCategories),
          });
        });
    });

    it('should return 409 on unique constraint violation', () => {
      return agent
        .put(`/post`)
        .auth(accessToken, { type: 'bearer' })
        .send({
          ...updatedPost,
          title: postWithNoContent.title,
          categories: categoriesForUpdatedPost,
        })
        .expect(HttpStatus.CONFLICT);
    });

    it('should return 404 if post with provided id does not exist', () => {
      return agent
        .put(`/post`)
        .auth(accessToken, { type: 'bearer' })
        .send({
          ...updatedPost,
          id: -12,
          categories: categoriesForUpdatedPost,
        })
        .expect(HttpStatus.NOT_FOUND);
    });

    it('should return 403 if requesting user is not author', async () => {
      const agent = request.agent(app.getHttpServer());
      const requestingUserAuthCredentials: AuthCredentialsDto = {
        name: 'John Doe',
        email: 'john@prisma.io',
        password: 'password',
      };
      const { accessToken } = (
        await agent.post(`/auth/login`).send(requestingUserAuthCredentials)
      ).body;

      return agent
        .put(`/post`)
        .auth(accessToken, { type: 'bearer' })
        .send({
          ...updatedPost,
          categories: categoriesForUpdatedPost,
        })
        .expect(HttpStatus.FORBIDDEN);
    });

    it('should return 401 if user is not logged in', () => {
      return request(app.getHttpServer())
        .put(`/post`)
        .expect(HttpStatus.UNAUTHORIZED);
    });

    it('should return 400 if bad body provided', () => {
      return agent
        .put(`/post`)
        .auth(accessToken, { type: 'bearer' })
        .expect(HttpStatus.BAD_REQUEST);
    });
  });

  describe('/post (DELETE)', () => {
    const categoriesForDeletedPost = [
      {
        category: {
          name: 'new category',
          hexColor: '#9110ea',
        },
      },
    ];

    let agent: request.SuperAgentTest;
    let accessToken: string;

    beforeEach(async () => {
      const authCredentials: AuthCredentialsDto = {
        name: 'Alice Johnson',
        email: 'alice@prisma.io',
        password: 'password',
      };
      agent = request.agent(app.getHttpServer());

      accessToken = (await agent.post(`/auth/login`).send(authCredentials))
        .body['accessToken'];
    });

    it('should delete post with provided id if user is logged in and is author, return deleted PostEntity', () => {
      const author = {
        image: 'https://randomuser.me/api/portraits/women/12.jpg',
        name: 'Alice Johnson',
      };
      const postId = 1;

      return agent
        .delete(`/post`)
        .auth(accessToken, { type: 'bearer' })
        .send({
          id: postId,
        })
        .expect(HttpStatus.OK)
        .expect((response: request.Response) => {
          expect(response.body).toMatchObject({
            id: postId,
            title: expect.any(String),
            slug: expect.any(String),
            excerpt: expect.any(String),
            coverImage: expect.any(String),
            author: expect.objectContaining(author),
            categories: expect.arrayContaining(categoriesForDeletedPost),
          });
        });
    });

    it('should delete post with provided slug if user is logged in and is author, return deleted PostEntity', () => {
      const author = {
        image: 'https://randomuser.me/api/portraits/women/12.jpg',
        name: 'Alice Johnson',
      };
      const postSlug = slugify('Writing Great Unit Tests', { lower: true });

      return agent
        .delete(`/post`)
        .auth(accessToken, { type: 'bearer' })
        .send({
          slug: postSlug,
        })
        .expect(HttpStatus.OK)
        .expect((response: request.Response) => {
          expect(response.body).toMatchObject({
            slug: postSlug,
            id: expect.any(Number),
            title: expect.any(String),
            excerpt: expect.any(String),
            coverImage: expect.any(String),
            author: expect.objectContaining(author),
            categories: expect.arrayContaining([
              expect.objectContaining({
                category: expect.objectContaining({
                  name: expect.any(String),
                  hexColor: expect.any(String),
                }),
              }),
            ]),
          });
        });
    });

    it('should return 404 if post with provided id does not exist', () => {
      return agent
        .put(`/post`)
        .auth(accessToken, { type: 'bearer' })
        .send({
          id: -12,
        })
        .expect(HttpStatus.NOT_FOUND);
    });

    it('should return 404 if post with provided slug does not exist', () => {
      return agent
        .put(`/post`)
        .auth(accessToken, { type: 'bearer' })
        .send({
          slug: 'NonexistentSlug',
        })
        .expect(HttpStatus.NOT_FOUND);
    });

    it('should return 403 if requesting user is not author', async () => {
      const agent = request.agent(app.getHttpServer());
      const requestingUserAuthCredentials: AuthCredentialsDto = {
        name: 'John Doe',
        email: 'john@prisma.io',
        password: 'password',
      };
      const { accessToken } = (
        await agent.post(`/auth/login`).send(requestingUserAuthCredentials)
      ).body;

      return agent
        .put(`/post`)
        .auth(accessToken, { type: 'bearer' })
        .send({
          id: 2,
        })
        .expect(HttpStatus.FORBIDDEN);
    });

    it('should return 401 if user is not logged in', () => {
      return request(app.getHttpServer())
        .put(`/post`)
        .expect(HttpStatus.UNAUTHORIZED);
    });

    it('should return 400 if bad body provided', () => {
      return agent
        .put(`/post`)
        .auth(accessToken, { type: 'bearer' })
        .expect(HttpStatus.BAD_REQUEST);
    });
  });

  afterAll(async () => {
    await app.close();
  });
});
