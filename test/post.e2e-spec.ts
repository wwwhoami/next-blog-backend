import { HttpStatus, INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PostModule } from 'src/post/post.module';
import { PostRepository } from 'src/post/post.repository';
import { PostService } from 'src/post/post.service';
import { PrismaService } from 'src/prisma/prisma.service';
import * as request from 'supertest';

const postsWithNoContent = [
  {
    id: 1006,
    createdAt: '2021-05-15T00:00:00.000Z',
    updatedAt: '2022-05-23T23:47:35.677Z',
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
    categories: [
      {
        category: {
          name: 'CSS',
          hexColor: '#2563eb',
        },
      },
    ],
  },
  {
    id: 335,
    createdAt: '2021-05-12T15:39:50.348Z',
    updatedAt: '2022-05-23T23:47:32.957Z',
    title: 'Nostrum velit non.',
    slug: 'nostrum-velit-non.',
    excerpt:
      'Deserunt aut dolor voluptatem pariatur at quia enim rerum quod omnis non harum harum velit.',
    viewCount: 0,
    coverImage: 'http://loremflickr.com/1200/480/business',
    author: {
      name: 'Vicky',
      image:
        'https://cloudflare-ipfs.com/ipfs/Qmd3W5DuhgHirLHGVixi6V76LhCkZUz6pnFt5AJBiyvHye/avatar/1205.jpg',
    },
    categories: [
      {
        category: {
          name: 'CSS',
          hexColor: '#2563eb',
        },
      },
    ],
  },
  {
    id: 995,
    createdAt: '2021-05-12T02:32:34.229Z',
    updatedAt: '2022-05-23T23:47:35.613Z',
    title: 'Architecto iusto nesciunt.',
    slug: 'architecto-iusto-nesciunt.',
    excerpt:
      'Quam est est iste voluptatem consectetur illo sit voluptatem est labore laborum debitis quia sint.',
    viewCount: 0,
    coverImage: 'http://loremflickr.com/1200/480/business',
    author: {
      name: 'Maybell',
      image:
        'https://cloudflare-ipfs.com/ipfs/Qmd3W5DuhgHirLHGVixi6V76LhCkZUz6pnFt5AJBiyvHye/avatar/790.jpg',
    },
    categories: [
      {
        category: {
          name: 'JavaScript',
          hexColor: '#ca8a04',
        },
      },
    ],
  },
  {
    id: 23,
    createdAt: '2021-05-12T01:11:27.097Z',
    updatedAt: '2022-05-23T23:47:31.638Z',
    title: 'Quo vel illum.',
    slug: 'quo-vel-illum.',
    excerpt:
      'A error officia rem eligendi maiores quasi voluptatum ipsum autem sit praesentium aperiam qui eius.',
    viewCount: 0,
    coverImage: 'http://loremflickr.com/1200/480/business',
    author: {
      name: 'Keara',
      image:
        'https://cloudflare-ipfs.com/ipfs/Qmd3W5DuhgHirLHGVixi6V76LhCkZUz6pnFt5AJBiyvHye/avatar/315.jpg',
    },
    categories: [
      {
        category: {
          name: 'PHP',
          hexColor: '#9333ea',
        },
      },
    ],
  },
];

describe('Post (e2e)', () => {
  let app: INestApplication;
  let postService: PostService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [PostModule],
      providers: [PrismaService, PostRepository, PostService],
    }).compile();

    postService = moduleRef.get(PostService);
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true }));

    await app.init();
  });

  describe('/post (GET)', () => {
    it('should get 10 posts as array of PostEntity in response body by default', () => {
      return request(app.getHttpServer())
        .get('/post')
        .expect(HttpStatus.OK)
        .expect((response: request.Response) => {
          expect(response.body).toEqual(
            expect.arrayContaining([
              expect.objectContaining(postsWithNoContent[0]),
            ]),
          );
          expect(response.body.length).toEqual(10);
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
          expect(response.body).toEqual(expect.arrayContaining([]));
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
          console.log(response.body[0]);
          expect(response.body).toEqual(
            expect.arrayContaining([
              expect.objectContaining({
                content: expect.any(String),
              }),
            ]),
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
          console.log(response.body[0]);
          expect(response.body).toEqual(
            expect.arrayContaining([
              expect.not.objectContaining({
                content: expect.any(String),
              }),
            ]),
          );
        });
    });
  });

  afterAll(async () => {
    await app.close();
  });
});
