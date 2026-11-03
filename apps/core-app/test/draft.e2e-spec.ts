import { AppModule } from '@core/src/app.module';
import { ErrorInterceptor } from '@core/src/common/interceptors/error.interceptor';
import { HttpStatus, INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import { userData } from 'data/seed-data';
import fs from 'node:fs';
import { DraftStatus, MediaTarget, MediaType } from 'prisma/generated/client';
import request from 'supertest';

// Prisma media responses contain BigInt fields.
(BigInt.prototype as any).toJSON = function () {
  return this.toString();
};

describe('Draft (e2e)', () => {
  let app: INestApplication;
  let accessToken: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true }));
    app.useGlobalInterceptors(new ErrorInterceptor());
    app.use(cookieParser());

    await app.init();

    const loginResponse = await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        email: userData[0].email,
        password: 'password',
      })
      .expect(HttpStatus.CREATED);

    accessToken = loginResponse.body.accessToken;
  });

  const createDraft = async (overrides = {}) => {
    const response = await request(app.getHttpServer())
      .post('/draft')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        title: 'Draft e2e title',
        excerpt: 'Draft e2e excerpt',
        content: '# Draft e2e content',
        categoryNames: [],
        ...overrides,
      })
      .expect(HttpStatus.CREATED);

    return response.body;
  };

  afterAll(async () => {
    await app.close();
  });

  it('requires authentication', () => {
    return request(app.getHttpServer())
      .get('/draft')
      .expect(HttpStatus.UNAUTHORIZED);
  });

  it('creates an owned draft', async () => {
    const draft = await createDraft();

    expect(draft).toEqual(
      expect.objectContaining({
        id: expect.any(String),
        title: 'Draft e2e title',
        excerpt: 'Draft e2e excerpt',
        content: '# Draft e2e content',
        status: DraftStatus.ACTIVE,
        media: expect.any(Array),
      }),
    );
  });

  it("lists the owner's active drafts", async () => {
    const draft = await createDraft();

    await request(app.getHttpServer())
      .get('/draft')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(HttpStatus.OK)
      .expect((response) => {
        expect(response.body).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              id: draft.id,
              status: DraftStatus.ACTIVE,
            }),
          ]),
        );
      });
  });

  it('reads an owned draft', async () => {
    const draft = await createDraft();

    await request(app.getHttpServer())
      .get(`/draft/${draft.id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(HttpStatus.OK)
      .expect((response) => {
        expect(response.body).toEqual(
          expect.objectContaining({ id: draft.id, title: 'Draft e2e title' }),
        );
      });
  });
  it('updates an owned draft', async () => {
    const draft = await createDraft();

    await request(app.getHttpServer())
      .put(`/draft/${draft.id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ title: 'Updated draft e2e title' })
      .expect(HttpStatus.OK)
      .expect((response) => {
        expect(response.body).toEqual(
          expect.objectContaining({
            id: draft.id,
            title: 'Updated draft e2e title',
            status: DraftStatus.ACTIVE,
          }),
        );
      });
  });

  it('claims an active draft and exposes asynchronous validation failure', async () => {
    const createResponse = await request(app.getHttpServer())
      .post('/draft')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        title: 'Incomplete draft',
        excerpt: '',
        content: '',
        categoryNames: [],
      })
      .expect(HttpStatus.CREATED);

    const id = createResponse.body.id;

    await request(app.getHttpServer())
      .post(`/draft/${id}/publish`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(HttpStatus.CREATED)
      .expect((response) => {
        expect(response.body).toEqual(
          expect.objectContaining({ id, status: DraftStatus.PUBLISHING }),
        );
      });

    for (let attempt = 0; attempt < 20; attempt += 1) {
      const response = await request(app.getHttpServer())
        .get(`/draft/${id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(HttpStatus.OK);

      if (response.body.status === DraftStatus.ACTIVE) {
        expect(response.body.validationError).toContain(
          'Title, excerpt, and content are required',
        );
        return;
      }

      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    throw new Error('Draft publication did not finish during the test');
  });

  it('publishes a valid draft asynchronously', async () => {
    const title = `Successful draft ${Date.now()}`;
    const createResponse = await request(app.getHttpServer())
      .post('/draft')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        title,
        excerpt: 'A publishable draft excerpt',
        content: '# Publishable draft',
        categoryNames: [],
      })
      .expect(HttpStatus.CREATED);

    const id = createResponse.body.id;
    const imageBuffer = await fs.promises.readFile(
      './data/media/sample_png.png',
    );
    const mediaResponse = await request(app.getHttpServer())
      .post('/media')
      .set('Authorization', `Bearer ${accessToken}`)
      .field('type', MediaType.IMAGE)
      .field('target', MediaTarget.POST)
      .field('draftId', id)
      .attach('file', imageBuffer, {
        filename: 'draft-cover.png',
        contentType: 'image/png',
      })
      .expect(HttpStatus.CREATED);

    await request(app.getHttpServer())
      .put(`/draft/${id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ coverMediaId: mediaResponse.body.id })
      .expect(HttpStatus.OK);

    await request(app.getHttpServer())
      .post(`/draft/${id}/publish`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(HttpStatus.CREATED)
      .expect((response) => {
        expect(response.body).toEqual(
          expect.objectContaining({ id, status: DraftStatus.PUBLISHING }),
        );
      });

    for (let attempt = 0; attempt < 20; attempt += 1) {
      const response = await request(app.getHttpServer())
        .get(`/draft/${id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(HttpStatus.OK);

      if (response.body.status === DraftStatus.ARCHIVED) {
        expect(response.body.postId).toEqual(expect.any(Number));
        expect(response.body.post).toEqual(
          expect.objectContaining({ id: response.body.postId, title }),
        );
        return;
      }

      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    throw new Error('Draft publication did not complete during the test');
  });
});
