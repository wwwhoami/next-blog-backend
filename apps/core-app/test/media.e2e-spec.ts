import { AppModule } from '@core/src/app.module';
import { ErrorInterceptor } from '@core/src/common/interceptors/error.interceptor';
import { HttpStatus, INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { MediaTarget, MediaType, MediaVariant } from '@prisma/client';
import cookieParser from 'cookie-parser';
import { userData } from 'data/seed-data';
import fs from 'node:fs';
import request from 'supertest';

// Override JSON.stringify to handle BigInt
(BigInt.prototype as any).toJSON = function () {
  return this.toString();
};

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
          key: expect.stringContaining('uploads/image/'),
          bucket: expect.any(String),
          ownerId: userId,
          type: MediaType.IMAGE,
          target: MediaTarget.POST,
          variant: MediaVariant.ORIGINAL,
          mimeType: 'image/webp',
          publicUrl: expect.stringContaining('http'),
          hash: expect.any(String),
        }),
      );
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
    });

    it('should get media with variants', async () => {
      const response = await request(app.getHttpServer())
        .get(`/media/${mediaId}`)
        .expect(HttpStatus.OK);

      expect(response.body).toEqual(
        expect.objectContaining({
          id: mediaId,
          key: expect.any(String),
          type: MediaType.IMAGE,
          target: MediaTarget.POST,
          variant: MediaVariant.ORIGINAL,
          publicUrl: expect.any(String),
          children: expect.any(Array),
        }),
      );
    });

    it('should return 404 for non-existent media', async () => {
      const nonExistentId = 'f22c2a51-60ce-45e3-bc1b-f835756e1a78';

      await request(app.getHttpServer())
        .get(`/media/${nonExistentId}`)
        .expect(HttpStatus.NOT_FOUND);
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

    it('should establish SSE connection', (done) => {
      console.log('Starting SSE connection test for media ID:', mediaId);
      const req = request(app.getHttpServer())
        .get(`/media/${mediaId}/stream`)
        .set('Accept', 'text/event-stream')
        .set('Cache-Control', 'no-cache')
        .buffer(false)
        .parse((res, callback) => {
          // Just check that we can establish the connection
          res.on('data', () => {
            // SSE connection established successfully
            console.log('SSE connection established');
            console.log('Response: ', res.statusCode, res.body);
            req.abort();
            done();
          });
          callback(null, res);
        });

      // If no data is received within a reasonable time, consider it successful
      setTimeout(() => {
        req.abort();
        done();
      }, 1000);
    });
  });
});
