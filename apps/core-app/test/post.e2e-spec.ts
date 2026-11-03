import { AppModule } from '@core/src/app.module';
import { AuthCredentialsDto } from '@core/src/auth/dto/auth-credentials.dto';
import { CreateCategoryDto } from '@core/src/category/dto/create-category.dto';
import { ErrorInterceptor } from '@core/src/common/interceptors/error.interceptor';
import { PostEntity } from '@core/src/post/entities/post.entity';
import { PostService } from '@core/src/post/post.service';
import { HttpStatus, INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import { userData } from 'data/seed-data';
import fs from 'node:fs';
import { DraftStatus, MediaTarget, MediaType } from 'prisma/generated/client';
import request from 'supertest';
import TestAgent from 'supertest/lib/agent';

// Prisma media responses contain BigInt fields.
(BigInt.prototype as any).toJSON = function () {
  return this.toString();
};

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
  coverImage: '/images/posts/img2.jpg',
  author: {
    name: 'Alice Johnson',
    image: 'https://randomuser.me/api/portraits/women/12.jpg',
  },
  categories: postCategories,
  likesCount: 0,
  language: 'english',
};

describe('Post (e2e)', () => {
  let app: INestApplication;
  let postService: PostService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    postService = moduleRef.get(PostService);

    app = moduleRef.createNestApplication();

    app.useGlobalPipes(new ValidationPipe({ transform: true }));
    app.useGlobalInterceptors(new ErrorInterceptor());
    app.use(cookieParser());

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('/post (GET)', () => {
    it('should get posts as array of PostEntity in response body by default', () => {
      return request(app.getHttpServer())
        .get('/post')
        .expect(HttpStatus.OK)
        .expect((response: request.Response) => {
          expect(response.body).toBeInstanceOf(Array);
          expect(response.body[0]).toEqual({
            id: expect.any(Number),
            createdAt: expect.any(String),
            updatedAt: expect.any(String),
            title: expect.any(String),
            slug: expect.any(String),
            excerpt: expect.any(String),
            coverImage: expect.any(String),
            language: expect.any(String),
            author: {
              name: expect.any(String),
              image: expect.any(String),
            },
            categories: postCategories,
            likesCount: expect.any(Number),
          });
          // check that createdAt and updatedAt are correct Dates
          expect(new Date(response.body[0].createdAt).getTime).not.toBe(NaN);
          expect(new Date(response.body[0].updatedAt).getTime).not.toBe(NaN);
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

      return request(app.getHttpServer())
        .get('/post')
        .query(wrongQueryParams)
        .expect(HttpStatus.BAD_REQUEST);
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
          expect(response.body[0]).toEqual({
            id: expect.any(Number),
            createdAt: expect.any(String),
            updatedAt: expect.any(String),
            title: expect.any(String),
            slug: expect.any(String),
            excerpt: expect.any(String),
            coverImage: expect.any(String),
            content: expect.any(String),
            language: expect.any(String),
            author: {
              name: expect.any(String),
              image: expect.any(String),
            },
            categories: postCategories,
            likesCount: expect.any(Number),
          });
          // check that createdAt and updatedAt are correct Dates
          expect(new Date(response.body[0].createdAt).getTime).not.toBe(NaN);
          expect(new Date(response.body[0].updatedAt).getTime).not.toBe(NaN);
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
          expect(response.body[0]).toEqual({
            id: expect.any(Number),
            createdAt: expect.any(String),
            updatedAt: expect.any(String),
            title: expect.any(String),
            slug: expect.any(String),
            excerpt: expect.any(String),
            coverImage: expect.any(String),
            language: expect.any(String),
            author: {
              name: expect.any(String),
              image: expect.any(String),
            },
            categories: postCategories,
            likesCount: expect.any(Number),
          });
          // check that createdAt and updatedAt are correct Dates
          expect(new Date(response.body[0].createdAt).getTime).not.toBe(NaN);
          expect(new Date(response.body[0].updatedAt).getTime).not.toBe(NaN);
        });
    });

    it('should get posts by search term if provided in query param', () => {
      const searchTerm = 'tailwind';

      return request(app.getHttpServer())
        .get('/post')
        .query({ searchTerm })
        .expect(HttpStatus.OK)
        .expect((response: request.Response) => {
          expect(response.body).toBeInstanceOf(Array);
          expect(response.body[0]).toEqual({
            id: expect.any(Number),
            createdAt: expect.any(String),
            updatedAt: expect.any(String),
            title: expect.any(String),
            slug: expect.any(String),
            excerpt: expect.any(String),
            coverImage: expect.any(String),
            language: expect.any(String),
            rank: expect.any(Number),
            author: {
              name: expect.any(String),
              image: expect.any(String),
            },
            categories: postCategories,
            likesCount: expect.any(Number),
          });
          // check that createdAt and updatedAt are correct Dates
          expect(new Date(response.body[0].createdAt).getTime).not.toBe(NaN);
          expect(new Date(response.body[0].updatedAt).getTime).not.toBe(NaN);
        });
    });

    it('should get posts by category if provided in query param', () => {
      const category = 'CSS';

      return request(app.getHttpServer())
        .get('/post')
        .query({ category })
        .expect(HttpStatus.OK)
        .expect((response: request.Response) => {
          expect(response.body).toBeInstanceOf(Array);
          expect(response.body[0]).toEqual({
            id: expect.any(Number),
            createdAt: expect.any(String),
            updatedAt: expect.any(String),
            title: expect.any(String),
            slug: expect.any(String),
            excerpt: expect.any(String),
            coverImage: expect.any(String),
            language: expect.any(String),
            author: {
              name: expect.any(String),
              image: expect.any(String),
            },
            categories: postCategories,
            likesCount: expect.any(Number),
          });
          // check that createdAt and updatedAt are correct Dates
          expect(new Date(response.body[0].createdAt).getTime).not.toBe(NaN);
          expect(new Date(response.body[0].updatedAt).getTime).not.toBe(NaN);
        });
    });

    it('should get posts by author if provided in query param', () => {
      const author = userData[0];

      return request(app.getHttpServer())
        .get('/post')
        .query({ authorId: author.id })
        .expect(HttpStatus.OK)
        .expect((response: request.Response) => {
          expect(response.body).toBeInstanceOf(Array);
          expect(response.body[0]).toEqual({
            id: expect.any(Number),
            createdAt: expect.any(String),
            updatedAt: expect.any(String),
            title: expect.any(String),
            slug: expect.any(String),
            excerpt: expect.any(String),
            coverImage: expect.any(String),
            language: expect.any(String),
            author: {
              name: author.name,
              image: author.image,
            },
            categories: expect.arrayContaining([
              expect.objectContaining({
                category: expect.objectContaining({
                  name: expect.any(String),
                  hexColor: expect.any(String),
                }),
              }),
            ]),
            likesCount: expect.any(Number),
          });
          // check that createdAt and updatedAt are correct Dates
          expect(new Date(response.body[0].createdAt).getTime).not.toBe(NaN);
          expect(new Date(response.body[0].updatedAt).getTime).not.toBe(NaN);
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
          expect(response.body).toEqual({
            id: expect.any(Number),
            createdAt: expect.any(String),
            updatedAt: expect.any(String),
            title: expect.any(String),
            slug,
            content: expect.any(String),
            excerpt: expect.any(String),
            coverImage: expect.any(String),
            language: expect.any(String),
            author: {
              name: expect.any(String),
              image: expect.any(String),
            },
            categories: postCategories,
            likesCount: expect.any(Number),
          });
          // check that createdAt and updatedAt are correct Dates
          expect(new Date(response.body.createdAt).getTime).not.toBe(NaN);
          expect(new Date(response.body.updatedAt).getTime).not.toBe(NaN);
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
          expect(response.body[0]).toEqual({
            slug: expect.any(String),
          });
        });
    });
  });

  describe('/post (POST)', () => {
    let agent: TestAgent;
    let accessToken: string;
    let adminAgent: TestAgent;
    let adminAccessToken: string;

    beforeEach(async () => {
      const authCredentials: AuthCredentialsDto = {
        name: 'Alice Johnson',
        email: 'alice@prisma.io',
        password: 'password',
      };
      const adminAuthCredentials: AuthCredentialsDto = {
        name: 'Admin',
        email: 'admin@admin.com',
        password: 'password',
      };

      agent = request.agent(app.getHttpServer());
      adminAgent = request.agent(app.getHttpServer());

      accessToken = (await agent.post('/auth/login').send(authCredentials)).body
        .accessToken;
      adminAccessToken = (
        await adminAgent.post('/auth/login').send(adminAuthCredentials)
      ).body.accessToken;
    });

    it('should return 403 if a non-admin user attempts direct post creation', () => {
      return agent
        .post(`/post`)
        .auth(accessToken, { type: 'bearer' })
        .send({
          title: 'Direct post',
          excerpt: 'Excerpt',
          content: 'Content',
          published: true,
          coverImage: 'http://loremflickr.com/1200/480/business',
        })
        .expect(HttpStatus.FORBIDDEN);
    });

    it('should create new post if an administrator is logged in', () => {
      const author = {
        name: 'Admin',
      };
      const newPost = {
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

      return adminAgent
        .post(`/post`)
        .auth(adminAccessToken, { type: 'bearer' })
        .send({ ...newPost, categories: categoriesForNewPost })
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
      const newPost = {
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
        .auth(adminAccessToken, { type: 'bearer' })
        .send({ ...newPost, categories: categoriesForNewPost })
        .expect(HttpStatus.CONFLICT);
    });

    it('should return 400 if bad body provided', () => {
      return agent
        .post(`/post`)
        .auth(adminAccessToken, { type: 'bearer' })
        .send({ name: 'name' })
        .expect(HttpStatus.BAD_REQUEST);
    });

    it('should return 401 if user is not logged in', () => {
      return request(app.getHttpServer())
        .post(`/post`)
        .expect(HttpStatus.UNAUTHORIZED);
    });
  });

  describe('/post/:id/draft (POST)', () => {
    let accessToken: string;
    let adminAccessToken: string;

    beforeEach(async () => {
      accessToken = (
        await request(app.getHttpServer())
          .post('/auth/login')
          .send({ email: userData[0].email, password: 'password' })
      ).body.accessToken;
      adminAccessToken = (
        await request(app.getHttpServer())
          .post('/auth/login')
          .send({ email: 'admin@admin.com', password: 'password' })
      ).body.accessToken;
    });

    it('creates one active revision and keeps public content unchanged', async () => {
      const publicPost = await request(app.getHttpServer())
        .get('/post/article/tailwind-vs.-bootstrap')
        .expect(HttpStatus.OK);
      const first = await request(app.getHttpServer())
        .post('/post/1/draft')
        .auth(accessToken, { type: 'bearer' })
        .expect(HttpStatus.CREATED);

      expect(first.body).toEqual(
        expect.objectContaining({
          postId: 1,
          revisionMode: 'REVISION',
          sourceVersion: expect.any(Number),
          status: DraftStatus.ACTIVE,
        }),
      );

      await request(app.getHttpServer())
        .put(`/draft/${first.body.id}`)
        .auth(accessToken, { type: 'bearer' })
        .send({ title: 'Private revision title' })
        .expect(HttpStatus.OK);

      const second = await request(app.getHttpServer())
        .post('/post/1/draft')
        .auth(accessToken, { type: 'bearer' })
        .expect(HttpStatus.CREATED);
      expect(second.body.id).toBe(first.body.id);

      await request(app.getHttpServer())
        .get('/post/article/tailwind-vs.-bootstrap')
        .expect(HttpStatus.OK)
        .expect(({ body }) => {
          expect(body.title).toBe(publicPost.body.title);
          expect(body.content).toBe(publicPost.body.content);
        });
    });

    it('rejects administrators from creating content revisions', () =>
      request(app.getHttpServer())
        .post('/post/1/draft')
        .auth(adminAccessToken, { type: 'bearer' })
        .expect(HttpStatus.FORBIDDEN));

    it('publishes a revision into the existing post', async () => {
      const postsResponse = await request(app.getHttpServer())
        .get('/post')
        .query({ content: true, take: 10 })
        .expect(HttpStatus.OK);
      const post = postsResponse.body.find(
        (candidate: { id: number }) => candidate.id === 2,
      );
      expect(post).toEqual(expect.objectContaining({ id: 2 }));

      const revision = await request(app.getHttpServer())
        .post('/post/2/draft')
        .auth(accessToken, { type: 'bearer' })
        .expect(HttpStatus.CREATED);
      const imageBuffer = await fs.promises.readFile(
        './data/media/sample_png.png',
      );
      const media = await request(app.getHttpServer())
        .post('/media')
        .auth(accessToken, { type: 'bearer' })
        .field('type', MediaType.IMAGE)
        .field('target', MediaTarget.POST)
        .field('draftId', revision.body.id)
        .attach('file', imageBuffer, {
          filename: 'revision-cover.png',
          contentType: 'image/png',
        })
        .expect(HttpStatus.CREATED);
      const content = `![Revision image](${media.body.publicUrl})`;

      await request(app.getHttpServer())
        .put(`/draft/${revision.body.id}`)
        .auth(accessToken, { type: 'bearer' })
        .send({
          title: `Revision title ${Date.now()}`,
          excerpt: 'Revision excerpt',
          content,
          mediaIds: [media.body.id],
          coverMediaId: media.body.id,
        })
        .expect(HttpStatus.OK);
      await request(app.getHttpServer())
        .post(`/draft/${revision.body.id}/publish`)
        .auth(accessToken, { type: 'bearer' })
        .expect(HttpStatus.CREATED);

      for (let attempt = 0; attempt < 20; attempt += 1) {
        const draft = await request(app.getHttpServer())
          .get(`/draft/${revision.body.id}`)
          .auth(accessToken, { type: 'bearer' })
          .expect(HttpStatus.OK);
        if (draft.body.status === DraftStatus.ARCHIVED) {
          const published = await request(app.getHttpServer())
            .get(`/post/article/${post.slug}`)
            .expect(HttpStatus.OK);
          expect(published.body).toEqual(
            expect.objectContaining({
              id: 2,
              slug: post.slug,
              title: expect.stringMatching(/^Revision title /),
              content,
            }),
          );
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      throw new Error(
        'Post revision publication did not complete during the test',
      );
    });
  });

  describe('/post/:id/publication (PATCH)', () => {
    let authorAccessToken: string;
    let adminAccessToken: string;

    beforeEach(async () => {
      authorAccessToken = (
        await request(app.getHttpServer())
          .post('/auth/login')
          .send({ email: userData[0].email, password: 'password' })
      ).body.accessToken;
      adminAccessToken = (
        await request(app.getHttpServer())
          .post('/auth/login')
          .send({ email: 'admin@admin.com', password: 'password' })
      ).body.accessToken;
    });

    it('rejects non-administrators from changing publication state', () =>
      request(app.getHttpServer())
        .patch('/post/1/publication')
        .auth(authorAccessToken, { type: 'bearer' })
        .send({ published: false })
        .expect(HttpStatus.FORBIDDEN));

    it('allows administrators to change publication state', async () => {
      await request(app.getHttpServer())
        .patch('/post/1/publication')
        .auth(adminAccessToken, { type: 'bearer' })
        .send({ published: false })
        .expect(HttpStatus.OK);
      await request(app.getHttpServer())
        .patch('/post/1/publication')
        .auth(adminAccessToken, { type: 'bearer' })
        .send({ published: true })
        .expect(HttpStatus.OK);
    });

    it('does not expose the removed direct post update endpoint', () =>
      request(app.getHttpServer())
        .put('/post/1')
        .auth(adminAccessToken, { type: 'bearer' })
        .send({ published: false })
        .expect(HttpStatus.NOT_FOUND));
  });

  describe('/post (DELETE)', () => {
    let agent: TestAgent;
    let accessToken: string;

    let adminAgent: TestAgent;
    let adminAccessToken: string;

    beforeEach(async () => {
      const authCredentials: AuthCredentialsDto = {
        name: 'Alice Johnson',
        email: 'alice@prisma.io',
        password: 'password',
      };
      const adminAuthCredentials: AuthCredentialsDto = {
        name: 'Admin',
        email: 'admin@admin.com',
        password: 'password',
      };
      agent = request.agent(app.getHttpServer());
      adminAgent = request.agent(app.getHttpServer());

      accessToken = (await agent.post(`/auth/login`).send(authCredentials))
        .body['accessToken'];
      adminAccessToken = (
        await agent.post(`/auth/login`).send(adminAuthCredentials)
      ).body['accessToken'];
    });

    it('should return 403 if a non-admin author attempts to delete a post', () => {
      return agent
        .delete('/post/1')
        .auth(accessToken, { type: 'bearer' })
        .expect(HttpStatus.FORBIDDEN);
    });

    it('should delete post with provided id if user is logged in and is admin, return deleted PostEntity', () => {
      const author = {
        image: 'https://randomuser.me/api/portraits/women/12.jpg',
        name: 'Alice Johnson',
      };
      const postId = 3;

      return adminAgent
        .delete(`/post/${postId}`)
        .auth(adminAccessToken, { type: 'bearer' })
        .expect(HttpStatus.OK)
        .expect((response: request.Response) => {
          expect(response.body).toMatchObject({
            id: postId,
            title: expect.any(String),
            slug: expect.any(String),
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

    it('should return 404 if the post does not exist', () => {
      return adminAgent
        .delete('/post/-12')
        .auth(adminAccessToken, { type: 'bearer' })
        .expect(HttpStatus.NOT_FOUND);
    });
  });

  describe('/post/:id/likes (GET)', () => {
    const users = userData.slice(0, 3);
    const postId = 2;

    beforeAll(async () => {
      const liked = users.map((user) => postService.like(postId, user.id));
      await Promise.all(liked);
    });

    it('should return 200 and array of users who liked post', () => {
      const expected = users.map((user) => ({
        user: {
          name: user.name,
          image: user.image,
        },
      }));

      return request(app.getHttpServer())
        .get(`/post/${postId}/likes`)
        .expect(HttpStatus.OK)
        .expect((response: request.Response) => {
          expect(response.body).toBeInstanceOf(Array);
          expect(response.body).toEqual(expect.arrayContaining(expected));
        });
    });

    it('should return 404 if post with provided id does not exist', () => {
      const id = 12345;
      return request(app.getHttpServer())
        .get(`/post/${id}/likes`)
        .expect(HttpStatus.NOT_FOUND);
    });

    it('should return 400 if post id param is not Int', () => {
      const id = 'NotInt';
      return request(app.getHttpServer())
        .get(`/post/${id}/likes`)
        .expect(HttpStatus.BAD_REQUEST);
    });

    afterAll(async () => {
      const unliked = users.map((user) => postService.unlike(postId, user.id));
      await Promise.all(unliked);
    });
  });

  describe('/post/:id/likes (POST)', () => {
    const user = userData[0];
    const postId = 2;

    let agent: TestAgent;
    let accessToken: string;

    beforeEach(async () => {
      const authCredentials: AuthCredentialsDto = {
        name: user.name,
        email: user.email,
        password: 'password',
      };
      agent = request.agent(app.getHttpServer());

      accessToken = (await agent.post(`/auth/login`).send(authCredentials))
        .body['accessToken'];
    });

    it("should return 201 and post's likes count if user is logged in", () => {
      return agent
        .post(`/post/${postId}/likes`)
        .auth(accessToken, { type: 'bearer' })
        .expect(HttpStatus.CREATED)
        .expect((response: request.Response) => {
          expect(response.body).toMatchObject({
            id: postId,
            likesCount: expect.any(Number),
          });
        });
    });

    it('should return 422 if post with provided id does not exist', () => {
      const postId = -1;
      return agent
        .post(`/post/${postId}/likes`)
        .auth(accessToken, { type: 'bearer' })
        .expect(HttpStatus.UNPROCESSABLE_ENTITY);
    });

    it('should return 409 if user has already liked post', () => {
      return agent
        .post(`/post/${postId}/likes`)
        .auth(accessToken, { type: 'bearer' })
        .expect(HttpStatus.CONFLICT);
    });

    it('should return 401 if user is not logged in', () => {
      return request(app.getHttpServer())
        .post(`/post/${postId}/likes`)
        .expect(HttpStatus.UNAUTHORIZED);
    });

    it('should return 400 if post id param is not Int', () => {
      const postId = 'NotInt';

      return agent
        .post(`/post/${postId}/likes`)
        .auth(accessToken, { type: 'bearer' })
        .expect(HttpStatus.BAD_REQUEST);
    });

    afterAll(async () => {
      await postService.unlike(postId, user.id);
    });
  });

  describe('/post/:id/likes (DELETE)', () => {
    const user = userData[0];
    const postId = 2;

    let agent: TestAgent;
    let accessToken: string;

    beforeEach(async () => {
      const authCredentials: AuthCredentialsDto = {
        name: user.name,
        email: user.email,
        password: 'password',
      };
      agent = request.agent(app.getHttpServer());

      accessToken = (await agent.post(`/auth/login`).send(authCredentials))
        .body['accessToken'];
    });

    it("should return 200 and post's likes count if user is logged in", async () => {
      await postService.like(postId, user.id);

      return agent
        .delete(`/post/${postId}/likes`)
        .auth(accessToken, { type: 'bearer' })
        .expect(HttpStatus.OK)
        .expect((response: request.Response) => {
          expect(response.body).toMatchObject({
            id: postId,
            likesCount: expect.any(Number),
          });
        });
    });

    it('should return 404 if user has not liked post', () => {
      return agent
        .delete(`/post/${postId}/likes`)
        .auth(accessToken, { type: 'bearer' })
        .expect(HttpStatus.NOT_FOUND);
    });

    it('should return 404 if post with provided id does not exist', () => {
      const postId = -1;
      return agent
        .delete(`/post/${postId}/likes`)
        .auth(accessToken, { type: 'bearer' })
        .expect(HttpStatus.NOT_FOUND);
    });

    it('should return 401 if user is not logged in', () => {
      return request(app.getHttpServer())
        .delete(`/post/${postId}/likes`)
        .expect(HttpStatus.UNAUTHORIZED);
    });

    it('should return 400 if post id param is not Int', () => {
      const postId = 'NotInt';

      return agent
        .delete(`/post/${postId}/likes`)
        .auth(accessToken, { type: 'bearer' })
        .expect(HttpStatus.BAD_REQUEST);
    });
  });
});
