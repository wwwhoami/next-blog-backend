import { HttpStatus, INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import { userData } from 'data/seed-data';
import { AppModule } from 'src/app.module';
import { ErrorInterceptor } from 'src/common/interceptors/error.interceptor';
import request from 'supertest';

const user = userData[0];

describe('User (e2e)', () => {
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

  afterAll(async () => {
    await app.close();
  });
});
