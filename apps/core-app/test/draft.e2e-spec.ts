import { PrismaService } from '@app/prisma';
import { AppModule } from '@core/src/app.module';
import { ErrorInterceptor } from '@core/src/common/interceptors/error.interceptor';
import {
  DRAFT_PROCESSOR_QUEUE,
  DraftPublishJobData,
  VALIDATE_AND_PUBLISH_JOB,
} from '@core/src/draft/constants/draft-processor.constants';
import { DraftMaintenanceService } from '@core/src/draft/draft-maintenance.service';
import { DraftPublicationMediaService } from '@core/src/draft/draft-publication-media.service';
import { DraftPublicationRepository } from '@core/src/draft/draft-publication.repository';
import { DraftProcessor } from '@core/src/draft/draft.processor';
import { DraftRepository } from '@core/src/draft/draft.repository';
import { createDraftJsonBodyMiddleware } from '@core/src/draft/middleware/draft-json-body.middleware';
import { MediaCleanupProcessor } from '@core/src/media/media-cleanup.processor';
import { MediaProcessor } from '@core/src/media/media.processor';
import { MediaRepository } from '@core/src/media/media.repository';
import { MediaService } from '@core/src/media/media.service';
import { drainStorageDeletions } from '@core/src/media/util/drain-storage-deletions';
import { StorageService } from '@core/src/storage/storage.service';
import { getQueueToken } from '@nestjs/bullmq';
import { HttpStatus, INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { Job, Queue, Worker } from 'bullmq';
import cookieParser from 'cookie-parser';
import { userData } from 'data/seed-data';
import { PinoLogger } from 'nestjs-pino';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import {
  DraftStatus,
  MediaTarget,
  MediaType,
  MediaVariant,
  Prisma,
} from 'prisma/generated/client';
import sharp from 'sharp';
import request from 'supertest';

// Prisma media responses contain BigInt fields.
(BigInt.prototype as any).toJSON = function () {
  return this.toString();
};

function gate() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe('Draft (e2e)', () => {
  const attempt = randomUUID();
  let app: INestApplication;
  let accessToken: string;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.use(createDraftJsonBodyMiddleware());
    app.useGlobalPipes(new ValidationPipe({ transform: true }));
    app.useGlobalInterceptors(new ErrorInterceptor());
    app.use(cookieParser());

    await app.init();
    // These cases drive storage outbox draining explicitly.
    await app.get(MediaCleanupProcessor).worker.pause();
    prisma = app.get(PrismaService);

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

  const saveMedia = (
    draftId: string,
    mediaIds: string[],
    coverMediaId?: string | null,
  ) =>
    request(app.getHttpServer())
      .put(`/draft/${draftId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ mediaIds, coverMediaId });

  it('validates draft JSON at the editor character and byte boundaries', async () => {
    const draft = await createDraft({ content: 'a'.repeat(150000) });
    const update = (body: object) =>
      request(app.getHttpServer())
        .put(`/draft/${draft.id}`)
        .auth(accessToken, { type: 'bearer' })
        .send(body);
    const create = (body: object) =>
      request(app.getHttpServer())
        .post('/draft')
        .auth(accessToken, { type: 'bearer' })
        .send(body);
    for (const body of [
      { title: null },
      { excerpt: null },
      { content: null },
      { categoryNames: null },
      { categoryNames: ['a', 'a'] },
    ]) {
      await create(body).expect(400);
      await update(body).expect(400);
    }
    await update({ mediaIds: null }).expect(400);
    await update({ coverMediaId: null })
      .expect(200)
      .expect(({ body }) => expect(body.content.length).toBe(150000));
    const content = '😀'.repeat(2000000);
    await update({ content }).expect(200);
    await update({ content: content + 'x' }).expect(400);
    await create({ content: 'a'.repeat(16 * 1024 * 1024) }).expect(413);
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ content: 'a'.repeat(150000) })
      .expect(413);
  });

  it('recovers a backlog of interrupted claims within one minute', async () => {
    const ownerId = userData[0].id;
    const ids = Array.from({ length: 105 }, () => randomUUID());
    const started = Date.now();
    await prisma.draft.createMany({
      data: ids.map((id) => ({
        id,
        ownerId,
        status: DraftStatus.PUBLISHING,
        publicationAttemptId: randomUUID(),
      })),
    });
    while (Date.now() - started < 59000) {
      const pending = await prisma.draft.count({
        where: { id: { in: ids }, status: DraftStatus.PUBLISHING },
      });
      if (!pending) break;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    expect(
      await prisma.draft.count({
        where: {
          id: { in: ids },
          status: DraftStatus.ACTIVE,
          validationError: { not: null },
          postId: null,
          publicationAttemptId: null,
        },
      }),
    ).toBe(ids.length);
  }, 60000);

  it('recovers a terminal stall and fences delayed callbacks after a new claim', async () => {
    const draft = await createDraft();
    const repo = app.get(DraftRepository);
    const connection = app.get<Queue>(getQueueToken(DRAFT_PROCESSOR_QUEUE)).opts
      .connection;
    const queue = new Queue(randomUUID(), { connection });
    const worker = new Worker(
      queue.name,
      async () => {
        throw new Error('Retryable worker failure');
      },
      {
        connection,
        autorun: false,
        maxStalledCount: 0,
        stalledInterval: 100,
        lockDuration: 100,
      },
    );
    const service = new DraftMaintenanceService(
      app.get(DraftPublicationRepository),
      queue,
    );
    const data = { draftId: draft.id, ownerId: draft.ownerId };
    const id = randomUUID();
    try {
      await app
        .get(DraftPublicationRepository)
        .markPublishing(draft.id, draft.ownerId, id);
      const job = await queue.add(VALIDATE_AND_PUBLISH_JOB, data, {
        jobId: id,
        attempts: 3,
      });
      await worker.getNextJob(randomUUID(), { block: false });
      await new Promise((resolve) => setTimeout(resolve, 250));
      void worker.run();
      for (let i = 0; i < 100 && (await job.getState()) !== 'failed'; i++)
        await new Promise((resolve) => setTimeout(resolve, 50));
      expect(await job.getState()).toBe('failed');
      await service.reconcile();
      const retryId = randomUUID();
      expect(
        await app
          .get(DraftPublicationRepository)
          .markPublishing(draft.id, draft.ownerId, retryId),
      ).toBeTruthy();
      const retry = await queue.add(VALIDATE_AND_PUBLISH_JOB, data, {
        jobId: retryId,
        attempts: 3,
        backoff: 120000,
      });
      for (let i = 0; i < 100 && (await retry.getState()) !== 'delayed'; i++)
        await new Promise((resolve) => setTimeout(resolve, 50));
      expect(await retry.getState()).toBe('delayed');
      const processor = app.get(DraftProcessor);
      await processor.onFailed(job, new Error('stale'));
      await expect(processor.process(job)).rejects.toThrow(
        'no longer publishing',
      );
      await service.reconcile();
      expect(await repo.findById(draft.id)).toMatchObject({
        status: DraftStatus.PUBLISHING,
        publicationAttemptId: retryId,
        validationError: null,
        postId: null,
      });
    } finally {
      await worker.close();
      await queue.obliterate({ force: true });
      await queue.close();
    }
  });

  const createMedia = async (
    ownerId: string,
    overrides: Partial<Prisma.MediaUncheckedCreateInput> = {},
    attachment?: { draftId: string } | { postId: number },
  ) => {
    const key = randomUUID();
    const media = await prisma.media.create({
      data: {
        ownerId,
        key,
        publicUrl: `https://cdn.test/${key}`,
        mimeType: 'image/png',
        bucket: 'test',
        sizeBytes: 1,
        target: MediaTarget.POST,
        type: MediaType.IMAGE,
        ...overrides,
      },
    });
    if (attachment && 'draftId' in attachment)
      await prisma.draftMedia.create({
        data: { ...attachment, mediaId: media.id },
      });
    if (attachment && 'postId' in attachment)
      await prisma.postMedia.create({
        data: { ...attachment, mediaId: media.id },
      });
    return media;
  };

  const loginAs = async (email: string) => {
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: 'password' })
      .expect(HttpStatus.CREATED);
    return login.body.accessToken as string;
  };

  const createManagedMedia = (
    ownerId: string,
    overrides: Partial<Prisma.MediaUncheckedCreateInput> = {},
    attachment?: { draftId: string } | { postId: number },
  ) => {
    const storage = app.get(StorageService);
    const key = `image/${ownerId}/${randomUUID()}.webp`;
    return createMedia(
      ownerId,
      {
        key,
        bucket: storage.bucket,
        publicUrl: storage.buildPublicUrl(key),
        ...overrides,
      },
      attachment,
    );
  };

  const drainStorageFor = async (
    ...objects: { key: string; bucket: string }[]
  ) =>
    drainStorageDeletions(
      app.get(MediaRepository),
      app.get(StorageService),
      await app.resolve(PinoLogger),
      objects.map(({ key, bucket }) => ({ key, bucket })),
    );

  const createTestAccount = async () => {
    const name = randomUUID();
    const image = 'https://example.com/avatar.webp';
    const { body } = await request(app.getHttpServer())
      .post('/auth/sign-up')
      .send({ name, email: `${name}@example.com`, password: 'password', image })
      .expect(HttpStatus.CREATED);
    return { id: body.id as string, token: body.accessToken as string, image };
  };

  it('serves uncategorized articles and preserves the revision URL', async () => {
    const http = request(app.getHttpServer());
    const login = await http
      .post('/auth/login')
      .send({ email: 'admin@admin.com', password: 'password' })
      .expect(201);
    const direct = await http
      .post('/post')
      .auth(login.body.accessToken, { type: 'bearer' })
      .send({
        title: '😀',
        excerpt: 'excerpt',
        content: 'content',
        coverImage: 'https://example.org/cover.webp',
        published: true,
      })
      .expect(201);
    const draft = await createDraft({
      title: '😎',
      content: '😀'.repeat(2000000),
    });
    const cover = await createMedia(draft.ownerId, {}, { draftId: draft.id });
    await saveMedia(draft.id, [cover.id], cover.id).expect(200);
    const publish = async (id: string) => {
      const jobId = randomUUID();
      await app
        .get(DraftPublicationRepository)
        .markPublishing(id, draft.ownerId, jobId);
      await app.get(DraftProcessor).process({
        id: jobId,
        name: VALIDATE_AND_PUBLISH_JOB,
        data: { draftId: id, ownerId: draft.ownerId },
      } as Job<DraftPublishJobData>);
    };
    await publish(draft.id);
    const article = await prisma.post.findUniqueOrThrow({
      where: { title: '😎' },
    });
    expect(article.slug).toBeTruthy();
    expect(article.slug).not.toBe(direct.body.slug);
    for (const post of [article, direct.body])
      await http
        .get(`/post/article/${post.slug}`)
        .expect(200)
        .expect(({ body }) => expect(body.id).toBe(post.id));
    const feed = await http.get('/post').query({ take: 100 }).expect(200);
    expect(
      feed.body.filter((p: { id: number }) => p.id === article.id),
    ).toEqual([expect.objectContaining({ categories: [] })]);
    const filtered = await http
      .get('/post')
      .query({ take: 100, category: 'python' })
      .expect(200);
    expect(filtered.body).not.toContainEqual(
      expect.objectContaining({ id: article.id }),
    );
    const getDraft = (id: string) =>
      http.get(`/draft/${id}`).auth(accessToken, { type: 'bearer' });
    await getDraft(draft.id)
      .expect(200)
      .expect(({ body }) => expect(body.revisionMode).toBe('NEW'));
    const revision = await http
      .post(`/post/${article.id}/draft`)
      .auth(accessToken, { type: 'bearer' })
      .expect(201);
    await http
      .put(`/draft/${revision.body.id}`)
      .auth(accessToken, { type: 'bearer' })
      .send({ title: randomUUID(), content: 'revision' })
      .expect(200);
    await publish(revision.body.id);
    await http
      .get(`/post/article/${article.slug}`)
      .expect(200)
      .expect(({ body }) => expect(body.content).toBe('revision'));
    await prisma.draft.update({
      where: { id: revision.body.id },
      data: { sourceVersion: 0 },
    });
    await prisma.post.delete({ where: { id: article.id } });
    await getDraft(revision.body.id)
      .expect(200)
      .expect(({ body }) => expect(body.revisionMode).toBe('REVISION'));
    await prisma.post.delete({ where: { id: direct.body.id } });
  });

  it('attaches pasted variant URLs and detaches editable draft families without deleting files', async () => {
    const ownerId = userData[0].id;
    const original = await createManagedMedia(ownerId);
    const variant = await createManagedMedia(ownerId, {
      parentId: original.id,
      variant: MediaVariant.THUMBNAIL,
    });
    const foreign = await createManagedMedia(userData[1].id);
    const avatar = await createManagedMedia(ownerId, {
      target: MediaTarget.USER_AVATAR,
    });
    const draft = await createDraft({
      content: `![variant](${variant.publicUrl}?v=1)`,
    });
    expect(draft.effectiveMedia).toEqual([
      expect.objectContaining({ id: original.id }),
    ]);

    const save = (data: object) =>
      request(app.getHttpServer())
        .put(`/draft/${draft.id}`)
        .auth(accessToken, { type: 'bearer' })
        .send(data);
    for (const unusable of [foreign, avatar]) {
      await save({ content: `![invalid](${unusable.publicUrl})` }).expect(
        HttpStatus.BAD_REQUEST,
      );
    }
    await save({ mediaIds: [], coverMediaId: original.id }).expect(
      HttpStatus.OK,
    );
    await save({
      title: 'Edited draft',
      coverMedia: { disconnect: true },
      draftMedia: { deleteMany: {} },
    }).expect(HttpStatus.OK);
    await expect(
      prisma.draft.findUniqueOrThrow({
        where: { id: draft.id },
        include: { draftMedia: true },
      }),
    ).resolves.toMatchObject({
      title: 'Edited draft',
      coverMediaId: original.id,
      draftMedia: [{ mediaId: original.id }],
    });
    const references = await request(app.getHttpServer())
      .get(`/media/${original.id}/references`)
      .auth(accessToken, { type: 'bearer' })
      .expect(HttpStatus.OK);
    expect(references.body.drafts).toContainEqual({
      id: draft.id,
      status: DraftStatus.ACTIVE,
    });
    const remove = (force: boolean) =>
      request(app.getHttpServer())
        .delete(`/media/${original.id}?force=${force}`)
        .auth(accessToken, { type: 'bearer' });
    await remove(false).expect(HttpStatus.CONFLICT);
    await save({ content: 'Detached', mediaIds: [] }).expect(HttpStatus.OK);
    await expect(
      prisma.draft.findUnique({
        where: { id: draft.id },
        include: { draftMedia: true },
      }),
    ).resolves.toMatchObject({ coverMediaId: null, draftMedia: [] });
    await expect(
      prisma.media.findUnique({
        where: { id: original.id },
        include: { variants: true },
      }),
    ).resolves.toMatchObject({ variants: [{ id: variant.id }] });
    await expect(
      prisma.mediaStorageDeletion.count({
        where: { key: { in: [original.key, variant.key] } },
      }),
    ).resolves.toBe(0);

    await save({
      content: draft.content,
      mediaIds: [original.id],
      coverMediaId: original.id,
    }).expect(HttpStatus.OK);
    await prisma.draft.update({
      where: { id: draft.id },
      data: { status: DraftStatus.ARCHIVED },
    });
    const conflict = await remove(false).expect(HttpStatus.CONFLICT);
    expect(conflict.body).toMatchObject({
      code: 'MEDIA_IN_USE',
      canForce: true,
    });
    const adminToken = await loginAs(userData[4].email);
    await request(app.getHttpServer())
      .delete(`/media/${original.id}?force=true`)
      .auth(adminToken, { type: 'bearer' })
      .expect(HttpStatus.OK);
    await expect(
      prisma.draft.findUnique({
        where: { id: draft.id },
        include: { draftMedia: true },
      }),
    ).resolves.toMatchObject({
      coverMediaId: null,
      draftMedia: [],
      content: draft.content,
    });
    await expect(
      prisma.media.count({ where: { id: { in: [original.id, variant.id] } } }),
    ).resolves.toBe(0);
  });

  it('serializes deletion with a new draft reference', async () => {
    const draft = await createDraft();
    const media = await createManagedMedia(draft.ownerId);
    const [save, remove] = await Promise.all([
      request(app.getHttpServer())
        .put(`/draft/${draft.id}`)
        .auth(accessToken, { type: 'bearer' })
        .send({
          content: `![image](${media.publicUrl})`,
          coverMediaId: media.id,
        }),
      request(app.getHttpServer())
        .delete(`/media/${media.id}`)
        .auth(accessToken, { type: 'bearer' }),
    ]);
    expect([HttpStatus.OK, HttpStatus.BAD_REQUEST]).toContain(save.status);
    expect(remove.status).toBe(
      save.status === HttpStatus.OK ? HttpStatus.CONFLICT : HttpStatus.OK,
    );
    await expect(
      prisma.draft.findUnique({
        where: { id: draft.id },
        include: { draftMedia: true },
      }),
    ).resolves.toMatchObject(
      save.status === HttpStatus.OK
        ? { coverMediaId: media.id, draftMedia: [{ mediaId: media.id }] }
        : { coverMediaId: null, draftMedia: [] },
    );
  });

  it('tracks selected avatars and serializes profile selection with confirmed deletion', async () => {
    const owner = await createTestAccount();
    const createdAt = new Date(0);
    const cutoff = new Date('2001-01-01');
    const avatar = await createManagedMedia(owner.id, {
      target: MediaTarget.USER_AVATAR,
      createdAt,
    });
    const variant = await createManagedMedia(owner.id, {
      target: MediaTarget.USER_AVATAR,
      parentId: avatar.id,
      variant: MediaVariant.THUMBNAIL,
    });
    const foreign = await createManagedMedia(userData[1].id, {
      target: MediaTarget.USER_AVATAR,
    });
    const profile = (image: string | null) =>
      request(app.getHttpServer())
        .patch('/auth/profile')
        .auth(owner.token, { type: 'bearer' })
        .send({ image });
    const remove = (id: string, force: boolean) =>
      request(app.getHttpServer())
        .delete(`/media/${id}?force=${force}`)
        .auth(owner.token, { type: 'bearer' });

    try {
      await profile(foreign.publicUrl).expect(HttpStatus.BAD_REQUEST);
      await profile(variant.publicUrl).expect(HttpStatus.OK);
      const user = () => prisma.user.findUnique({ where: { id: owner.id } });
      await expect(user()).resolves.toMatchObject({
        image: variant.publicUrl,
        avatarMediaId: avatar.id,
      });
      const repo = app.get(MediaRepository);
      await expect(
        repo.findUnattachedBefore(cutoff),
      ).resolves.not.toContainEqual({ id: avatar.id });
      await expect(
        repo.deleteUnattachedBefore(avatar.id, cutoff),
      ).resolves.toBe(false);
      const replacement = await createManagedMedia(owner.id, {
        target: MediaTarget.USER_AVATAR,
      });
      await profile(replacement.publicUrl).expect(HttpStatus.OK);
      await expect(repo.findUnattachedBefore(cutoff)).resolves.toContainEqual({
        id: avatar.id,
      });
      await expect(
        repo.deleteUnattachedBefore(avatar.id, cutoff),
      ).resolves.toBe(true);
      await expect(
        prisma.media.count({ where: { id: { in: [avatar.id, variant.id] } } }),
      ).resolves.toBe(0);

      await expect(user()).resolves.toMatchObject({
        image: replacement.publicUrl,
        avatarMediaId: replacement.id,
      });
      const conflict = await remove(replacement.id, false).expect(
        HttpStatus.CONFLICT,
      );
      expect(conflict.body).toMatchObject({
        code: 'MEDIA_IN_USE',
        canForce: true,
      });
      await expect(user()).resolves.toMatchObject({
        image: replacement.publicUrl,
        avatarMediaId: replacement.id,
      });
      await remove(replacement.id, true).expect(HttpStatus.OK);
      await expect(user()).resolves.toMatchObject({
        image: null,
        avatarMediaId: null,
      });

      const concurrent = await createManagedMedia(owner.id, {
        target: MediaTarget.USER_AVATAR,
      });
      const [selected] = await Promise.all([
        profile(concurrent.publicUrl),
        remove(concurrent.id, true).expect(HttpStatus.OK),
      ]);
      expect([HttpStatus.OK, HttpStatus.BAD_REQUEST]).toContain(
        selected.status,
      );
      await expect(user()).resolves.toMatchObject({
        image: null,
        avatarMediaId: null,
      });
      await profile(owner.image).expect(HttpStatus.OK);
      await expect(user()).resolves.toMatchObject({
        image: owner.image,
        avatarMediaId: null,
      });
    } finally {
      await prisma.user.delete({ where: { id: owner.id } });
    }
  });

  it('records managed trusted post images and retries their confirmed storage deletion after commit', async () => {
    const admin = userData[4];
    const adminToken = await loginAs(admin.email);
    const original = await createManagedMedia(admin.id);
    const variant = await createManagedMedia(admin.id, {
      parentId: original.id,
      variant: MediaVariant.THUMBNAIL,
    });
    const foreign = await createManagedMedia(userData[0].id);
    const payload = {
      title: randomUUID(),
      excerpt: 'Trusted',
      postMedia: { createMany: { data: [{ mediaId: foreign.id }] } },
      published: true,
    };

    const post = (coverImage: string, content: string) =>
      request(app.getHttpServer())
        .post('/post')
        .auth(adminToken, { type: 'bearer' })
        .send({ ...payload, coverImage, content });
    await post(foreign.publicUrl, 'text').expect(HttpStatus.BAD_REQUEST);

    const html = `<img alt="a > b" src="${variant.publicUrl}">`;
    const externalCover = 'https://example.com/cover.webp';
    await post(externalCover, html).expect(HttpStatus.BAD_REQUEST);

    await expect(
      prisma.post.findUnique({ where: { title: payload.title } }),
    ).resolves.toBeNull();

    const fenced = `\`\`\`markdown\n${html}\n\`\`\``;
    const example = await post(externalCover, fenced).expect(
      HttpStatus.CREATED,
    );

    expect(example.body.content).toBe(fenced);
    await expect(
      prisma.postMedia.count({ where: { postId: example.body.id } }),
    ).resolves.toBe(0);

    payload.title = randomUUID();
    const content = `![variant][image]\n\n[image]: ${variant.publicUrl}`;
    const saved = await post(externalCover, content).expect(HttpStatus.CREATED);

    await expect(
      prisma.postMedia.findMany({ where: { postId: saved.body.id } }),
    ).resolves.toEqual([{ postId: saved.body.id, mediaId: original.id }]);

    const remove = (force: boolean) =>
      request(app.getHttpServer())
        .delete(`/media/${original.id}?force=${force}`)
        .auth(adminToken, { type: 'bearer' });
    await remove(false).expect(HttpStatus.CONFLICT);

    const storage = app.get(StorageService);
    const removeObject = storage.deleteObject.bind(storage);
    let failOriginal = true;
    const deleteObject = jest
      .spyOn(storage, 'deleteObject')
      .mockImplementation(async (key, bucket) => {
        if (key === original.key && failOriginal)
          throw new Error('Storage unavailable');
        return removeObject(key, bucket);
      });

    try {
      await remove(true).expect(HttpStatus.OK);
      await expect(
        prisma.post.findUnique({ where: { id: saved.body.id } }),
      ).resolves.toMatchObject({ content, coverImage: externalCover });
      await expect(
        prisma.mediaStorageDeletion.findFirst({ where: { key: original.key } }),
      ).resolves.toMatchObject({ key: original.key });
      failOriginal = false;
      await prisma.mediaStorageDeletion.updateMany({
        where: { key: original.key },
        data: { nextAttemptAt: new Date(0) },
      });
      await drainStorageFor(original, variant);

      await expect(
        prisma.mediaStorageDeletion.count({
          where: { key: { in: [original.key, variant.key] } },
        }),
      ).resolves.toBe(0);
      expect(deleteObject).toHaveBeenCalledWith(variant.key, variant.bucket);
    } finally {
      deleteObject.mockRestore();
    }
  });

  it('opens a repair revision after confirmed deletion and requires missing images to be replaced', async () => {
    const ownerId = userData[0].id;
    const post = await prisma.post.create({
      data: {
        authorId: ownerId,
        title: randomUUID(),
        slug: randomUUID(),
        content: 'post',
        excerpt: 'post',
        coverImage: '',
        published: true,
      },
    });
    const original = await createManagedMedia(ownerId, {}, { postId: post.id });
    const variant = await createManagedMedia(ownerId, {
      parentId: original.id,
      variant: MediaVariant.THUMBNAIL,
    });
    const brokenContent = `![deleted](${variant.publicUrl})`;
    const source = await prisma.post.update({
      where: { id: post.id },
      data: { coverImage: variant.publicUrl, content: brokenContent },
    });
    await request(app.getHttpServer())
      .delete(`/media/${original.id}?force=true`)
      .auth(accessToken, { type: 'bearer' })
      .expect(HttpStatus.OK);
    const { body: repair } = await request(app.getHttpServer())
      .post(`/post/${post.id}/draft`)
      .auth(accessToken, { type: 'bearer' })
      .expect(HttpStatus.CREATED);
    expect(repair).toMatchObject({
      content: brokenContent,
      coverMediaId: null,
      effectiveMedia: [],
    });

    const processor = app.get(DraftProcessor);
    const publish = async () => {
      await app
        .get(DraftPublicationRepository)
        .markPublishing(repair.id, ownerId, attempt);
      return processor.process({
        id: attempt,
        name: VALIDATE_AND_PUBLISH_JOB,
        data: { draftId: repair.id, ownerId },
      } as Job<DraftPublishJobData>);
    };
    await expect(publish()).rejects.toThrow(
      'A cover image attached to the draft is required',
    );
    const replacement = await createManagedMedia(
      ownerId,
      {},
      { draftId: repair.id },
    );
    await request(app.getHttpServer())
      .put(`/draft/${repair.id}`)
      .auth(accessToken, { type: 'bearer' })
      .send({ coverMediaId: replacement.id })
      .expect(HttpStatus.OK);
    await expect(publish()).rejects.toThrow('Image URL is not attached media');
    await expect(
      prisma.post.findUnique({ where: { id: post.id } }),
    ).resolves.toEqual(source);

    const content = `![replacement](${replacement.publicUrl})`;
    await request(app.getHttpServer())
      .put(`/draft/${repair.id}`)
      .auth(accessToken, { type: 'bearer' })
      .send({
        content,
        mediaIds: [replacement.id],
        coverMediaId: replacement.id,
      })
      .expect(HttpStatus.OK);
    await expect(publish()).resolves.toMatchObject({
      id: post.id,
      content,
      coverImage: replacement.publicUrl,
    });
  });

  it('publishes protocol-relative managed variants and rejects foreign or external ones', async () => {
    const ownerId = userData[0].id;
    const cover = await createManagedMedia(ownerId);
    const foreign = await createManagedMedia(userData[1].id);
    const variant = (parentId: string, ownerId: string) =>
      createManagedMedia(ownerId, {
        parentId,
        variant: MediaVariant.THUMBNAIL,
      });
    const [ownedVariant, foreignVariant] = await Promise.all([
      variant(cover.id, ownerId),
      variant(foreign.id, foreign.ownerId),
    ]);
    const relative = (url: string) => url.replace(/^https?:/, '');
    const publish = async (id: string) => {
      await app
        .get(DraftPublicationRepository)
        .markPublishing(id, ownerId, attempt);
      return app.get(DraftProcessor).process({
        id: attempt,
        name: VALIDATE_AND_PUBLISH_JOB,
        data: { draftId: id, ownerId },
      } as Job<DraftPublishJobData>);
    };
    const content = `![owned](${relative(ownedVariant.publicUrl)})`;
    const draft = await createDraft({ title: randomUUID(), content });
    await saveMedia(draft.id, [cover.id], cover.id).expect(HttpStatus.OK);
    for (const [url, message] of [
      [relative(foreignVariant.publicUrl), 'Image URL is not attached media'],
      ['//images.example.org/external.webp', 'Invalid image URL in Markdown'],
    ]) {
      // Simulate saved content that predates managed-image validation.
      await prisma.draft.update({
        where: { id: draft.id },
        data: { content: `![invalid](${url})` },
      });
      await expect(publish(draft.id)).rejects.toThrow(message);
    }
    await request(app.getHttpServer())
      .put(`/draft/${draft.id}`)
      .auth(accessToken, { type: 'bearer' })
      .send({ content })
      .expect(HttpStatus.OK);
    await expect(publish(draft.id)).resolves.toMatchObject({
      content,
      coverImage: cover.publicUrl,
    });
  });

  it('shares an original across simultaneous saves and preserves archived links', async () => {
    const [first, second, archive] = await Promise.all([
      createDraft(),
      createDraft(),
      createDraft(),
    ]);
    const asset = await createMedia(first.ownerId);
    await prisma.draft.update({
      where: { id: archive.id },
      data: {
        status: DraftStatus.ARCHIVED,
        draftMedia: { create: { mediaId: asset.id } },
      },
    });

    const results = await Promise.all([
      saveMedia(first.id, [asset.id]),
      saveMedia(second.id, [asset.id]),
    ]);
    expect(results.map(({ status }) => status)).toEqual([
      HttpStatus.OK,
      HttpStatus.OK,
    ]);
    const links = await prisma.draftMedia.findMany({
      where: { mediaId: asset.id },
    });
    expect(links.map(({ draftId }) => draftId).sort()).toEqual(
      [archive.id, first.id, second.id].sort(),
    );
  });

  it('shares post media during concurrent revision creation and draft save', async () => {
    const draft = await createDraft();
    const slug = randomUUID();
    const post = await prisma.post.create({
      data: {
        title: slug,
        slug,
        content: '# Post',
        excerpt: 'Post',
        coverImage: '',
        authorId: draft.ownerId,
      },
    });
    const asset = await createMedia(draft.ownerId, {}, { postId: post.id });

    const [save, revision] = await Promise.all([
      saveMedia(draft.id, [asset.id]),
      request(app.getHttpServer())
        .post(`/post/${post.id}/draft`)
        .set('Authorization', `Bearer ${accessToken}`),
    ]);

    expect([save.status, revision.status]).toEqual([
      HttpStatus.OK,
      HttpStatus.CREATED,
    ]);
    const links = await prisma.draftMedia.findMany({
      where: { mediaId: asset.id },
    });
    expect(links.map(({ draftId }) => draftId).sort()).toEqual(
      [revision.body.id, draft.id].sort(),
    );
  });

  it('preserves a retained cover, clears explicit null, and clears a removed cover', async () => {
    const draft = await createDraft();
    const asset = await createMedia(draft.ownerId);
    await saveMedia(draft.id, [asset.id], asset.id).expect(HttpStatus.OK);
    expect(
      (await saveMedia(draft.id, [asset.id]).expect(HttpStatus.OK)).body
        .coverMediaId,
    ).toBe(asset.id);
    const cleared = await saveMedia(draft.id, [asset.id], null).expect(
      HttpStatus.OK,
    );
    expect(cleared.body).toMatchObject({
      coverMediaId: null,
      media: [expect.objectContaining({ id: asset.id })],
    });
    await saveMedia(draft.id, [asset.id], asset.id).expect(HttpStatus.OK);
    expect(
      (await saveMedia(draft.id, []).expect(HttpStatus.OK)).body.coverMediaId,
    ).toBeNull();
  });

  it('publishes a revision once across two workers and leaves a stale revision intact', async () => {
    const draft = await createDraft();
    const post = await prisma.post.create({
      data: {
        authorId: draft.ownerId,
        title: randomUUID(),
        slug: randomUUID(),
        content: 'published content',
        excerpt: 'published excerpt',
        coverImage: 'https://cdn.test/old',
        version: 2,
      },
    });
    const oldMedia = await createMedia(draft.ownerId, {}, { postId: post.id });
    const cover = await createMedia(draft.ownerId);
    const variant = await createMedia(draft.ownerId, {
      parentId: cover.id,
      variant: MediaVariant.THUMBNAIL,
    });
    const category = await prisma.category.findFirstOrThrow();
    const prepareRevision = (id: string, mediaId: string, title: string) =>
      prisma.draft.update({
        where: { id },
        data: {
          title,
          postId: post.id,
          sourceVersion: 2,
          publicationAttemptId: attempt,
          status: DraftStatus.PUBLISHING,
          coverMediaId: mediaId,
          categoryNames: [category.name],
          draftMedia: { create: { mediaId } },
        },
      });
    await prepareRevision(draft.id, cover.id, randomUUID());
    const job = (draftId: string) =>
      ({
        id: attempt,
        name: VALIDATE_AND_PUBLISH_JOB,
        data: { draftId, ownerId: draft.ownerId },
      }) as Job<DraftPublishJobData>;
    const state = () =>
      prisma.post.findUniqueOrThrow({
        where: { id: post.id },
        include: { categories: true, postMedia: true },
      });
    const worker = app.get(DraftProcessor);
    const secondWorker = new DraftProcessor(
      app.get(DraftRepository),
      app.get(DraftPublicationRepository),
      app.get(DraftPublicationMediaService),
      app.get(ConfigService),
    );
    const results = await Promise.allSettled([
      worker.process(job(draft.id)),
      secondWorker.process(job(draft.id)),
    ]);
    expect(results.map(({ status }) => status).sort()).toEqual([
      'fulfilled',
      'rejected',
    ]);
    const published = await state();
    expect(published.version).toBe(3);
    expect(published.categories).toEqual([
      { postId: post.id, categoryName: category.name },
    ]);
    expect(published.postMedia).toEqual([
      { postId: post.id, mediaId: cover.id },
    ]);
    await expect(
      prisma.media.findUnique({ where: { id: oldMedia.id } }),
    ).resolves.toBeTruthy();
    await expect(
      prisma.media.findUnique({ where: { id: variant.id } }),
    ).resolves.toMatchObject({ parentId: cover.id });
    await expect(
      prisma.draft.findUnique({ where: { id: draft.id } }),
    ).resolves.toMatchObject({ status: DraftStatus.ARCHIVED });

    const stale = await createDraft();
    const staleCover = await createMedia(stale.ownerId);
    await prepareRevision(stale.id, staleCover.id, randomUUID());
    await expect(worker.process(job(stale.id))).rejects.toThrow(
      'Post changed since this revision was created',
    );
    await expect(state()).resolves.toEqual(published);
    await expect(
      prisma.draft.findUnique({ where: { id: stale.id } }),
    ).resolves.toMatchObject({
      status: DraftStatus.ACTIVE,
      coverMediaId: staleCover.id,
      validationError: 'Post changed since this revision was created',
    });
  });

  it.each([false, true])(
    'blocks deleting a publishing draft cover with force=%s',
    async (force) => {
      const draft = await createDraft();
      const cover = await createMedia(draft.ownerId);
      await prisma.draft.update({
        where: { id: draft.id },
        data: {
          publicationAttemptId: attempt,
          status: DraftStatus.PUBLISHING,
          coverMediaId: cover.id,
          draftMedia: { create: { mediaId: cover.id } },
        },
      });
      const conflict = await request(app.getHttpServer())
        .delete(`/media/${cover.id}?force=${force}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(HttpStatus.CONFLICT);
      expect(conflict.body).toMatchObject({
        code: 'MEDIA_DRAFT_PUBLISHING',
        canForce: false,
      });
      await expect(
        prisma.draft.findUnique({
          where: { id: draft.id },
          include: { draftMedia: true },
        }),
      ).resolves.toMatchObject({
        coverMediaId: cover.id,
        draftMedia: [{ mediaId: cover.id }],
      });
    },
  );

  it('deduplicates concurrent uploads across drafts and publishes their shared image independently', async () => {
    const [first, second] = await Promise.all([
      createDraft({ title: randomUUID() }),
      createDraft({ title: randomUUID() }),
    ]);
    const bytes = await sharp(Buffer.from(randomUUID().slice(0, 12)), {
      raw: { width: 2, height: 2, channels: 3 },
    })
      .png()
      .toBuffer();
    const file = {
      buffer: bytes,
      mimetype: 'image/png',
      size: bytes.length,
    } as Express.Multer.File;
    const mediaService = app.get(MediaService);
    const upload = (ownerId: string, target: MediaTarget, draftId?: string) =>
      mediaService.upload(file, ownerId, {
        type: MediaType.IMAGE,
        target,
        draftId,
      });
    const put = jest.spyOn(app.get(StorageService), 'uploadBuffer');
    try {
      const [original, duplicate, draftless] = await Promise.all([
        upload(first.ownerId, MediaTarget.POST, first.id),
        upload(first.ownerId, MediaTarget.POST, second.id),
        upload(first.ownerId, MediaTarget.POST),
      ]);
      expect([duplicate.id, draftless.id]).toEqual([original.id, original.id]);
      expect(
        put.mock.calls.filter(([, key]) => key === original.key),
      ).toHaveLength(1);
      const isolated = await Promise.all([
        upload(userData[1].id, MediaTarget.POST),
        upload(first.ownerId, MediaTarget.COMMENT),
      ]);
      expect(new Set([original.id, ...isolated.map(({ id }) => id)]).size).toBe(
        3,
      );

      await expect(
        prisma.draftMedia.findMany({
          where: { mediaId: original.id },
          orderBy: { draftId: 'asc' },
        }),
      ).resolves.toEqual(
        [first.id, second.id]
          .sort()
          .map((draftId) =>
            expect.objectContaining({ draftId, mediaId: original.id }),
          ),
      );
      for (const draft of [first, second])
        await request(app.getHttpServer())
          .put(`/draft/${draft.id}`)
          .auth(accessToken, { type: 'bearer' })
          .send({ coverMediaId: original.id })
          .expect(HttpStatus.OK);
      const processor = app.get(DraftProcessor);
      const posts = await Promise.all(
        [first, second].map(async (draft) => {
          await app
            .get(DraftPublicationRepository)
            .markPublishing(draft.id, draft.ownerId, attempt);
          const post = await processor.process({
            id: attempt,
            name: VALIDATE_AND_PUBLISH_JOB,
            data: { draftId: draft.id, ownerId: draft.ownerId },
          } as Job<DraftPublishJobData>);
          if (!post || !('id' in post))
            throw new Error('Expected a published post');
          return post;
        }),
      );

      const references = (token: string, id = original.id) =>
        request(app.getHttpServer())
          .get(`/media/${id}/references`)
          .auth(token, { type: 'bearer' });
      const expectedDrafts = [first.id, second.id]
        .sort()
        .map((id) => ({ id, status: DraftStatus.ARCHIVED }));
      const postIds = posts.map(({ id }) => id).sort((a, b) => a - b);
      const expected = {
        postIds,
        drafts: expectedDrafts,
        commentIds: [],
        avatarUserIds: [],
      };
      expect(
        (await references(accessToken).expect(HttpStatus.OK)).body,
      ).toEqual(expected);
      const adminToken = await loginAs(userData[4].email);
      await references(adminToken).expect(HttpStatus.NOT_FOUND);

      const variant = await createMedia(first.ownerId, {
        parentId: original.id,
        variant: MediaVariant.THUMBNAIL,
      });
      expect(
        (await references(accessToken, variant.id).expect(HttpStatus.OK)).body,
      ).toEqual(expected);
      await expect(
        app
          .get(MediaRepository)
          .deleteUnattachedBefore(original.id, new Date('2100-01-01')),
      ).resolves.toBe(false);
      await request(app.getHttpServer())
        .delete(`/post/${postIds[0]}`)
        .auth(adminToken, { type: 'bearer' })
        .expect(HttpStatus.OK);
      expect(
        (await references(accessToken).expect(HttpStatus.OK)).body,
      ).toEqual({ ...expected, postIds: [postIds[1]] });
      await expect(
        prisma.media.findUnique({ where: { id: variant.id } }),
      ).resolves.toMatchObject({ parentId: original.id });
      await request(app.getHttpServer())
        .delete(`/media/${original.id}?force=true`)
        .auth(accessToken, { type: 'bearer' })
        .expect(HttpStatus.OK);
      await expect(
        prisma.postMedia.count({ where: { mediaId: original.id } }),
      ).resolves.toBe(0);
      await expect(
        prisma.draftMedia.count({ where: { mediaId: original.id } }),
      ).resolves.toBe(0);
      await expect(
        prisma.draft.count({
          where: { id: { in: [first.id, second.id] }, coverMediaId: null },
        }),
      ).resolves.toBe(2);
    } finally {
      put.mockRestore();
    }
  });

  it.each([MediaTarget.COMMENT, MediaTarget.USER_AVATAR])(
    'reuses an already referenced %s upload',
    async (target) => {
      const owner = await createTestAccount();
      const hash = randomUUID().replaceAll('-', '').padEnd(64, '0');
      const original = await createManagedMedia(owner.id, { target, hash });
      let postId: number | undefined;
      try {
        if (target === MediaTarget.COMMENT) {
          const post = await prisma.post.create({
            data: {
              authorId: owner.id,
              title: randomUUID(),
              slug: randomUUID(),
              content: 'post',
              excerpt: 'post',
              coverImage: '',
            },
          });
          postId = post.id;
          await prisma.comment.create({
            data: {
              authorId: owner.id,
              postId,
              content: 'comment',
              commentMedia: { create: { mediaId: original.id, position: 0 } },
            },
          });
        } else {
          await request(app.getHttpServer())
            .patch('/auth/profile')
            .auth(owner.token, { type: 'bearer' })
            .send({ image: original.publicUrl })
            .expect(HttpStatus.OK);
        }

        const repo = app.get(MediaRepository);
        const upload = () => {
          const key = randomUUID();
          return repo.reuseOrCreateUpload(
            owner.id,
            hash,
            original.type,
            target,
            undefined,
            { key, bucket: original.bucket },
            async () => ({
              key,
              bucket: original.bucket,
              ownerId: owner.id,
              hash,
              target,
              type: original.type,
              variant: MediaVariant.ORIGINAL,
              mimeType: original.mimeType,
              sizeBytes: original.sizeBytes,
              publicUrl: app.get(StorageService).buildPublicUrl(key),
            }),
          );
        };
        const fresh = await upload();
        expect(fresh.id).toBe(original.id);
        await expect(upload()).resolves.toMatchObject({ id: fresh.id });
        await expect(repo.findOwnedMedia(owner.id, true)).resolves.toEqual([
          expect.objectContaining({ id: original.id }),
        ]);
      } finally {
        if (postId !== undefined)
          await prisma.post.delete({ where: { id: postId } });
        await prisma.user.delete({ where: { id: owner.id } });
      }
    },
  );

  it('refreshes old revisions on fresh and reused uploads and honors zero retention', async () => {
    const ownerId = userData[0].id;
    const post = await prisma.post.create({
      data: {
        authorId: ownerId,
        title: randomUUID(),
        slug: randomUUID(),
        content: 'body',
        excerpt: 'excerpt',
        coverImage: '',
      },
    });
    const repo = app.get(DraftRepository);
    const revision = await repo.createRevision(ownerId, post.id);
    const draftId = revision!.id;
    const key = randomUUID();
    const hash = randomUUID().replaceAll('-', '').padEnd(64, '0');
    const object = { key, bucket: 'test' };
    const upload = jest.fn(async () => ({
      ...object,
      ownerId,
      hash,
      variant: MediaVariant.ORIGINAL,
      type: MediaType.IMAGE,
      target: MediaTarget.POST,
      mimeType: 'image/png',
      sizeBytes: 1,
      publicUrl: 'https://cdn.test/' + key,
    }));
    try {
      for (let i = 0; i < 2; i++) {
        await prisma.draft.update({
          where: { id: draftId },
          data: { updatedAt: new Date(0) },
        });
        await app
          .get(MediaRepository)
          .reuseOrCreateUpload(
            ownerId,
            hash,
            MediaType.IMAGE,
            MediaTarget.POST,
            draftId,
            object,
            upload,
          );
        await repo.archiveInactiveRevisionsBefore(
          new Date(Date.now() - 86400000),
        );
        expect(await repo.findById(draftId)).toMatchObject({
          status: DraftStatus.ACTIVE,
        });
      }
      expect(upload).toHaveBeenCalledTimes(1);
      const config = new ConfigService({ DRAFT_REVISION_RETENTION_DAYS: 0 });
      await new DraftProcessor(
        repo,
        app.get(DraftPublicationRepository),
        app.get(DraftPublicationMediaService),
        config,
      ).process({
        name: 'cleanup-archived-revisions',
      } as Job);
      expect(await repo.findById(draftId)).toBeNull();
    } finally {
      await prisma.post.delete({ where: { id: post.id } });
    }
  });

  it('refreshes retention on reuse and creates a fresh record after cleanup wins', async () => {
    const draft = await createDraft();
    const repo = app.get(MediaRepository);
    const createdAt = new Date('2000-01-01');
    const cutoff = new Date('2001-01-01');
    const hash = randomUUID().replaceAll('-', '');
    const original = await createMedia(draft.ownerId, { hash, createdAt });
    const key = randomUUID();
    const upload = jest.fn().mockResolvedValue({
      key,
      bucket: 'test',
      ownerId: draft.ownerId,
      hash,
      type: MediaType.IMAGE,
      target: MediaTarget.POST,
      variant: MediaVariant.ORIGINAL,
      mimeType: 'image/webp',
      publicUrl: 'https://cdn.test/' + key,
      sizeBytes: 1,
    });
    const reuse = () =>
      repo.reuseOrCreateUpload(
        draft.ownerId,
        hash,
        MediaType.IMAGE,
        MediaTarget.POST,
        undefined,
        { key, bucket: 'test' },
        upload,
      );

    await expect(repo.findUnattachedBefore(cutoff)).resolves.toContainEqual({
      id: original.id,
    });
    const reused = await reuse();
    expect(reused).toMatchObject({
      id: original.id,
      key: original.key,
      publicUrl: original.publicUrl,
      createdAt,
    });
    expect(reused).not.toHaveProperty('retentionRefreshedAt');
    expect(upload).not.toHaveBeenCalled();
    await expect(
      repo.deleteUnattachedBefore(original.id, cutoff),
    ).resolves.toBe(false);
    await request(app.getHttpServer())
      .get('/media?attached=false')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(HttpStatus.OK)
      .expect(({ body }) => {
        const row = body.find(({ id }: { id: string }) => id === original.id);
        expect(row).toBeDefined();
        expect(row).not.toHaveProperty('retentionRefreshedAt');
      });

    await expect(
      repo.deleteUnattachedBefore(original.id, new Date('2100-01-01')),
    ).resolves.toBe(true);
    const replacement = await reuse();
    expect(replacement.id).not.toBe(original.id);
    expect(replacement.key).toBe(key);
    expect(upload).toHaveBeenCalledTimes(1);
  });

  it('rechecks cleanup candidates and retains attached originals and their variants', async () => {
    const draft = await createDraft();
    const createdAt = new Date('2000-01-01');
    const cutoff = new Date('2001-01-01');
    const retained = await createMedia(draft.ownerId, { createdAt });
    const orphan = await createMedia(draft.ownerId, { createdAt });
    const variant = (parentId: string) =>
      createMedia(draft.ownerId, {
        parentId,
        createdAt,
        variant: MediaVariant.PREVIEW,
      });
    const retainedVariant = await variant(retained.id);
    const orphanVariant = await variant(orphan.id);
    const originalCover = await createMedia(draft.ownerId, { createdAt });
    await prisma.draft.create({
      data: {
        ownerId: draft.ownerId,
        coverMediaId: originalCover.id,
        draftMedia: { create: { mediaId: originalCover.id } },
      },
    });
    const repository = app.get(MediaRepository);

    const candidates = await repository.findUnattachedBefore(cutoff);
    expect(candidates).toEqual(
      expect.arrayContaining([{ id: retained.id }, { id: orphan.id }]),
    );
    expect(candidates).not.toContainEqual({ id: orphanVariant.id });
    for (const { id } of [originalCover]) {
      expect(candidates).not.toContainEqual({ id });
      await expect(repository.deleteUnattachedBefore(id, cutoff)).resolves.toBe(
        false,
      );
    }
    await prisma.draft.update({
      where: { id: draft.id },
      data: {
        status: DraftStatus.ARCHIVED,
        draftMedia: { create: { mediaId: retained.id } },
      },
    });
    await expect(
      repository.findUnattachedBefore(cutoff),
    ).resolves.not.toContainEqual({ id: retained.id });
    await expect(
      repository.deleteUnattachedBefore(retained.id, cutoff),
    ).resolves.toBe(false);
    await expect(
      repository.deleteUnattachedBefore(orphan.id, cutoff),
    ).resolves.toBe(true);
    await expect(
      repository.findUnattachedBefore(cutoff),
    ).resolves.not.toContainEqual({ id: orphan.id });
    const pending = () =>
      repository.findPendingStorageDeletions(
        [orphan, orphanVariant].map(({ key, bucket }) => ({ key, bucket })),
      );
    expect((await pending()).map(({ key }) => key)).toEqual([
      orphan.key,
      orphanVariant.key,
    ]);

    const storage = app.get(StorageService);
    const deletedAfterCommit: string[] = [];
    let failOriginal = true;
    const deleteObject = jest
      .spyOn(storage, 'deleteObject')
      .mockImplementation(async (key) => {
        if (key === orphan.key && failOriginal)
          throw new Error('Storage unavailable');
        if (!(await prisma.media.findUnique({ where: { key } }))) {
          deletedAfterCommit.push(key);
        }
        return { $metadata: {} };
      });
    try {
      await drainStorageFor(orphan, orphanVariant);
      await expect(pending()).resolves.toEqual([]);
      await expect(
        prisma.mediaStorageDeletion.findFirst({ where: { key: orphan.key } }),
      ).resolves.toMatchObject({ key: orphan.key });
      failOriginal = false;
      await prisma.mediaStorageDeletion.updateMany({
        where: { key: orphan.key },
        data: { nextAttemptAt: new Date(0) },
      });
      await drainStorageFor(orphan, orphanVariant);
      await expect(
        prisma.mediaStorageDeletion.count({
          where: { key: { in: [orphan.key, orphanVariant.key] } },
        }),
      ).resolves.toBe(0);
      expect(deletedAfterCommit).toEqual(
        expect.arrayContaining([orphan.key, orphanVariant.key]),
      );
      expect(deleteObject).toHaveBeenCalledWith(
        orphanVariant.key,
        orphanVariant.bucket,
      );
      expect(deleteObject).not.toHaveBeenCalledWith(
        retainedVariant.key,
        retainedVariant.bucket,
      );
      await expect(
        prisma.media.findUnique({ where: { id: retainedVariant.id } }),
      ).resolves.toMatchObject({ parentId: retained.id });
      await expect(
        prisma.media.findUnique({ where: { id: orphanVariant.id } }),
      ).resolves.toBeNull();
    } finally {
      deleteObject.mockRestore();
    }
  });

  it('expires first-publication drafts and preserves live post media and other snapshots', async () => {
    const archived = await createDraft();
    const other = await createDraft();
    const published = await prisma.post.create({
      data: {
        authorId: archived.ownerId,
        title: randomUUID(),
        slug: randomUUID(),
        content: 'post',
        excerpt: 'post',
        coverImage: '',
      },
    });
    const live = await createMedia(
      archived.ownerId,
      {},
      { postId: published.id },
    );
    const removed = await createMedia(archived.ownerId, {
      createdAt: new Date(0),
    });
    await prisma.draft.update({
      where: { id: archived.id },
      data: {
        status: DraftStatus.ARCHIVED,
        postId: published.id,
        archivedAt: new Date(0),
        draftMedia: { create: [{ mediaId: live.id }, { mediaId: removed.id }] },
      },
    });
    await prisma.draftMedia.create({
      data: { draftId: other.id, mediaId: removed.id },
    });
    await app.get(DraftRepository).deleteArchivedBefore(new Date('2001-01-01'));
    await expect(
      prisma.draft.findUnique({ where: { id: archived.id } }),
    ).resolves.toBeNull();
    await expect(
      prisma.postMedia.findMany({ where: { mediaId: live.id } }),
    ).resolves.toEqual([{ postId: published.id, mediaId: live.id }]);
    const repo = app.get(MediaRepository);
    await expect(
      repo.deleteUnattachedBefore(removed.id, new Date()),
    ).resolves.toBe(false);
    await prisma.draftMedia.deleteMany({ where: { draftId: other.id } });
    await expect(
      repo.deleteUnattachedBefore(removed.id, new Date()),
    ).resolves.toBe(true);
  });

  it('preserves an owned managed variant cover when publishing a title-only revision', async () => {
    const draft = await createDraft();
    const post = await prisma.post.create({
      data: {
        authorId: draft.ownerId,
        title: randomUUID(),
        slug: randomUUID(),
        content: 'post',
        excerpt: 'post',
        coverImage: '',
      },
    });
    const original = await createManagedMedia(
      draft.ownerId,
      {},
      { postId: post.id },
    );
    const variant = await createManagedMedia(draft.ownerId, {
      parentId: original.id,
      variant: MediaVariant.THUMBNAIL,
    });
    await prisma.post.update({
      where: { id: post.id },
      data: {
        coverImage: variant.publicUrl,
      },
    });
    const repository = app.get(DraftRepository);
    const revision = await repository.createRevision(draft.ownerId, post.id);
    expect(revision?.coverMediaId).toBe(original.id);
    const title = randomUUID();
    await request(app.getHttpServer())
      .put(`/draft/${revision!.id}`)
      .auth(accessToken, { type: 'bearer' })
      .send({ title })
      .expect(HttpStatus.OK);
    await app
      .get(DraftPublicationRepository)
      .markPublishing(revision!.id, draft.ownerId, attempt);
    await expect(
      app.get(DraftProcessor).process({
        id: attempt,
        name: VALIDATE_AND_PUBLISH_JOB,
        data: { draftId: revision!.id, ownerId: draft.ownerId },
      } as Job<DraftPublishJobData>),
    ).resolves.toMatchObject({
      id: post.id,
      version: 1,
      title,
      coverImage: variant.publicUrl,
      content: post.content,
    });
    await expect(
      prisma.postMedia.findMany({ where: { postId: post.id } }),
    ).resolves.toEqual([{ postId: post.id, mediaId: original.id }]);
  });

  it.each(['cover', 'body'] as const)(
    'rejects a foreign managed %s already attached to the source post',
    async (foreignUse) => {
      const ownerId = userData[0].id;
      const post = await prisma.post.create({
        data: {
          authorId: ownerId,
          title: randomUUID(),
          slug: randomUUID(),
          content: 'post',
          excerpt: 'post',
          coverImage: '',
        },
      });
      const owned = await createManagedMedia(ownerId, {}, { postId: post.id });
      const foreign = await createManagedMedia(
        userData[1].id,
        {},
        { postId: post.id },
      );
      const variant = await createManagedMedia(userData[1].id, {
        parentId: foreign.id,
        variant: MediaVariant.THUMBNAIL,
      });
      const cover = foreignUse === 'cover' ? foreign : owned;
      const source = await prisma.post.update({
        where: { id: post.id },
        data: {
          coverImage:
            foreignUse === 'cover' ? variant.publicUrl : owned.publicUrl,
          content:
            foreignUse === 'body'
              ? `![foreign](${variant.publicUrl})`
              : post.content,
        },
        include: { postMedia: { orderBy: { mediaId: 'asc' } } },
      });
      const repo = app.get(DraftRepository);
      await expect(repo.createRevision(ownerId, post.id)).rejects.toThrow(
        'Managed image is unavailable',
      );

      const revision = await prisma.draft.create({
        data: {
          ownerId,
          postId: post.id,
          sourceVersion: post.version,
          title: randomUUID(),
          excerpt: post.excerpt,
          content: source.content,
          coverMediaId: cover.id,
          publicationAttemptId: attempt,
          status: DraftStatus.PUBLISHING,
          draftMedia: {
            create: [...new Set([cover.id, foreign.id])].map((mediaId) => ({
              mediaId,
            })),
          },
        },
      });
      await expect(
        app.get(DraftProcessor).process({
          id: attempt,
          name: VALIDATE_AND_PUBLISH_JOB,
          data: { draftId: revision.id, ownerId },
        } as Job<DraftPublishJobData>),
      ).rejects.toThrow(
        foreignUse === 'cover'
          ? 'A cover image attached to the draft is required'
          : 'Image URL is not attached media',
      );
      await expect(
        prisma.post.findUnique({
          where: { id: post.id },
          include: { postMedia: { orderBy: { mediaId: 'asc' } } },
        }),
      ).resolves.toEqual(source);
    },
  );

  it.each(['publication', 'explicit deletion', 'scheduled deletion'] as const)(
    'accounts for a variant PUT in flight during %s',
    async (operation) => {
      const draft = await createDraft({ title: randomUUID() });
      const original = await createMedia(draft.ownerId, {
        createdAt: new Date(0),
      });
      const knownVariant = await createMedia(draft.ownerId, {
        parentId: original.id,
        variant: MediaVariant.THUMBNAIL,
        key: `${original.key}__thumb.webp`,
      });
      if (operation === 'publication') {
        await saveMedia(draft.id, [original.id], original.id).expect(
          HttpStatus.OK,
        );
        await app
          .get(DraftPublicationRepository)
          .markPublishing(draft.id, draft.ownerId, attempt);
      }

      const storage = app.get(StorageService);
      const repo = app.get(MediaRepository);
      const started = gate();
      const resume = gate();
      let variantsStarted = 0;
      const downloadFromStorage = storage.downloadToBuffer.bind(storage);
      const uploadToStorage = storage.uploadBuffer.bind(storage);
      const image = await fs.promises.readFile('./data/media/sample_png.png');
      const download = jest
        .spyOn(storage, 'downloadToBuffer')
        .mockImplementation(async (key) =>
          key === original.key ? image : downloadFromStorage(key),
        );
      const put = jest
        .spyOn(storage, 'uploadBuffer')
        .mockImplementation(async (...args) => {
          if (!args[1].startsWith(original.key + '__'))
            return uploadToStorage(...args);
          if (++variantsStarted === 2) started.resolve();
          await resume.promise;
        });
      const remove = jest
        .spyOn(storage, 'deleteObject')
        .mockResolvedValue({ $metadata: {} });
      const processing = app.get(MediaProcessor).process({
        name: 'generateVariants',
        data: { mediaId: original.id },
      } as Job<{ mediaId: string }>);
      let postId: number | undefined;
      try {
        await Promise.race([
          started.promise,
          processing.then(() => {
            throw new Error('Worker finished before both PUTs started');
          }),
        ]);
        const attempts = await prisma.mediaVariantPutIntent.findMany({
          where: { parentId: original.id },
        });
        expect(attempts).toHaveLength(2);

        if (operation === 'publication') {
          const post = await app.get(DraftProcessor).process({
            id: attempt,
            name: VALIDATE_AND_PUBLISH_JOB,
            data: { draftId: draft.id, ownerId: draft.ownerId },
          } as Job<DraftPublishJobData>);
          postId = post && 'id' in post ? post.id : undefined;
          expect(postId).toEqual(expect.any(Number));
        } else {
          if (operation === 'scheduled deletion') {
            await expect(
              repo.deleteUnattachedBefore(original.id, new Date()),
            ).resolves.toBe(true);
          } else {
            await app.get(MediaService).removeReference(original.id);
            expect(remove).toHaveBeenCalledWith(
              knownVariant.key,
              knownVariant.bucket,
            );
          }
          for (const { key, bucket, leaseUntil } of attempts) {
            const deletion = await prisma.mediaStorageDeletion.findFirstOrThrow(
              { where: { key, bucket } },
            );
            expect(deletion.nextAttemptAt.getTime()).toBeGreaterThanOrEqual(
              leaseUntil.getTime() + 60_000,
            );
            expect(remove).not.toHaveBeenCalledWith(key, bucket);
          }
        }

        resume.resolve();
        const completed = await processing;
        const rows = await repo.findVariants(original.id);
        if (operation === 'publication') {
          expect(completed?.variants).toHaveLength(3);
          expect(rows).toHaveLength(3);
          await expect(
            prisma.postMedia.findMany({ where: { postId } }),
          ).resolves.toEqual([{ postId, mediaId: original.id }]);
        } else {
          expect(rows).toHaveLength(0);
          for (const { key, bucket } of attempts) {
            await expect(
              prisma.mediaStorageDeletion.findFirst({ where: { key, bucket } }),
            ).resolves.toMatchObject({ key, bucket });
          }
        }
        await expect(
          prisma.mediaVariantPutIntent.count({
            where: { parentId: original.id },
          }),
        ).resolves.toBe(0);
      } finally {
        resume.resolve();
        await Promise.allSettled([processing]);
        download.mockRestore();
        put.mockRestore();
        remove.mockRestore();
        if (postId) await prisma.post.deleteMany({ where: { id: postId } });
      }
    },
  );

  it('retries a failed variant PUT immediately and fences stale releases', async () => {
    const draft = await createDraft();
    const repo = app.get(MediaRepository);
    const original = await createMedia(draft.ownerId);
    const storage = app.get(StorageService);
    const worker = app.get(MediaProcessor);
    const buffer = await fs.promises.readFile('./data/media/sample_png.png');
    const download = jest
      .spyOn(storage, 'downloadToBuffer')
      .mockResolvedValue(buffer);
    const put = jest
      .spyOn(storage, 'uploadBuffer')
      .mockResolvedValue(undefined);
    const key = `${original.key}__thumb.webp`;
    let puts = 0;
    put.mockImplementation(async (_buffer, putKey) => {
      if (putKey === key && ++puts === 1) throw new Error('Variant PUT failed');
    });
    const job = {
      name: 'generateVariants',
      data: { mediaId: original.id },
    } as Job<{ mediaId: string }>;
    try {
      await expect(worker.process(job)).rejects.toThrow('Variant PUT failed');
      const failed = await prisma.mediaVariantPutIntent.findUniqueOrThrow({
        where: { key },
      });
      expect(failed.released).toBe(true);
      expect(failed.leaseUntil.getTime()).toBeGreaterThan(Date.now());
      await expect(repo.findVariants(original.id)).resolves.toHaveLength(2);
      await expect(worker.process(job)).resolves.toMatchObject({
        variants: [expect.any(Object), expect.any(Object), expect.any(Object)],
      });
      expect(puts).toBe(2);

      const other = await createMedia(draft.ownerId);
      const otherKey = `${other.key}__thumb.webp`;
      const old = (await repo.beginVariantPut(
        other.id,
        otherKey,
        other.bucket,
        MediaVariant.THUMBNAIL,
      ))!;
      await repo.releaseVariantPut(old);
      const replacement = (await repo.beginVariantPut(
        other.id,
        otherKey,
        other.bucket,
        MediaVariant.THUMBNAIL,
      ))!;
      await repo.releaseVariantPut(old);
      await expect(
        prisma.mediaVariantPutIntent.findUnique({ where: { key: otherKey } }),
      ).resolves.toMatchObject({ token: replacement.token, released: false });
      await repo.releaseVariantPut(replacement);
      await repo.removeReference(other.id);
      const deletion = await prisma.mediaStorageDeletion.findFirstOrThrow({
        where: { key: otherKey },
      });
      expect(deletion.nextAttemptAt.getTime()).toBeGreaterThanOrEqual(
        replacement.leaseUntil.getTime() + 60_000,
      );
    } finally {
      download.mockRestore();
      put.mockRestore();
    }
  });

  it('recovers interrupted variant PUTs whose original disappeared', async () => {
    const draft = await createDraft();
    const original = await createMedia(draft.ownerId);
    const repo = app.get(MediaRepository);
    const key = `${original.key}__thumb.webp`;
    const attempt = await repo.beginVariantPut(
      original.id,
      key,
      original.bucket,
      MediaVariant.THUMBNAIL,
    );
    expect(attempt).not.toBeNull();
    await expect(
      repo.beginVariantPut(
        original.id,
        key,
        original.bucket,
        MediaVariant.THUMBNAIL,
      ),
    ).rejects.toThrow('already in progress');
    await prisma.mediaVariantPutIntent.update({
      where: { key },
      data: { leaseUntil: new Date(0) },
    });
    const replacement = await repo.beginVariantPut(
      original.id,
      key,
      original.bucket,
      MediaVariant.THUMBNAIL,
    );
    expect(replacement?.token).not.toBe(attempt?.token);
    await expect(
      repo.finishVariantPut(attempt!, {
        mimeType: 'image/webp',
        sizeBytes: 1,
        publicUrl: original.publicUrl,
        variant: MediaVariant.THUMBNAIL,
      }),
    ).rejects.toThrow('lease was replaced');

    await prisma.media.delete({ where: { id: original.id } });
    await app
      .get(MediaCleanupProcessor)
      .process({ name: 'drainStorage' } as Job);
    await expect(
      prisma.mediaVariantPutIntent.findUnique({ where: { key } }),
    ).resolves.toBeNull();
    const deletion = await prisma.mediaStorageDeletion.findFirstOrThrow({
      where: { key },
    });
    expect(deletion.nextAttemptAt.getTime()).toBeGreaterThanOrEqual(
      replacement!.leaseUntil.getTime() + 60_000,
    );
  });

  it('allows draft saves during a PUT and fences finalization once publication begins', async () => {
    const draft = await createDraft();
    const repo = app.get(MediaRepository);
    const object = { key: randomUUID(), bucket: 'test' };
    const hash = randomUUID().replaceAll('-', '');
    const started = gate();
    const unpause = gate();
    const pending = repo.reuseOrCreateUpload(
      draft.ownerId,
      hash,
      MediaType.IMAGE,
      MediaTarget.POST,
      draft.id,
      object,
      async () => {
        started.resolve();
        await unpause.promise;
        return {
          ...object,
          ownerId: draft.ownerId,
          hash,
          type: MediaType.IMAGE,
          target: MediaTarget.POST,
          variant: MediaVariant.ORIGINAL,
          mimeType: 'image/webp',
          publicUrl: 'https://cdn.test/' + object.key,
          sizeBytes: 1,
        };
      },
    );
    const rejected = expect(pending).rejects.toThrow('Draft not found');
    await started.promise;
    try {
      await saveMedia(draft.id, []).expect(HttpStatus.OK);
      await app
        .get(DraftPublicationRepository)
        .markPublishing(draft.id, draft.ownerId, attempt);
    } finally {
      unpause.resolve();
    }
    await rejected;
    await expect(
      prisma.media.findUnique({ where: { key: object.key } }),
    ).resolves.toBeNull();
    await prisma.mediaUploadReservation.update({
      where: { key: object.key },
      data: { expiresAt: new Date(0) },
    });
    await repo.expireUploadReservations();
    await expect(
      prisma.mediaStorageDeletion.findFirst({ where: object }),
    ).resolves.toMatchObject(object);
  });

  it('takes over an expired upload without letting the old request finalize', async () => {
    const draft = await createDraft();
    const repo = app.get(MediaRepository);
    const hash = randomUUID().replaceAll('-', '');
    const old = { key: randomUUID(), bucket: 'test' };
    const replacement = { key: randomUUID(), bucket: 'test' };
    const started = gate();
    const unpause = gate();
    const data = (object: typeof old) => ({
      ...object,
      ownerId: draft.ownerId,
      hash,
      type: MediaType.IMAGE,
      target: MediaTarget.POST,
      variant: MediaVariant.ORIGINAL,
      mimeType: 'image/webp',
      publicUrl: 'https://cdn.test/' + object.key,
      sizeBytes: 1,
    });
    const oldUpload = repo.reuseOrCreateUpload(
      draft.ownerId,
      hash,
      MediaType.IMAGE,
      MediaTarget.POST,
      undefined,
      old,
      async () => {
        started.resolve();
        await unpause.promise;
        return data(old);
      },
    );
    const rejected = expect(oldUpload).rejects.toThrow('Media upload is busy');
    await started.promise;
    try {
      await prisma.mediaUploadReservation.update({
        where: { key: old.key },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      await expect(
        repo.reuseOrCreateUpload(
          draft.ownerId,
          hash,
          MediaType.IMAGE,
          MediaTarget.POST,
          undefined,
          replacement,
          () => Promise.resolve(data(replacement)),
        ),
      ).resolves.toMatchObject(replacement);
    } finally {
      unpause.resolve();
    }
    await rejected;
    await expect(
      prisma.media.findUnique({ where: { key: old.key } }),
    ).resolves.toBeNull();
    const deletion = await prisma.mediaStorageDeletion.findFirstOrThrow({
      where: old,
    });
    expect(deletion.nextAttemptAt.getTime()).toBeGreaterThan(Date.now());
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
    const cover = await createMedia(createResponse.body.ownerId);
    await saveMedia(id, [cover.id], cover.id).expect(HttpStatus.OK);
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
      .send({
        content: `![Uploaded after save](${mediaResponse.body.publicUrl})`,
      })
      .expect(HttpStatus.OK)
      .expect(({ body }) => {
        expect(
          body.effectiveMedia.map(({ id }: { id: string }) => id).sort(),
        ).toEqual([cover.id, mediaResponse.body.id].sort());
      });

    try {
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
          await request(app.getHttpServer())
            .get(`/post/article/${response.body.post.slug}`)
            .expect(HttpStatus.OK)
            .expect(({ body }) =>
              expect(body).toMatchObject({ id: response.body.postId, title }),
            );
          const attached = await prisma.postMedia.findMany({
            where: { postId: response.body.postId },
          });
          expect(attached.map(({ mediaId }) => mediaId).sort()).toEqual(
            [cover.id, mediaResponse.body.id].sort(),
          );
          return;
        }

        await new Promise((resolve) => setTimeout(resolve, 50));
      }

      throw new Error('Draft publication did not complete during the test');
    } finally {
      const draft = await prisma.draft.findUnique({ where: { id } });
      if (draft?.postId)
        await prisma.post.deleteMany({ where: { id: draft.postId } });
    }
  });
});
