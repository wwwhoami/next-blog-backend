import { HttpStatus, INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { isString } from 'class-validator';
import cookieParser from 'cookie-parser';
import { AppModule } from 'src/app.module';
import { CategoryEntity } from 'src/category/entities/category.entity';
import { ErrorInterceptor } from 'src/common/interceptors/error.interceptor';
import request from 'supertest';

const categories: CategoryEntity[] = [
  {
    name: 'commodi',
    hexColor: '#e13d1a',
  },
  {
    name: 'CSS',
    hexColor: '#2563eb',
  },
  {
    name: 'culpa',
    hexColor: '#ded30f',
  },
];

describe('Category (e2e)', () => {
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

  describe('/category (GET)', () => {
    it('should get categories as array of CategoryEntity in response body', () => {
      return request(app.getHttpServer())
        .get('/category')
        .expect(HttpStatus.OK)
        .expect((response: request.Response) => {
          expect(response.body).toBeInstanceOf(Array);
          expect(Object.keys(response.body[0])).toEqual(
            Object.keys(categories[0]),
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
        .get('/category')
        .query(wrongQueryParams)
        .expect(HttpStatus.BAD_REQUEST)
        .expect((response: request.Response) => {
          expect(response.body).toMatchObject(notFoundResponseBody);
        });
    });
  });

  describe('/category/combo (GET)', () => {
    it('should get array of category combinations as two dimensional array of strings', () => {
      return request(app.getHttpServer())
        .get(`/category/combo`)
        .expect(HttpStatus.OK)
        .expect((response: request.Response) => {
          expect(response.body).toBeInstanceOf(Array);
          expect(response.body[0]).toBeInstanceOf(Array);
          expect(isString(response.body[0][0])).toBe(true);
        });
    });

    it('should get two dimensional array of category combinations if any exists for provided searchTerm', () => {
      const searchTerm = 'tailwind';

      return request(app.getHttpServer())
        .get(`/category/combo`)
        .query({ searchTerm })
        .expect(HttpStatus.OK)
        .expect((response: request.Response) => {
          expect(response.body).toBeInstanceOf(Array);
          expect(response.body[0]).toBeInstanceOf(Array);
          expect(isString(response.body[0][0])).toBe(true);
        });
    });

    it('should get empty array of category combinations if none exists for provided searchTerm', () => {
      const searchTerm = '99a54c445a0d63f0304df35046a542ae';

      return request(app.getHttpServer())
        .get(`/category/combo`)
        .query({ searchTerm })
        .expect(HttpStatus.OK)
        .expect((response: request.Response) => {
          expect(response.body).toBeInstanceOf(Array);
          expect(response.body[0]).toBeUndefined();
        });
    });
  });

  afterAll(async () => {
    await app.close();
  });
});
