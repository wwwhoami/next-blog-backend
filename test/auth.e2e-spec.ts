import { HttpStatus, INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import { userData } from 'data/seed-data';
import { AppModule } from 'src/app.module';
import { AuthCredentialsDto } from 'src/auth/dto/auth-credentials.dto';
import { ErrorInterceptor } from 'src/common/interceptors/error.interceptor';
import request from 'supertest';

const authCredentials: AuthCredentialsDto = {
  name: 'Alice Johnson',
  email: 'alice@prisma.io',
  password: 'password',
};

const newUser: AuthCredentialsDto = {
  name: 'Test Name',
  email: 'name@test.io',
  password: 'password',
};

const user = userData[0];

describe('Auth (e2e)', () => {
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

  describe('/auth/sign-up (POST)', () => {
    it('should sign up new user, set refreshToken cookie, return userData with access token', () => {
      return request(app.getHttpServer())
        .post('/auth/sign-up')
        .send(newUser)
        .expect(HttpStatus.CREATED)
        .expect('set-cookie', /refreshToken=.*; Path=\/; Expires=.*; HttpOnly/)
        .expect((response: request.Response) => {
          expect(response.body).toMatchObject({
            name: newUser.name,
            email: newUser.email,
            accessToken: expect.any(String),
          });
        });
    });

    it('should return 409 if user with provided email exists already', () => {
      const ConflictExceptionResponse = {
        error: 'Conflict',
        message: 'User with provided email already exists',
        statusCode: 409,
      };

      return request(app.getHttpServer())
        .post('/auth/sign-up')
        .send(newUser)
        .expect(HttpStatus.CONFLICT)
        .expect((response: request.Response) => {
          expect(response.body).toEqual(ConflictExceptionResponse);
        });
    });

    it('should return 409 if user with provided name exists already', () => {
      const ConflictExceptionResponse = {
        error: 'Conflict',
        message: 'User with provided name already exists',
        statusCode: 409,
      };
      const userToCreate = {
        name: newUser.name,
        email: 'new@email.com',
        password: 'password',
      };

      return request(app.getHttpServer())
        .post('/auth/sign-up')
        .send(userToCreate)
        .expect(HttpStatus.CONFLICT)
        .expect((response: request.Response) => {
          expect(response.body).toEqual(ConflictExceptionResponse);
        });
    });

    it('should return 400 if bad body provided', async () => {
      await request(app.getHttpServer())
        .post('/auth/sign-up')
        .send({
          name: 'name',
          password: 'password',
        })
        .expect(HttpStatus.BAD_REQUEST);

      await request(app.getHttpServer())
        .post('/auth/sign-up')
        .send({
          email: 'email@email.com',
          password: 'password',
        })
        .expect(HttpStatus.BAD_REQUEST);

      await request(app.getHttpServer())
        .post('/auth/sign-up')
        .send({
          name: 'name',
          email: 'email',
          password: 'password',
        })
        .expect(HttpStatus.BAD_REQUEST);

      await request(app.getHttpServer())
        .post('/auth/sign-up')
        .send({
          name: 'name',
          email: 'email@email.com',
          password: 'pas',
        })
        .expect(HttpStatus.BAD_REQUEST);

      await request(app.getHttpServer())
        .post('/auth/sign-up')
        .send({
          password: 'password',
        })
        .expect(HttpStatus.BAD_REQUEST);
    });
  });

  describe('/auth/login (POST)', () => {
    it('should login user if exists, set refreshToken cookie, return userData with access token', () => {
      return request(app.getHttpServer())
        .post(`/auth/login`)
        .send(authCredentials)
        .expect(HttpStatus.CREATED)
        .expect('set-cookie', /refreshToken=.*; Path=\/; Expires=.*; HttpOnly/)
        .expect((response: request.Response) => {
          expect(response.body).toMatchObject({
            email: user.email,
            image: user.image,
            name: user.name,
            accessToken: expect.any(String),
          });
        });
    });

    it('should return 401 if user with provided name not exists', () => {
      const invalidNameOrPassword = {
        error: 'Unauthorized',
        message: 'Invalid name or password',
        statusCode: 401,
      };

      return request(app.getHttpServer())
        .post(`/auth/login`)
        .send({ name: '12678cefg1', password: 'password' })
        .expect(HttpStatus.UNAUTHORIZED)
        .expect((response: request.Response) => {
          expect(response.body).toEqual(invalidNameOrPassword);
        });
    });

    it('should return 401 if user with provided email not exists', () => {
      const invalidEmailOrPassword = {
        error: 'Unauthorized',
        message: 'Invalid email or password',
        statusCode: 401,
      };

      return request(app.getHttpServer())
        .post(`/auth/login`)
        .send({ email: 'email@nonexistent.com', password: 'password' })
        .expect(HttpStatus.UNAUTHORIZED)
        .expect((response: request.Response) => {
          expect(response.body).toEqual(invalidEmailOrPassword);
        });
    });

    it('should return 400 if bad body provided', async () => {
      await request(app.getHttpServer())
        .post(`/auth/login`)
        .send({ password: 'asdwadaw' })
        .expect(HttpStatus.BAD_REQUEST);

      await request(app.getHttpServer())
        .post(`/auth/login`)
        .send({ email: 'email', password: 'asdwadaw' })
        .expect(HttpStatus.BAD_REQUEST);
    });
  });

  describe('/auth/logout (GET)', () => {
    it('should logout user if has access token in bearer auth header', () => {
      const agent = request.agent(app.getHttpServer());
      let accessToken: string;

      return agent
        .post(`/auth/login`)
        .send(authCredentials)
        .expect(HttpStatus.CREATED)
        .expect('set-cookie', /refreshToken=.*; Path=\/; Expires=.*; HttpOnly/)
        .expect((response: request.Response) => {
          expect(response.body).toMatchObject({
            email: user.email,
            image: user.image,
            name: user.name,
            accessToken: expect.any(String),
          });
          accessToken = response.body.accessToken;
        })
        .then(() => {
          return agent
            .get(`/auth/logout`)
            .auth(accessToken, { type: 'bearer' })
            .expect(HttpStatus.OK)
            .expect('set-cookie', /refreshToken=; Path=\/; Expires=.*/);
        });
    });

    it('should return 401 if has no access token in bearer auth header', () => {
      const accessToken = '';

      return request(app.getHttpServer())
        .get(`/auth/logout`)
        .auth(accessToken, { type: 'bearer' })
        .expect(HttpStatus.UNAUTHORIZED);
    });
  });

  describe('/auth/refresh (GET)', () => {
    it('should logout user if has access token in bearer auth header', () => {
      const agent = request.agent(app.getHttpServer());

      return agent
        .post(`/auth/login`)
        .send(authCredentials)
        .expect(HttpStatus.CREATED)
        .expect('set-cookie', /refreshToken=.*; Path=\/; Expires=.*; HttpOnly/)
        .expect((response: request.Response) => {
          expect(response.body).toMatchObject({
            email: user.email,
            image: user.image,
            name: user.name,
            accessToken: expect.any(String),
          });
        })
        .then(() => {
          return agent
            .get(`/auth/refresh`)
            .expect(HttpStatus.OK)
            .expect(
              'set-cookie',
              /refreshToken=.*; Path=\/; Expires=.*; HttpOnly/,
            )
            .expect((response: request.Response) => {
              expect(response.body).toMatchObject({
                accessToken: expect.any(String),
              });
            });
        });
    });

    it('should return 401 if has no access token in bearer auth header', () => {
      return request(app.getHttpServer())
        .get(`/auth/refresh`)
        .expect(HttpStatus.UNAUTHORIZED);
    });
  });

  afterAll(async () => {
    await app.close();
  });
});
