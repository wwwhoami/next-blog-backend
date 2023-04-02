import { HttpStatus, INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import { userData } from 'data/seed-data';
import { AppModule } from 'src/app.module';
import { AuthCredentialsDto } from 'src/auth/dto/auth-credentials.dto';
import { CommentService } from 'src/comment/comment.service';
import { CommentEntity } from 'src/comment/entities/comment.entity';
import { ErrorInterceptor } from 'src/common/interceptors/error.interceptor';
import request from 'supertest';

const authorId = 'ab182222-5603-4b01-909b-a68fbb3a2153';

const comment: CommentEntity = {
  id: 1,
  authorId,
  postId: 1,
  ancestorId: null,
  content: 'content',
  isDeleted: false,
  createdAt: new Date(),
  updatedAt: new Date(),
  likesCount: 0,
};

describe('Comment (e2e)', () => {
  let commentService: CommentService;
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();

    app.useGlobalPipes(new ValidationPipe({ transform: true }));
    app.useGlobalInterceptors(new ErrorInterceptor());
    app.use(cookieParser());

    commentService = moduleRef.get(CommentService);

    await app.init();
  });

  describe('/comment/:id (GET)', () => {
    it('should get comment by id', () => {
      const commentId = 1;

      return request(app.getHttpServer())
        .get(`/comment/${commentId}`)
        .expect(HttpStatus.OK)
        .expect((response: request.Response) => {
          expect(response.body).toMatchObject({
            id: comment.id,
            authorId: expect.any(String),
            postId: expect.any(Number),
            content: expect.any(String),
            isDeleted: expect.any(Boolean),
          });
        });
    });

    it('should get 404 Not Found if comment does not exist', () => {
      const commentId = -1;

      return request(app.getHttpServer())
        .get(`/comment/${commentId}`)
        .expect(HttpStatus.NOT_FOUND)
        .expect((response: request.Response) => {
          expect(response.body).toMatchObject({
            message: 'Not Found',
            statusCode: 404,
          });
        });
    });

    it('should get 400 Bad Request if comment id is not a number', () => {
      const commentId = 'abc';

      return request(app.getHttpServer())
        .get(`/comment/${commentId}`)
        .expect(HttpStatus.BAD_REQUEST);
    });
  });

  describe('/comment/:id/replies (GET)', () => {
    it('should get replies of comment by id', () => {
      const commentId = 1;

      return request(app.getHttpServer())
        .get(`/comment/${commentId}/replies`)
        .expect(HttpStatus.OK)
        .expect((response: request.Response) => {
          expect(Array.isArray(response.body)).toBe(true);
          expect(response.body[0]).toEqual({
            id: expect.any(Number),
            authorId: expect.any(String),
            postId: expect.any(Number),
            content: expect.any(String),
            isDeleted: expect.any(Boolean),
            ancestorId: expect.any(Number),
            depth: expect.any(Number),
            createdAt: expect.any(String),
            updatedAt: expect.any(String),
          });
          // check that createdAt and updatedAt are correct
          expect(new Date(response.body[0].createdAt).getTime()).not.toBe(NaN);
          expect(new Date(response.body[0].updatedAt).getTime()).not.toBe(NaN);
        });
    });

    it('should get 404 Not Found if comment with provided id does not exist', () => {
      const commentId = -1;

      return request(app.getHttpServer())
        .get(`/comment/${commentId}/replies`)
        .expect(HttpStatus.NOT_FOUND);
    });

    it('should get 400 Bad Request if id is not a number', () => {
      const commentId = 'abc';

      return request(app.getHttpServer())
        .get(`/comment/${commentId}/replies`)
        .expect(HttpStatus.BAD_REQUEST);
    });
  });

  describe('/comment/article:articleId (GET)', () => {
    it('should get comments of article by id', () => {
      const articleId = 1;

      return request(app.getHttpServer())
        .get(`/comment/article/${articleId}`)
        .expect(HttpStatus.OK)
        .expect((response: request.Response) => {
          expect(Array.isArray(response.body)).toBe(true);
          expect(response.body[0]).toEqual({
            id: expect.any(Number),
            authorId: expect.any(String),
            postId: expect.any(Number),
            content: expect.any(String),
            isDeleted: expect.any(Boolean),
            ancestorId: null,
            depth: expect.any(Number),
            createdAt: expect.any(String),
            updatedAt: expect.any(String),
          });
          expect(new Date(response.body[0].createdAt).getTime()).not.toBe(NaN);
          expect(new Date(response.body[0].updatedAt).getTime()).not.toBe(NaN);
        });
    });

    it('should get 404 Not Found if article with provided id does not exist', () => {
      const articleId = -1;

      return request(app.getHttpServer())
        .get(`/comment/article/${articleId}`)
        .expect(HttpStatus.NOT_FOUND);
    });

    it('should get 400 Bad Request if id is not a number', () => {
      const articleId = 'abc';

      return request(app.getHttpServer())
        .get(`/comment/article/${articleId}`)
        .expect(HttpStatus.BAD_REQUEST);
    });
  });

  describe('/comment (POST)', () => {
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

    it('should create new comment if user is logged in', () => {
      const newComment = {
        postId: 1,
        content: 'New comment',
      };

      return agent
        .post('/comment')
        .auth(accessToken, { type: 'bearer' })
        .send(newComment)
        .expect(HttpStatus.CREATED)
        .expect((response: request.Response) => {
          expect(response.body).toEqual({
            id: expect.any(Number),
            ...newComment,
            authorId,
            isDeleted: false,
            ancestorId: null,
            createdAt: expect.any(String),
            updatedAt: expect.any(String),
            likesCount: expect.any(Number),
          });
          // check that createdAt and updatedAt are correct
          expect(new Date(response.body.createdAt).getTime).not.toBe(NaN);
          expect(new Date(response.body.updatedAt).getTime).not.toBe(NaN);
        });
    });

    it('should create new reply if user is logged in', () => {
      const ancestorId = 1;
      const newComment = {
        postId: 1,
        content: 'New comment',
        ancestorId,
      };

      return agent
        .post('/comment')
        .auth(accessToken, { type: 'bearer' })
        .send(newComment)
        .expect(HttpStatus.CREATED)
        .expect((response: request.Response) => {
          expect(response.body).toEqual({
            id: expect.any(Number),
            ...newComment,
            authorId,
            isDeleted: false,
            ancestorId,
            createdAt: expect.any(String),
            updatedAt: expect.any(String),
            likesCount: expect.any(Number),
          });
          // check that createdAt and updatedAt are correct
          expect(new Date(response.body.createdAt).getTime).not.toBe(NaN);
          expect(new Date(response.body.updatedAt).getTime).not.toBe(NaN);
        });
    });

    it('should get 404 NotFound if user tries to create a reply to a non-existent comment', () => {
      const ancestorId = -1;
      const newComment = {
        postId: 1,
        content: 'New comment',
        ancestorId,
      };

      return agent
        .post('/comment')
        .auth(accessToken, { type: 'bearer' })
        .send(newComment)
        .expect(HttpStatus.NOT_FOUND);
    });

    it('should get 409 Conflict if user tries to create a reply to a deleted comment', () => {
      const ancestorId = 17;
      const newComment = {
        postId: 1,
        content: 'New comment',
        ancestorId,
      };

      return agent
        .post('/comment')
        .auth(accessToken, { type: 'bearer' })
        .send(newComment)
        .expect(HttpStatus.CONFLICT)
        .expect((response: request.Response) => {
          expect(response.body).toMatchObject({
            statusCode: 409,
          });
        });
    });

    it('should get 409 Conflict if user tries to create a reply to a comment that is a comment to another post', () => {
      const ancestorId = 1;
      const newComment = {
        postId: 4,
        content: 'New comment',
        ancestorId,
      };

      return agent
        .post('/comment')
        .auth(accessToken, { type: 'bearer' })
        .send(newComment)
        .expect(HttpStatus.CONFLICT)
        .expect((response: request.Response) => {
          expect(response.body).toMatchObject({
            statusCode: 409,
          });
        });
    });

    it('should get 401 Unauthorized if user is not logged in', () => {
      const newComment = {
        postId: 1,
        content: 'New comment',
      };

      return agent
        .post('/comment')
        .send(newComment)
        .expect(HttpStatus.UNAUTHORIZED);
    });

    it('should get 400 Bad Request if bad body provided (postId is not a number or content is not string)', () => {
      const newComment = {
        postId: 'abc',
        content: 123,
      };

      return agent
        .post('/comment')
        .auth(accessToken, { type: 'bearer' })
        .send(newComment)
        .expect(HttpStatus.BAD_REQUEST);
    });
  });

  describe('/comment/:id (PATCH)', () => {
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

    it('should update comment if user is logged in and is the author of the comment', () => {
      const commentId = 1;
      const updatedComment = {
        content: 'Updated comment',
      };

      return agent
        .patch(`/comment/${commentId}`)
        .auth(accessToken, { type: 'bearer' })
        .send(updatedComment)
        .expect(HttpStatus.OK)
        .expect((response: request.Response) => {
          expect(response.body).toEqual({
            id: commentId,
            ...updatedComment,
            authorId,
            postId: 1,
            isDeleted: false,
            ancestorId: null,
            createdAt: expect.any(String),
            updatedAt: expect.any(String),
            likesCount: expect.any(Number),
          });
          // check that createdAt and updatedAt are correct
          expect(new Date(response.body.createdAt).getTime).not.toBe(NaN);
          expect(new Date(response.body.updatedAt).getTime).not.toBe(NaN);
        });
    });

    it('should get 401 Unauthorized if user is not logged in', () => {
      const commentId = 1;
      const updatedComment = {
        content: 'Updated comment',
      };

      return agent
        .patch(`/comment/${commentId}`)
        .send(updatedComment)
        .expect(HttpStatus.UNAUTHORIZED);
    });

    it('should get 403 Forbidden if user is logged in but is not the author of the comment', () => {
      const commentId = 2;
      const updatedComment = {
        content: 'Updated comment',
      };

      return agent
        .patch(`/comment/${commentId}`)
        .auth(accessToken, { type: 'bearer' })
        .send(updatedComment)
        .expect(HttpStatus.FORBIDDEN);
    });

    it('should get 400 Bad Request if bad body provided (content is not string)', () => {
      const commentId = 1;
      const updatedComment = {
        content: 123,
      };

      return agent
        .patch(`/comment/${commentId}`)
        .auth(accessToken, { type: 'bearer' })
        .send(updatedComment)
        .expect(HttpStatus.BAD_REQUEST);
    });

    it('should get 404 Not Found if comment does not exist', () => {
      const commentId = -1;
      const updatedComment = {
        content: 'Updated comment',
      };

      return agent
        .patch(`/comment/${commentId}`)
        .auth(accessToken, { type: 'bearer' })
        .send(updatedComment)
        .expect(HttpStatus.NOT_FOUND);
    });

    it('should get 404 Not Found if comment is deleted', () => {
      const commentId = 17;
      const updatedComment = {
        content: 'Updated comment',
      };

      return agent
        .patch(`/comment/${commentId}`)
        .auth(accessToken, { type: 'bearer' })
        .send(updatedComment)
        .expect(HttpStatus.NOT_FOUND);
    });
  });

  describe('/comment/:id (DELETE)', () => {
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

    it('should delete comment if user is logged in and is the author of the comment', () => {
      const commentId = 1;

      return agent
        .delete(`/comment/${commentId}`)
        .auth(accessToken, { type: 'bearer' })
        .expect(HttpStatus.OK)
        .expect((response: request.Response) => {
          expect(response.body).toEqual({
            id: commentId,
            content: 'COMMENT IS DELETED',
            authorId,
            postId: 1,
            isDeleted: true,
            ancestorId: null,
            createdAt: expect.any(String),
            updatedAt: expect.any(String),
            likesCount: expect.any(Number),
          });
          // check that createdAt and updatedAt are correct
          expect(new Date(response.body.createdAt).getTime).not.toBe(NaN);
          expect(new Date(response.body.updatedAt).getTime).not.toBe(NaN);
        });
    });

    it('should get 401 Unauthorized if user is not logged in', () => {
      const commentId = 1;

      return agent
        .delete(`/comment/${commentId}`)
        .expect(HttpStatus.UNAUTHORIZED);
    });

    it('should get 403 Forbidden if user is logged in but is not the author of the comment', () => {
      const commentId = 2;

      return agent
        .delete(`/comment/${commentId}`)
        .auth(accessToken, { type: 'bearer' })
        .expect(HttpStatus.FORBIDDEN);
    });

    it('should get 404 Not Found if comment does not exist', () => {
      const commentId = -1;

      return agent
        .delete(`/comment/${commentId}`)
        .auth(accessToken, { type: 'bearer' })
        .expect(HttpStatus.NOT_FOUND);
    });
  });

  describe('/comment/:id/likes (GET)', () => {
    const users = userData.slice(0, 3);
    const commentId = 2;

    beforeAll(async () => {
      const liked = users.map((user) =>
        commentService.like(commentId, user.id),
      );
      await Promise.all(liked);
    });

    it('should return 200 and array of users who liked comment', () => {
      const expected = users.map((user) => ({
        user: {
          name: user.name,
          image: user.image,
        },
      }));

      return request(app.getHttpServer())
        .get(`/comment/${commentId}/likes`)
        .expect(HttpStatus.OK)
        .expect((response: request.Response) => {
          expect(response.body).toBeInstanceOf(Array);
          expect(response.body).toEqual(expect.arrayContaining(expected));
        });
    });

    it('should return 404 if comment with provided id does not exist', () => {
      const id = 12345;
      return request(app.getHttpServer())
        .get(`/comment/${id}/likes`)
        .expect(HttpStatus.NOT_FOUND);
    });

    it('should return 400 if comment id param is not Int', () => {
      const id = 'NotInt';
      return request(app.getHttpServer())
        .get(`/comment/${id}/likes`)
        .expect(HttpStatus.BAD_REQUEST);
    });

    afterAll(async () => {
      const unliked = users.map((user) =>
        commentService.unlike(commentId, user.id),
      );
      await Promise.all(unliked);
    });
  });

  describe('/comment/:id/likes (POST)', () => {
    const user = userData[0];
    let commentId: number;

    let agent: request.SuperAgentTest;
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

    beforeAll(async () => {
      const { id } = await commentService.create(
        {
          content: 'Comment',
          postId: 1,
        },
        user.id,
      );

      commentId = id;
    });

    it("should return 201 and comment's likes count if user is logged in", () => {
      return agent
        .post(`/comment/${commentId}/likes`)
        .auth(accessToken, { type: 'bearer' })
        .expect(HttpStatus.CREATED)
        .expect((response: request.Response) => {
          expect(response.body).toMatchObject({
            id: commentId,
            likesCount: expect.any(Number),
          });
        });
    });

    it('should return 422 if comment with provided id does not exist', () => {
      const commentId = -1;
      return agent
        .post(`/comment/${commentId}/likes`)
        .auth(accessToken, { type: 'bearer' })
        .expect(HttpStatus.UNPROCESSABLE_ENTITY);
    });

    it('should return 409 if user has already liked comment', () => {
      return agent
        .post(`/comment/${commentId}/likes`)
        .auth(accessToken, { type: 'bearer' })
        .expect(HttpStatus.CONFLICT);
    });

    it('should return 401 if user is not logged in', () => {
      return request(app.getHttpServer())
        .post(`/comment/${commentId}/likes`)
        .expect(HttpStatus.UNAUTHORIZED);
    });

    it('should return 400 if comment id param is not Int', () => {
      const commentId = 'NotInt';

      return agent
        .post(`/comment/${commentId}/likes`)
        .auth(accessToken, { type: 'bearer' })
        .expect(HttpStatus.BAD_REQUEST);
    });
  });

  describe('/comment/:id/likes (DELETE)', () => {
    const user = userData[0];
    const commentId = 1;

    let agent: request.SuperAgentTest;
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

    it("should return 200 and comment's likes count if user is logged in", async () => {
      const { id } = await commentService.create(
        {
          postId: 2,
          content: 'test',
        },
        user.id,
      );
      await commentService.like(id, user.id);

      return agent
        .delete(`/comment/${id}/likes`)
        .auth(accessToken, { type: 'bearer' })
        .expect(HttpStatus.OK)
        .expect(async (response: request.Response) => {
          expect(response.body).toMatchObject({
            id,
            likesCount: expect.any(Number),
          });
        });
    });

    it('should return 404 if user has not liked comment', () => {
      return agent
        .delete(`/comment/${commentId}/likes`)
        .auth(accessToken, { type: 'bearer' })
        .expect(HttpStatus.NOT_FOUND);
    });

    it('should return 404 if comment with provided id does not exist', () => {
      const commentId = -1;
      return agent
        .delete(`/comment/${commentId}/likes`)
        .auth(accessToken, { type: 'bearer' })
        .expect(HttpStatus.NOT_FOUND);
    });

    it('should return 401 if user is not logged in', () => {
      return request(app.getHttpServer())
        .delete(`/comment/${commentId}/likes`)
        .expect(HttpStatus.UNAUTHORIZED);
    });

    it('should return 400 if comment id param is not Int', () => {
      const commentId = 'NotInt';

      return agent
        .delete(`/comment/${commentId}/likes`)
        .auth(accessToken, { type: 'bearer' })
        .expect(HttpStatus.BAD_REQUEST);
    });
  });

  afterAll(async () => {
    await app.close();
  });
});
