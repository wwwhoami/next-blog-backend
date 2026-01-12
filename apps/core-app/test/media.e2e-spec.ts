import { AppModule } from '@core/src/app.module';
import { ErrorInterceptor } from '@core/src/common/interceptors/error.interceptor';
import { HttpStatus, INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import { userData } from 'data/seed-data';
import fs from 'node:fs';
import { MediaTarget, MediaType, MediaVariant } from 'prisma/generated/client';
import request from 'supertest';

// Override JSON.stringify to handle BigInt
(BigInt.prototype as any).toJSON = function () {
  return this.toString();
};

function parseSse(raw: string) {
  return raw
    .split('\n\n') // event boundary
    .filter(Boolean)
    .map((block) => {
      const event: any = {};

      for (const line of block.split('\n')) {
        const [key, ...rest] = line.split(':');
        if (!key || rest.length === 0) continue;

        const value = rest.join(':').trim();

        if (key === 'data') {
          event.data ??= '';
          event.data += value;
        } else {
          event[key] = value;
        }
      }

      return event;
    });
}

describe('Media (e2e)', () => {
  let app: INestApplication;
  let accessToken: string;
  let userId: string;
  let testImageBuffer: Buffer;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true }));
    app.useGlobalInterceptors(new ErrorInterceptor());
    app.use(cookieParser());

    await app.init();

    // Disable logging for tests
    // PinoLogger.root.level = 'silent';

    // Login to get access token
    const loginResponse = await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        email: userData[0].email,
        password: 'password',
      })
      .expect(HttpStatus.CREATED);

    accessToken = loginResponse.body.accessToken;
    userId = userData[0].id;
    testImageBuffer = await fs.promises.readFile('./data/media/sample_png.png');
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /media', () => {
    it('should upload an image successfully', async () => {
      const response = await request(app.getHttpServer())
        .post('/media')
        .set('Authorization', `Bearer ${accessToken}`)
        .field('type', MediaType.IMAGE)
        .field('target', MediaTarget.POST)
        .attach('file', testImageBuffer, {
          filename: 'test.png',
          contentType: 'image/png',
        })
        .expect(HttpStatus.CREATED);

      expect(response.body).toEqual(
        expect.objectContaining({
          id: expect.any(String),
          key: expect.stringContaining('image/'),
          bucket: expect.any(String),
          ownerId: userId,
          parentId: null,
          type: MediaType.IMAGE,
          target: MediaTarget.POST,
          variant: MediaVariant.ORIGINAL,
          mimeType: 'image/webp',
          publicUrl: expect.stringContaining('http'),
          hash: expect.any(String),
          createdAt: expect.any(String),
          deletedAt: null,
          refCount: 1,
        }),
      );
      // Check for a correct date
      expect(new Date(response.body.createdAt).getTime).not.toBe(NaN);
    });

    it('should fail with invalid file type', async () => {
      const textBuffer = Buffer.from('This is not an image');

      await request(app.getHttpServer())
        .post('/media')
        .set('Authorization', `Bearer ${accessToken}`)
        .field('type', MediaType.IMAGE)
        .field('target', MediaTarget.POST)
        .attach('file', textBuffer, {
          filename: 'test.txt',
          contentType: 'text/plain',
        })
        .expect(HttpStatus.UNPROCESSABLE_ENTITY);
    });

    it('should fail without authentication', async () => {
      await request(app.getHttpServer())
        .post('/media')
        .field('type', MediaType.IMAGE)
        .field('target', MediaTarget.POST)
        .attach('file', testImageBuffer, {
          filename: 'test.png',
          contentType: 'image/png',
        })
        .expect(HttpStatus.UNAUTHORIZED);
    });

    it('should fail with invalid enum type and target values', async () => {
      await request(app.getHttpServer())
        .post('/media')
        .set('Authorization', `Bearer ${accessToken}`)
        .field('type', 'INVALID_TYPE')
        .field('target', 'INVALID_TARGET')
        .attach('file', testImageBuffer, {
          filename: 'test.png',
          contentType: 'image/png',
        })
        .expect(HttpStatus.BAD_REQUEST);
    });

    it('should fail when file is missing', async () => {
      await request(app.getHttpServer())
        .post('/media')
        .set('Authorization', `Bearer ${accessToken}`)
        .field('type', MediaType.IMAGE)
        .field('target', MediaTarget.POST)
        .attach('file', Buffer.from(''), {
          filename: 'empty.png',
          contentType: 'image/png',
        })
        .expect(HttpStatus.UNPROCESSABLE_ENTITY);
    });

    it('should fail when file exceeds size limit', async () => {
      await request(app.getHttpServer())
        .post('/media')
        .set('Authorization', `Bearer ${accessToken}`)
        .field('type', MediaType.IMAGE)
        .field('target', MediaTarget.POST)
        .attach('file', Buffer.alloc(20 * 1024 * 1024), {
          filename: 'large.png',
          contentType: 'image/png',
        })
        .expect(HttpStatus.UNPROCESSABLE_ENTITY);
    });

    it('should fail when image dimensions exceed limit', async () => {
      const testLargeImageBuffer = await fs.promises.readFile(
        './data/media/sample_png_500KB.png',
      );
      await request(app.getHttpServer())
        .post('/media')
        .set('Authorization', `Bearer ${accessToken}`)
        .field('type', MediaType.IMAGE)
        .field('target', MediaTarget.USER_AVATAR)
        .attach('file', testLargeImageBuffer, {
          filename: 'test.png',
          contentType: 'image/png',
        })
        .expect(HttpStatus.UNPROCESSABLE_ENTITY);
    });
  });

  describe('GET /media/:id', () => {
    let mediaId: string;

    beforeAll(async () => {
      // Upload a test image first

      const uploadResponse = await request(app.getHttpServer())
        .post('/media')
        .set('Authorization', `Bearer ${accessToken}`)
        .field('type', MediaType.IMAGE)
        .field('target', MediaTarget.POST)
        .attach('file', testImageBuffer, {
          filename: 'test.png',
          contentType: 'image/png',
        });

      mediaId = uploadResponse.body.id;

      // Wait for the variants to be created by the worker process
      await new Promise((resolve) => setTimeout(resolve, 2000));
    });

    it('should get media with variants', async () => {
      const response = await request(app.getHttpServer())
        .get(`/media/${mediaId}`)
        .expect(HttpStatus.OK);

      expect(response.body).toMatchObject({
        id: mediaId,
        key: expect.any(String),
        type: MediaType.IMAGE,
        target: MediaTarget.POST,
        variant: MediaVariant.ORIGINAL,
        publicUrl: expect.any(String),
        children: expect.arrayContaining([
          expect.objectContaining({
            id: expect.any(String),
            key: expect.any(String),
            variant: expect.any(String),
            publicUrl: expect.any(String),
            mimeType: expect.any(String),
            sizeBytes: expect.any(String),
          }),
        ]),
      });
    });

    it('should return 404 for non-existent media', async () => {
      const nonExistentId = 'f22c2a51-60ce-45e3-bc1b-f835756e1a78';

      await request(app.getHttpServer())
        .get(`/media/${nonExistentId}`)
        .expect(HttpStatus.NOT_FOUND);
    });

    it('should return 400 for non-UUID media ID', async () => {
      const invalidId = 'invalid-uuid';

      await request(app.getHttpServer())
        .get(`/media/${invalidId}`)
        .expect(HttpStatus.BAD_REQUEST);
    });
  });

  describe('DELETE /media/:id', () => {
    let mediaId: string;

    beforeEach(async () => {
      // Upload a test image first
      const uploadResponse = await request(app.getHttpServer())
        .post('/media')
        .set('Authorization', `Bearer ${accessToken}`)
        .field('type', MediaType.IMAGE)
        .field('target', MediaTarget.POST)
        .attach('file', testImageBuffer, {
          filename: 'test.png',
          contentType: 'image/png',
        });

      mediaId = uploadResponse.body.id;
    });

    it('should delete media successfully as owner', async () => {
      await request(app.getHttpServer())
        .delete(`/media/${mediaId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(HttpStatus.OK);
    });

    it('should fail to delete media as non-owner', async () => {
      const loginResponse = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: userData[1].email,
          password: 'password',
        });
      const nonOwnerAccessToken = loginResponse.body.accessToken;

      await request(app.getHttpServer())
        .delete(`/media/${mediaId}`)
        .set('Authorization', `Bearer ${nonOwnerAccessToken}`)
        .expect(HttpStatus.FORBIDDEN);
    });

    it('should fail without authentication', async () => {
      await request(app.getHttpServer())
        .delete(`/media/${mediaId}`)
        .expect(HttpStatus.UNAUTHORIZED);
    });

    it('should return 404 for non-existent media', async () => {
      const nonExistentId = 'f22c2a51-60ce-45e3-bc1b-f835756e1a78';

      await request(app.getHttpServer())
        .delete(`/media/${nonExistentId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(HttpStatus.NOT_FOUND);
    });

    it('should return 400 for non-UUID media ID', async () => {
      const invalidId = 'invalid-uuid';

      await request(app.getHttpServer())
        .delete(`/media/${invalidId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(HttpStatus.BAD_REQUEST);
    });
  });

  describe('GET /media/:id/stream (SSE)', () => {
    let mediaId: string;

    beforeAll(async () => {
      // Upload a test image first
      const uploadResponse = await request(app.getHttpServer())
        .post('/media')
        .set('Authorization', `Bearer ${accessToken}`)
        .field('type', MediaType.IMAGE)
        .field('target', MediaTarget.POST)
        .attach('file', testImageBuffer, {
          filename: 'test.png',
          contentType: 'image/png',
        });

      mediaId = uploadResponse.body.id;
    });

    it('should get the generated variants data via SSE stream', async () => {
      let raw = '';
      const res = await request(app.getHttpServer())
        .get(`/media/${mediaId}/stream`)
        .set('Accept', 'text/event-stream')
        .set('Cache-Control', 'no-cache')
        .buffer(false)
        .parse((res, callback) => {
          res.on('data', (chunk) => {
            raw += chunk;
          });
          res.on('end', () => callback(null, raw));
        });

      const events = parseSse(raw);

      expect(res.status).toBe(HttpStatus.OK);
      expect(res.headers['content-type']).toContain('text/event-stream');
      expect(events.length).toBeGreaterThan(0);
      expect(events[0]).toMatchObject({
        event: 'upload-status',
        id: expect.any(String),
        data: expect.any(String),
      });

      const parsedData = JSON.parse(events[0].data);
      expect(parsedData).toMatchObject({
        status: 'completed',
        ownerId: userId,
        mediaId: mediaId,
        variants: expect.arrayContaining([
          expect.objectContaining({
            key: expect.any(String),
            publicUrl: expect.any(String),
          }),
        ]),
      });
    });

    it('should return error for non-existent media', async () => {
      const nonExistentId = 'f22c2a51-60ce-45e3-bc1b-f835756e1a78';
      let raw = '';

      await request(app.getHttpServer())
        .get(`/media/${nonExistentId}/stream`)
        .set('Accept', 'text/event-stream')
        .set('Cache-Control', 'no-cache')
        .buffer(false)
        .parse((res, callback) => {
          res.on('data', (chunk) => {
            raw += chunk;
          });
          res.on('end', () => callback(null, raw));
        });

      const events = parseSse(raw);

      expect(events[0]).toMatchObject({
        event: 'error',
        id: expect.any(String),
        data: expect.stringContaining('Not Found'),
      });
    });

    it('should return error for non-UUID media ID', async () => {
      const invalidId = 'invalid-uuid';
      let raw = '';

      await request(app.getHttpServer())
        .get(`/media/${invalidId}/stream`)
        .set('Accept', 'text/event-stream')
        .set('Cache-Control', 'no-cache')
        .buffer(false)
        .parse((res, callback) => {
          res.on('data', (chunk) => {
            raw += chunk;
          });
          res.on('end', () => callback(null, raw));
        });

      const events = parseSse(raw);

      expect(events[0]).toMatchObject({
        event: 'error',
        id: expect.any(String),
        data: expect.stringContaining('Validation failed'),
      });
    });
  });
});
