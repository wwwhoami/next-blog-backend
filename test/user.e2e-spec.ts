import { HttpStatus, INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { isString } from 'class-validator';
import { CategoryModule } from 'src/category/category.module';
import { UserModule } from 'src/user/user.module';
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
      imports: [UserModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true }));

    await app.init();
  });

  describe('/user/:username (GET)', () => {
    it('should get user data by username param', () => {
      const username = userData[1].name;

      return request(app.getHttpServer())
        .get(`/user/${username}`)
        .expect(HttpStatus.OK)
        .expect((response: request.Response) => {
          expect(Object.keys(response.body[0])).toEqual(
            Object.keys(username[1]),
          );
        });
    });

    it('should get as many categories as in take query param', () => {
      const take = 5;
      return request(app.getHttpServer())
        .get('/category')
        .query({ take })
        .expect(HttpStatus.OK)
        .expect((response: request.Response) => {
          expect(response.body).toBeInstanceOf(Array);
          expect(response.body.length).toEqual(take);
        });
    });

    it('should get no categories if take query param zero', () => {
      const take = 0;
      return request(app.getHttpServer())
        .get('/category')
        .query({ take })
        .expect(HttpStatus.OK)
        .expect((response: request.Response) => {
          expect(response.body).toEqual([]);
          expect(response.body.length).toEqual(take);
        });
    });

    it('should return 400 BAD_REQUEST if query params are wrong', () => {
      const wrongQueryParams = {
        take: 'asd',
        skip: 'asd',
      };

      const notFoundResponseBody = {
        error: 'Bad Request',
        message: [
          'take must be an integer number',
          'skip must be an integer number',
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
  });

  afterAll(async () => {
    await app.close();
  });
});
