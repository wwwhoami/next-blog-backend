import { HttpStatus, INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import { AppModule } from 'src/app.module';
import request from 'supertest';

export const userData = [
  {
    id: 'ab182222-5603-4b01-909b-a68fbb3a2153',
    name: 'Alice Johnson',
    email: 'alice@prisma.io',
    image: 'https://randomuser.me/api/portraits/women/12.jpg',
  },
  {
    name: 'John Doe',
    email: 'john@prisma.io',
    image: 'https://randomuser.me/api/portraits/men/12.jpg',
  },
  {
    name: 'Sam Smith',
    email: 'sam@prisma.io',
    image: 'https://randomuser.me/api/portraits/men/11.jpg',
  },
  {
    name: 'Mike Richards',
    email: 'mahmoud@prisma.io',
    image: 'https://randomuser.me/api/portraits/men/13.jpg',
  },
];

describe('User (e2e)', () => {
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

  describe('/user/:username (GET)', () => {
    it('should get user data by username param', () => {
      const username = userData[0].name;
      const expectedData = userData[1];

      return request(app.getHttpServer())
        .get(`/user/${username}`)
        .expect(HttpStatus.OK)
        .expect((response: request.Response) => {
          expect(Object.keys(response.body)).toEqual(Object.keys(expectedData));
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
