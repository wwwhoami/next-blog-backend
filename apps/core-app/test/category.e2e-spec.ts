import { AppModule } from '@core/src/app.module';
import { CategoryNoDescription } from '@core/src/category/entities/category.entity';
import { ErrorInterceptor } from '@core/src/common/interceptors/error.interceptor';
import { HttpStatus, INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { isString } from 'class-validator';
import cookieParser from 'cookie-parser';
import request from 'supertest';

const categories: CategoryNoDescription[] = [
  {
    name: 'CSS',
    hexColor: '#2563eb',
  },
  {
    name: 'commodi',
    hexColor: '#e13d1a',
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

  afterAll(async () => {
    await app.close();
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

    it('should find categories (if searchTerm provided) as array of CategoryWithHotness in response body', () => {
      const searchTerm = 'css';

      return request(app.getHttpServer())
        .get(`/category`)
        .query({ searchTerm })
        .expect(HttpStatus.OK)
        .expect((response: request.Response) => {
          expect(response.body).toBeInstanceOf(Array);
          expect(response.body[0]).toMatchObject({
            name: expect.stringMatching(
              new RegExp('^' + searchTerm + '.*', 'i'),
            ),
            description: expect.any(String),
            hotness: expect.any(Number),
          });
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
    it('should get category combinations for provided categories as Array<string>', () => {
      return request(app.getHttpServer())
        .get(`/category/combo`)
        .query({
          categories: categories[0].name,
        })
        .expect(HttpStatus.OK)
        .expect((response: request.Response) => {
          expect(response.body).toBeInstanceOf(Array);
          expect(response.body.length).not.toEqual(0);
          expect(isString(response.body[0])).toBe(true);
        });
    });

    it('should get array of category combinations for provided categories as Array<string> of category combinations if any exists for provided searchTerm', () => {
      const searchTerm = 'tailwind';

      return request(app.getHttpServer())
        .get(`/category/combo`)
        .query({ searchTerm, categories: categories[0].name })
        .expect(HttpStatus.OK)
        .expect((response: request.Response) => {
          expect(response.body).toBeInstanceOf(Array);
          expect(isString(response.body[0])).toBe(true);
        });
    });

    it('should get all categories as Array<string> if no categories included in query param', () => {
      const categories: string[] = [];

      return request(app.getHttpServer())
        .get(`/category/combo`)
        .query({ categories: categories.join(',') })
        .expect(HttpStatus.OK)
        .expect((response: request.Response) => {
          expect(response.body).toBeInstanceOf(Array);
          expect(response.body.length).not.toEqual(0);
          expect(isString(response.body[0])).toBe(true);
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
          expect(response.body.length).toEqual(0);
          expect(response.body[0]).toBeUndefined();
        });
    });
  });
});
