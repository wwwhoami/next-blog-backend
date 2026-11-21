import { PrismaService } from '@app/prisma';
import { AppModule } from '@core/src/app.module';
import { ErrorInterceptor } from '@core/src/common/interceptors/error.interceptor';
import {
  DraftPublishJobData,
  VALIDATE_AND_PUBLISH_JOB,
} from '@core/src/draft/constants/draft-processor.constants';
import { DraftProcessor } from '@core/src/draft/draft.processor';
import { DraftRepository } from '@core/src/draft/draft.repository';
import { MEDIA_PROCESSOR_QUEUE } from '@core/src/media/constants/media-processor.constants';
import { MediaCleanupProcessor } from '@core/src/media/media-cleanup.processor';
import { MediaProcessor } from '@core/src/media/media.processor';
import { MediaRepository } from '@core/src/media/media.repository';
import { MediaService } from '@core/src/media/media.service';
import { StorageService } from '@core/src/storage/storage.service';
import { getQueueToken } from '@nestjs/bullmq';
import { HttpStatus, INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { Job, Queue } from 'bullmq';
import cookieParser from 'cookie-parser';
import { userData } from 'data/seed-data';
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
  let app: INestApplication;
  let accessToken: string;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true }));
    app.useGlobalInterceptors(new ErrorInterceptor());
    app.use(cookieParser());

    await app.init();
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

  const createMedia = (
    ownerId: string,
    overrides: Partial<Prisma.MediaUncheckedCreateInput> = {},
  ) => {
    const key = randomUUID();
    return prisma.media.create({
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
  ) => {
    const storage = app.get(StorageService);
    const key = `image/${ownerId}/${randomUUID()}.webp`;
    return createMedia(ownerId, {
      key,
      bucket: storage.bucket,
      publicUrl: storage.buildPublicUrl(key),
      ...overrides,
    });
  };

  const createTestAccount = async () => {
    const name = randomUUID();
    const image = 'https://example.com/avatar.webp';
    const { body } = await request(app.getHttpServer())
      .post('/auth/sign-up')
      .send({ name, email: `${name}@example.com`, password: 'password', image })
      .expect(HttpStatus.CREATED);
    return { id: body.id as string, token: body.accessToken as string, image };
  };

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
    const remove = (force: boolean) =>
      request(app.getHttpServer())
        .delete(`/media/${original.id}?force=${force}`)
        .auth(accessToken, { type: 'bearer' });
    await remove(false).expect(HttpStatus.OK);
    await expect(
      prisma.draft.findUnique({
        where: { id: draft.id },
        include: { draftMedia: true },
      }),
    ).resolves.toMatchObject({ coverMediaId: null, draftMedia: [] });
    await expect(
      prisma.media.findUnique({
        where: { id: original.id },
        include: { Variants: true },
      }),
    ).resolves.toMatchObject({ draftId: null, Variants: [{ id: variant.id }] });
    await expect(
      prisma.mediaStorageDeletion.count({
        where: { key: { in: [original.key, variant.key] } },
      }),
    ).resolves.toBe(0);

    await save({ mediaIds: [original.id], coverMediaId: original.id }).expect(
      HttpStatus.OK,
    );
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
    const [save] = await Promise.all([
      request(app.getHttpServer())
        .put(`/draft/${draft.id}`)
        .auth(accessToken, { type: 'bearer' })
        .send({
          content: `![image](${media.publicUrl})`,
          coverMediaId: media.id,
        }),
      request(app.getHttpServer())
        .delete(`/media/${media.id}`)
        .auth(accessToken, { type: 'bearer' })
        .expect(HttpStatus.OK),
    ]);
    expect([HttpStatus.OK, HttpStatus.BAD_REQUEST]).toContain(save.status);
    await expect(
      prisma.draft.findUnique({
        where: { id: draft.id },
        include: { draftMedia: true, media: true },
      }),
    ).resolves.toMatchObject({ coverMediaId: null, draftMedia: [], media: [] });
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
      prisma.media.count({ where: { postId: example.body.id } }),
    ).resolves.toBe(0);
    payload.title = randomUUID();
    const content = `![variant][image]\n\n[image]: ${variant.publicUrl}`;
    const saved = await post(externalCover, content).expect(HttpStatus.CREATED);
    await expect(
      prisma.media.count({
        where: { postId: saved.body.id, id: { in: [original.id, variant.id] } },
      }),
    ).resolves.toBe(2);

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
      await app
        .get(MediaCleanupProcessor)
        .process({ name: 'drainStorage' } as Job);
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
    const original = await createManagedMedia(ownerId, { postId: post.id });
    const variant = await createManagedMedia(ownerId, {
      postId: post.id,
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

    const repo = app.get(DraftRepository);
    const processor = app.get(DraftProcessor);
    const publish = async () => {
      await repo.markPublishing(repair.id, ownerId);
      return processor.process({
        name: VALIDATE_AND_PUBLISH_JOB,
        data: { draftId: repair.id, ownerId },
      } as Job<DraftPublishJobData>);
    };
    await expect(publish()).rejects.toThrow(
      'A cover image attached to the draft is required',
    );
    const replacement = await createManagedMedia(ownerId, {
      draftId: repair.id,
    });
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
    const repo = app.get(DraftRepository);
    const publish = async (id: string) => {
      await repo.markPublishing(id, ownerId);
      return app.get(DraftProcessor).process({
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

  it.each(['direct', 'snapshot'] as const)(
    'rejects a claim against a live %s attachment and preserves the destination',
    async (link) => {
      const source = await createDraft();
      const destination = await createDraft();
      const retained = await createMedia(destination.ownerId, {
        draftId: destination.id,
      });
      const asset = await createMedia(
        source.ownerId,
        link === 'direct' ? { draftId: source.id } : {},
      );
      if (link === 'snapshot') {
        await prisma.draftMedia.create({
          data: { draftId: source.id, mediaId: asset.id },
        });
        await prisma.draft.update({
          where: { id: source.id },
          data: { status: DraftStatus.PUBLISHING },
        });
      }

      await saveMedia(destination.id, [asset.id]).expect(HttpStatus.CONFLICT);
      await expect(
        prisma.media.findUnique({ where: { id: retained.id } }),
      ).resolves.toMatchObject({ draftId: destination.id });
    },
  );

  it('lets exactly one simultaneous save claim an original and preserves archived links', async () => {
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
    expect(results.map(({ status }) => status).sort()).toEqual([
      HttpStatus.OK,
      HttpStatus.CONFLICT,
    ]);
    const winner = results.find(({ status }) => status === HttpStatus.OK)!.body
      .id;
    const links = await prisma.draftMedia.findMany({
      where: { mediaId: asset.id },
    });
    expect(links.map(({ draftId }) => draftId).sort()).toEqual(
      [archive.id, winner].sort(),
    );
    await expect(
      prisma.media.findUnique({ where: { id: asset.id } }),
    ).resolves.toMatchObject({ draftId: winner });
  });

  it('serializes revision creation and a save competing for post media', async () => {
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
    const asset = await createMedia(draft.ownerId, { postId: post.id });

    const [save, revision] = await Promise.all([
      saveMedia(draft.id, [asset.id]),
      request(app.getHttpServer())
        .post(`/post/${post.id}/draft`)
        .set('Authorization', `Bearer ${accessToken}`),
    ]);

    expect([save.status, revision.status]).toEqual([
      HttpStatus.CONFLICT,
      HttpStatus.CREATED,
    ]);
    const links = await prisma.draftMedia.findMany({
      where: { mediaId: asset.id },
    });
    expect(links).toEqual([
      expect.objectContaining({ draftId: revision.body.id }),
    ]);
  });

  it('restores a publishing draft when a legacy snapshot claims another post’s media', async () => {
    const draft = await createDraft({ title: randomUUID() });
    const post = await prisma.post.create({
      data: {
        title: randomUUID(),
        slug: randomUUID(),
        content: 'Source post',
        excerpt: 'Source post',
        coverImage: '',
        authorId: draft.ownerId,
      },
    });
    const original = await createMedia(draft.ownerId, { postId: post.id });
    await prisma.draft.update({
      where: { id: draft.id },
      data: {
        coverMediaId: original.id,
        draftMedia: { create: { mediaId: original.id } },
      },
    });
    const repository = app.get(DraftRepository);
    await repository.markPublishing(draft.id, draft.ownerId);
    await expect(
      app.get(DraftProcessor).process({
        name: VALIDATE_AND_PUBLISH_JOB,
        data: { draftId: draft.id, ownerId: draft.ownerId },
      } as Job<DraftPublishJobData>),
    ).rejects.toThrow('Media is attached to another post');
    await expect(repository.findById(draft.id)).resolves.toMatchObject({
      status: DraftStatus.ACTIVE,
      postId: null,
      validationError: 'Media is attached to another post',
    });
    await expect(
      prisma.media.findUnique({ where: { id: original.id } }),
    ).resolves.toMatchObject({ postId: post.id });
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
    const oldMedia = await createMedia(draft.ownerId, { postId: post.id });
    const cover = await createMedia(draft.ownerId, { draftId: draft.id });
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
          status: DraftStatus.PUBLISHING,
          coverMediaId: mediaId,
          categoryNames: [category.name],
          draftMedia: { create: { mediaId } },
        },
      });
    await prepareRevision(draft.id, cover.id, randomUUID());
    const job = (draftId: string) =>
      ({
        name: VALIDATE_AND_PUBLISH_JOB,
        data: { draftId, ownerId: draft.ownerId },
      }) as Job<DraftPublishJobData>;
    const state = () =>
      prisma.post.findUniqueOrThrow({
        where: { id: post.id },
        include: { categories: true, Media: { orderBy: { id: 'asc' } } },
      });
    const worker = app.get(DraftProcessor);
    const secondWorker = new DraftProcessor(
      app.get(DraftRepository),
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
    expect(published.Media.map(({ id }) => id).sort()).toEqual(
      [cover.id, variant.id].sort(),
    );
    await expect(
      prisma.media.findUnique({ where: { id: oldMedia.id } }),
    ).resolves.toMatchObject({ postId: null });
    await expect(
      prisma.draft.findUnique({ where: { id: draft.id } }),
    ).resolves.toMatchObject({ status: DraftStatus.ARCHIVED });

    const stale = await createDraft();
    const staleCover = await createMedia(stale.ownerId, { draftId: stale.id });
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
      const cover = await createMedia(draft.ownerId, { draftId: draft.id });
      await prisma.draft.update({
        where: { id: draft.id },
        data: {
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
          include: { draftMedia: true, media: true },
        }),
      ).resolves.toMatchObject({
        coverMediaId: cover.id,
        draftMedia: [{ mediaId: cover.id }],
        media: [{ id: cover.id }],
      });
    },
  );

  it('deduplicates concurrent uploads per draft and protects archived snapshot media', async () => {
    const first = await createDraft();
    const second = await createDraft();
    const archived = await createDraft();
    const bytes = await sharp(Buffer.from(randomUUID().slice(0, 12)), {
      raw: { width: 2, height: 2, channels: 3 },
    })
      .png()
      .toBuffer();
    const mediaService = app.get(MediaService);
    const upload = (draftId?: string) =>
      mediaService.upload(
        {
          buffer: bytes,
          mimetype: 'image/png',
          size: bytes.length,
        } as Express.Multer.File,
        first.ownerId,
        { type: MediaType.IMAGE, target: MediaTarget.POST, draftId },
      );
    const queue = app.get<Queue>(getQueueToken(MEDIA_PROCESSOR_QUEUE));
    const put = jest.spyOn(app.get(StorageService), 'uploadBuffer');
    try {
      const archiveMedia = await upload(archived.id);
      await prisma.draft.update({
        where: { id: archived.id },
        data: {
          status: DraftStatus.ARCHIVED,
          draftMedia: { create: { mediaId: archiveMedia.id } },
        },
      });
      await prisma.media.update({
        where: { id: archiveMedia.id },
        data: { draftId: null },
      });
      const contexts = [first.id, second.id, undefined];
      const pairs = await Promise.all(
        contexts.map((draftId) =>
          Promise.all([upload(draftId), upload(draftId)]),
        ),
      );
      const ids = pairs.map(([left, right]) => {
        expect(left.id).toBe(right.id);
        expect(
          put.mock.calls.filter(([, key]) => key === left.key),
        ).toHaveLength(1);
        return left.id;
      });
      expect(new Set([...ids, archiveMedia.id]).size).toBe(4);
      const originals = await prisma.media.findMany({
        where: {
          ownerId: first.ownerId,
          parentId: null,
          hash: archiveMedia.hash,
        },
      });
      expect(originals.map(({ id }) => id).sort()).toEqual(
        [...ids, archiveMedia.id].sort(),
      );
      const jobs = await queue.getJobs([
        'waiting',
        'active',
        'completed',
        'delayed',
        'failed',
      ]);
      for (const id of ids) {
        expect(
          jobs
            .filter(
              ({ name, data }) =>
                name === 'generateVariants' && data.mediaId === id,
            )
            .map((job) => job.id),
        ).toEqual([id]);
      }

      await request(app.getHttpServer())
        .delete(`/media/${archiveMedia.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(HttpStatus.CONFLICT);
      const nestedVariant = await createMedia(first.ownerId, {
        parentId: archiveMedia.id,
        variant: MediaVariant.PREVIEW,
      });
      const all = await mediaService.listOwnedMedia(first.ownerId);
      const attached = await mediaService.listOwnedMedia(first.ownerId, true);
      const unattached = await mediaService.listOwnedMedia(
        first.ownerId,
        false,
      );
      for (const list of [all, attached, unattached]) {
        expect(list.every(({ parentId }) => parentId === null)).toBe(true);
      }
      expect(
        attached.find(({ id }) => id === archiveMedia.id)?.Variants,
      ).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: nestedVariant.id }),
        ]),
      );
      expect(unattached.map(({ id }) => id)).not.toContain(archiveMedia.id);
    } finally {
      put.mockRestore();
    }
  });

  it.each([MediaTarget.COMMENT, MediaTarget.USER_AVATAR])(
    'deduplicates unattached %s uploads without reusing a live asset',
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
        expect(fresh.id).not.toBe(original.id);
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

  it('includes legacy variant-only claims in exactly one attachment filter', async () => {
    const draft = await createDraft();
    const originals = await Promise.all(
      Array.from({ length: 4 }, () => createMedia(draft.ownerId)),
    );
    const variants = await Promise.all(
      originals.map(({ id }, index) =>
        createMedia(draft.ownerId, {
          parentId: id,
          variant: MediaVariant.THUMBNAIL,
          ...(index === 0 && { draftId: draft.id }),
        }),
      ),
    );
    await prisma.draftMedia.create({
      data: { draftId: draft.id, mediaId: variants[1].id },
    });
    await prisma.draft.update({
      where: { id: draft.id },
      data: { coverMediaId: variants[2].id },
    });
    const repo = app.get(MediaRepository);
    const [attached, unattached] = await Promise.all([
      repo.findOwnedMedia(draft.ownerId, true),
      repo.findOwnedMedia(draft.ownerId, false),
    ]);
    for (const [index, original] of originals.entries()) {
      const [included, excluded] =
        index === 3 ? [unattached, attached] : [attached, unattached];
      expect(included.find(({ id }) => id === original.id)?.Variants).toEqual([
        expect.objectContaining({ id: variants[index].id }),
      ]);
      expect(excluded.map(({ id }) => id)).not.toContain(original.id);
    }
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
    const variantCoverFamily = await createMedia(draft.ownerId, { createdAt });
    const variantCover = await variant(variantCoverFamily.id);
    await prisma.draft.createMany({
      data: [originalCover, variantCover].map(({ id }) => ({
        ownerId: draft.ownerId,
        coverMediaId: id,
      })),
    });
    const repository = app.get(MediaRepository);

    const candidates = await repository.findUnattachedBefore(cutoff);
    expect(candidates).toEqual(
      expect.arrayContaining([{ id: retained.id }, { id: orphan.id }]),
    );
    expect(candidates).not.toContainEqual({ id: orphanVariant.id });
    for (const { id } of [originalCover, variantCoverFamily]) {
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
      await app
        .get(MediaCleanupProcessor)
        .process({ name: 'drainStorage' } as Job);
      await expect(pending()).resolves.toEqual([]);
      await expect(
        prisma.mediaStorageDeletion.findFirst({ where: { key: orphan.key } }),
      ).resolves.toMatchObject({ key: orphan.key });
      failOriginal = false;
      await prisma.mediaStorageDeletion.updateMany({
        where: { key: orphan.key },
        data: { nextAttemptAt: new Date(0) },
      });
      await app
        .get(MediaCleanupProcessor)
        .process({ name: 'drainStorage' } as Job);
      await expect(pending()).resolves.toEqual([]);
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

  it('keeps conflicting variant draft, post and comment links for explicit resolution', async () => {
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
    const comment = await prisma.comment.create({
      data: { authorId: draft.ownerId, postId: post.id, content: 'Comment' },
    });
    const original = await createMedia(draft.ownerId, {
      draftId: draft.id,
      postId: post.id,
    });
    const variant = await createMedia(draft.ownerId, {
      draftId: draft.id,
      parentId: original.id,
      postId: post.id,
      commentId: comment.id,
      variant: MediaVariant.PREVIEW,
    });
    await prisma.draftMedia.createMany({
      data: [original.id, variant.id].map((mediaId) => ({
        draftId: draft.id,
        mediaId,
      })),
    });

    await saveMedia(draft.id, [original.id]).expect(HttpStatus.CONFLICT);
    await expect(
      prisma.media.findUnique({ where: { id: variant.id } }),
    ).resolves.toMatchObject({
      draftId: draft.id,
      parentId: original.id,
      postId: post.id,
      commentId: comment.id,
    });
    await expect(
      prisma.media.findUnique({ where: { id: original.id } }),
    ).resolves.toMatchObject({
      draftId: draft.id,
      postId: post.id,
    });
    await expect(
      prisma.draftMedia.findMany({ where: { draftId: draft.id } }),
    ).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ mediaId: original.id }),
        expect.objectContaining({ mediaId: variant.id }),
      ]),
    );
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
    const live = await createMedia(archived.ownerId, { postId: published.id });
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
      prisma.media.findUnique({ where: { id: live.id } }),
    ).resolves.toMatchObject({ postId: published.id });
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
    const original = await createManagedMedia(draft.ownerId, {
      postId: post.id,
    });
    const variant = await createManagedMedia(draft.ownerId, {
      parentId: original.id,
      postId: post.id,
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
    await repository.markPublishing(revision!.id, draft.ownerId);
    await expect(
      app.get(DraftProcessor).process({
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
      prisma.media.count({
        where: { postId: post.id, id: { in: [original.id, variant.id] } },
      }),
    ).resolves.toBe(2);
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
      const owned = await createManagedMedia(ownerId, { postId: post.id });
      const foreign = await createManagedMedia(userData[1].id, {
        postId: post.id,
      });
      const variant = await createManagedMedia(userData[1].id, {
        postId: post.id,
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
        include: { Media: { orderBy: { id: 'asc' } } },
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
          include: { Media: { orderBy: { id: 'asc' } } },
        }),
      ).resolves.toEqual(source);
    },
  );

  it('protects a legacy variant claim until an explicit manifest drops it', async () => {
    const other = await createDraft();
    const claimed = await createMedia(other.ownerId, { draftId: other.id });
    const variant = await createMedia(other.ownerId, {
      parentId: claimed.id,
      variant: MediaVariant.THUMBNAIL,
    });
    const conflicting = await createDraft();
    await prisma.draft.update({
      where: { id: conflicting.id },
      data: {
        coverMediaId: variant.id,
        draftMedia: { create: { mediaId: variant.id } },
      },
    });

    await request(app.getHttpServer())
      .delete(`/media/${variant.id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(HttpStatus.CONFLICT);
    const remove = (force: boolean) =>
      request(app.getHttpServer())
        .delete(`/media/${claimed.id}?force=${force}`)
        .auth(accessToken, { type: 'bearer' });
    for (const force of [false, true]) {
      const { body } = await remove(force).expect(HttpStatus.CONFLICT);
      expect(body).toMatchObject({
        code: 'MEDIA_LEGACY_DRAFT_CLAIM',
        canForce: false,
      });
    }
    const pasted = await createManagedMedia(other.ownerId);
    await request(app.getHttpServer())
      .put(`/draft/${conflicting.id}`)
      .auth(accessToken, { type: 'bearer' })
      .send({ content: `![new image](${pasted.publicUrl})` })
      .expect(HttpStatus.CONFLICT);
    await saveMedia(other.id, [claimed.id]).expect(HttpStatus.CONFLICT);
    await expect(
      prisma.media.findUnique({ where: { id: claimed.id } }),
    ).resolves.toMatchObject({ draftId: other.id });
    await expect(
      prisma.draft.findUnique({
        where: { id: conflicting.id },
        include: { draftMedia: true },
      }),
    ).resolves.toMatchObject({
      coverMediaId: variant.id,
      content: conflicting.content,
      draftMedia: [{ mediaId: variant.id }],
    });

    await saveMedia(conflicting.id, []).expect(HttpStatus.OK);
    await saveMedia(other.id, [claimed.id]).expect(HttpStatus.OK);
    await remove(false).expect(HttpStatus.OK);
  });

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
        await app.get(DraftRepository).markPublishing(draft.id, draft.ownerId);
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
          expect(
            rows.every((row) => row.postId === postId && row.draftId === null),
          ).toBe(true);
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
          draftId: draft.id,
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
      await app.get(DraftRepository).markPublishing(draft.id, draft.ownerId);
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
          const attached = await prisma.media.findMany({
            where: { postId: response.body.postId, parentId: null },
          });
          expect(attached.map(({ id }) => id).sort()).toEqual(
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
