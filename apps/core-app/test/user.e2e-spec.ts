import { AppModule } from '@core/src/app.module';
import { AuthCredentialsDto } from '@core/src/auth/dto/auth-credentials.dto';
import { ErrorInterceptor } from '@core/src/common/interceptors/error.interceptor';
import { UserService } from '@core/src/user/user.service';
import { HttpStatus, INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import { userData } from 'data/seed-data';
import { PinoLogger } from 'nestjs-pino';
import request from 'supertest';
import TestAgent from 'supertest/lib/agent';

const user = userData[0];

describe('User (e2e)', () => {
  let app: INestApplication;
  let userService: UserService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    userService = moduleRef.get(UserService);
    app = moduleRef.createNestApplication();

    app.useGlobalPipes(new ValidationPipe({ transform: true }));
    app.useGlobalInterceptors(new ErrorInterceptor());
    app.use(cookieParser());

    await app.init();

    // disable logging
    PinoLogger.root.level = 'silent';
  });

  afterAll(async () => {
    await app.close();
  });

  describe('/user/:username (GET)', () => {
    it('should get user data by username param', () => {
      const username = user.name;
      const expectedData = {
        name: 'Alice Johnson',
        email: 'alice@prisma.io',
        image: 'https://randomuser.me/api/portraits/women/12.jpg',
      };

      return request(app.getHttpServer())
        .get(`/user/${username}`)
        .expect(HttpStatus.OK)
        .expect((response: request.Response) => {
          expect(response.body).toMatchObject(expectedData);
        });
    });

    it('should get 404 Not Found if no user found', () => {
      const username = 'userData[0].name';

      return request(app.getHttpServer())
        .get(`/user/${username}`)
        .expect(HttpStatus.NOT_FOUND)
        .expect((response: request.Response) => {
          expect(response.body[0]).toBeUndefined();
        });
    });
  });

  describe('/user/follow/:followingId (POST)', () => {
    let accessToken: string;
    let agent: TestAgent;

    beforeAll(async () => {
      const authCredentials: AuthCredentialsDto = {
        name: user.name,
        email: user.email,
        password: 'password',
      };
      agent = request.agent(app.getHttpServer());

      accessToken = (await agent.post(`/auth/login`).send(authCredentials))
        .body['accessToken'];
    });

    it('should follow user if user is logged in, return 201', () => {
      const followingId = userData[1].id;

      return agent
        .post(`/user/follow/${followingId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(HttpStatus.CREATED)
        .expect((response: request.Response) => {
          expect(response.body).toMatchObject({
            followerId: user.id,
            followingId,
          });
        });
    });

    it('should return 401 if user is not logged in', () => {
      const followingId = userData[1].id;

      return agent
        .post(`/user/follow/${followingId}`)
        .expect(HttpStatus.UNAUTHORIZED);
    });

    it('should return 409 if user is already following', () => {
      const followingId = userData[1].id;

      return agent
        .post(`/user/follow/${followingId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(HttpStatus.CONFLICT);
    });

    it('should return 404 if user to follow does not exist', () => {
      const followingId = '00000000-0000-0000-0000-000000000000';

      return agent
        .post(`/user/follow/${followingId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(HttpStatus.NOT_FOUND);
    });

    it('should return 400 if followingId is not UUID', () => {
      const followingId = 'test';

      return agent
        .post(`/user/follow/${followingId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(HttpStatus.BAD_REQUEST);
    });

    afterAll(async () => {
      await userService.unfollow(user.id, userData[1].id);
    });
  });

  describe('/user/unfollow/:followingId (DELETE)', () => {
    let accessToken: string;
    let agent: TestAgent;

    beforeAll(async () => {
      const authCredentials: AuthCredentialsDto = {
        name: user.name,
        email: user.email,
        password: 'password',
      };
      agent = request.agent(app.getHttpServer());

      accessToken = (await agent.post(`/auth/login`).send(authCredentials))
        .body['accessToken'];
    });

    it('should unfollow user if user is logged in, return 200', async () => {
      const followingId = userData[1].id;

      await userService.follow(user.id, followingId);

      return agent
        .delete(`/user/follow/${followingId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(HttpStatus.OK)
        .expect((response: request.Response) => {
          expect(response.body).toMatchObject({
            followerId: user.id,
            followingId,
          });
        });
    });

    it('should return 401 if user is not logged in', () => {
      const followingId = userData[1].id;

      return agent
        .delete(`/user/follow/${followingId}`)
        .expect(HttpStatus.UNAUTHORIZED);
    });

    it('should return 404 if user is not following', () => {
      const followingId = userData[1].id;

      return agent
        .delete(`/user/follow/${followingId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(HttpStatus.NOT_FOUND);
    });

    it('should return 404 if user to unfollow does not exist', () => {
      const followingId = '00000000-0000-0000-0000-000000000000';

      return agent
        .delete(`/user/follow/${followingId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(HttpStatus.NOT_FOUND);
    });

    it('should return 400 if followingId is not UUID', () => {
      const followingId = 'test';

      return agent
        .delete(`/user/follow/${followingId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(HttpStatus.BAD_REQUEST);
    });
  });

  describe('/user/:userId/following (GET)', () => {
    const following = [userData[1].id, userData[2].id];

    beforeAll(async () => {
      await Promise.all(
        following.map(async (id) => await userService.follow(user.id, id)),
      );
    });

    it('should get followed users if user is logged in, return 200', () => {
      return request(app.getHttpServer())
        .get(`/user/${user.id}/following`)
        .expect(HttpStatus.OK)
        .expect((response: request.Response) => {
          expect(response.body).toHaveLength(following.length);
          expect(response.body).toEqual(
            expect.arrayContaining([
              expect.objectContaining({
                id: expect.any(String),
                name: expect.any(String),
                email: expect.any(String),
                image: expect.any(String),
              }),
            ]),
          );
          expect(response.body).toEqual(
            expect.arrayContaining(
              following.map((id) =>
                expect.objectContaining({
                  id,
                }),
              ),
            ),
          );
        });
    });

    it('should return empty array if user does not exist', () => {
      const userId = '00000000-0000-0000-0000-000000000000';
      return request(app.getHttpServer())
        .get(`/user/${userId}/following`)
        .expect(HttpStatus.OK)
        .expect((response: request.Response) => {
          expect(response.body).toBeInstanceOf(Array);
          expect(response.body).toHaveLength(0);
        });
    });

    it('should return 400 if userId is not UUID', () => {
      const userId = 'test';
      return request(app.getHttpServer())
        .get(`/user/${userId}/following`)
        .expect(HttpStatus.BAD_REQUEST);
    });

    afterAll(async () => {
      await Promise.all(
        following.map(async (id) => await userService.unfollow(user.id, id)),
      );
    });
  });

  describe('/user/:userId/followers (GET)', () => {
    const followers = [userData[1].id, userData[2].id];

    beforeAll(async () => {
      await Promise.all(
        followers.map(async (id) => await userService.follow(id, user.id)),
      );
    });

    it('should get followers of user, return 200', () => {
      return request(app.getHttpServer())
        .get(`/user/${user.id}/followers`)
        .expect(HttpStatus.OK)
        .expect((response: request.Response) => {
          expect(response.body).toHaveLength(followers.length);
          expect(response.body).toEqual(
            expect.arrayContaining([
              expect.objectContaining({
                id: expect.any(String),
                name: expect.any(String),
                email: expect.any(String),
                image: expect.any(String),
              }),
            ]),
          );
          expect(response.body).toEqual(
            expect.arrayContaining(
              followers.map((id) =>
                expect.objectContaining({
                  id,
                }),
              ),
            ),
          );
        });
    });

    it('should return 404 if user does not exist', () => {
      const userId = '00000000-0000-0000-0000-000000000000';

      return request(app.getHttpServer())
        .get(`/user/${userId}/followers`)
        .expect(HttpStatus.OK)
        .expect((response: request.Response) => {
          expect(response.body).toBeInstanceOf(Array);
          expect(response.body).toHaveLength(0);
        });
    });

    it('should return 400 if userId is not UUID', () => {
      const userId = 'test';

      return request(app.getHttpServer())
        .get(`/user/${userId}/followers`)
        .expect(HttpStatus.BAD_REQUEST);
    });

    afterAll(async () => {
      await Promise.all(
        followers.map(async (id) => await userService.unfollow(id, user.id)),
      );
    });
  });
});
