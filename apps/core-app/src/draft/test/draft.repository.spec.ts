import { PrismaService } from '@app/prisma';
import { Test, TestingModule } from '@nestjs/testing';
import { DeepMockProxy, mockDeep } from 'jest-mock-extended';
import { DraftStatus, MediaVariant, Prisma } from 'prisma/generated/client';
import { DraftRepository } from '../draft.repository';

describe('DraftRepository', () => {
  let repository: DraftRepository;
  let prisma: DeepMockProxy<PrismaService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DraftRepository,
        { provide: PrismaService, useValue: mockDeep<PrismaService>() },
      ],
    }).compile();

    repository = module.get(DraftRepository);
    prisma = module.get(PrismaService);
  });

  it('finds draft ownership and status for media attachment validation', async () => {
    const draft = { ownerId: 'owner-id', status: DraftStatus.ACTIVE };
    prisma.draft.findUnique.mockResolvedValue(draft as any);

    await expect(
      repository.findForMediaAttachment('draft-id'),
    ).resolves.toEqual(draft);
    expect(prisma.draft.findUnique).toHaveBeenCalledWith({
      where: { id: 'draft-id' },
      select: { ownerId: true, status: true },
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(repository).toBeDefined();
  });

  it('adds post links and retains draft links and archives the draft atomically', async () => {
    const post = { id: 42 };
    const tx = mockDeep<PrismaService>();
    tx.draft.findFirst.mockResolvedValueOnce({
      coverMediaId: 'media-id',
    } as never);
    tx.draftMedia.findMany.mockResolvedValue([
      { mediaId: 'media-id' },
    ] as never);
    tx.media.count.mockResolvedValue(1);
    tx.post.create.mockResolvedValue(post as never);

    tx.draft.update.mockResolvedValue({
      status: DraftStatus.ARCHIVED,
      postId: post.id,
    } as never);
    prisma.$transaction.mockImplementation((async (
      callback: (client: Prisma.TransactionClient) => Promise<unknown>,
    ) => callback(tx)) as never);

    await repository.publish('draft-id', 'owner-id', {
      publicationAttemptId: 'attempt',
      title: 'Title',
      slug: 'title',
      excerpt: 'Excerpt',
      content: 'Content',
      coverImage: 'https://cdn.test/cover.webp',
      mediaIds: ['media-id'],
      coverMediaId: 'media-id',
      categoryNames: [],
    });

    expect(tx.postMedia.createMany).toHaveBeenCalledWith({
      data: [{ postId: post.id, mediaId: 'media-id' }],
      skipDuplicates: true,
    });
    expect(tx.draftMedia.deleteMany).not.toHaveBeenCalled();
    expect(tx.draft.update).toHaveBeenCalledWith({
      where: { id: 'draft-id' },
      data: {
        publicationAttemptId: null,
        status: DraftStatus.ARCHIVED,
        postId: post.id,
        archivedAt: expect.any(Date),
      },
    });
  });

  it.each(['new', 'revision'])(
    'rejects unavailable categories before writing a %s post',
    async (mode) => {
      const tx = mockDeep<PrismaService>();
      prisma.$transaction.mockImplementation((async (
        run: (client: Prisma.TransactionClient) => Promise<unknown>,
      ) => run(tx)) as never);
      tx.draft.findFirst.mockResolvedValue({
        sourceVersion: 0,
        coverMediaId: 'cover',
      } as never);
      tx.$queryRaw.mockResolvedValue([{ name: 'available' }]);
      const data = {
        publicationAttemptId: 'attempt',
        title: 'Title',
        content: 'Body',
        excerpt: 'Excerpt',
        coverMediaId: 'cover',
        coverImage: 'cover.png',
        mediaIds: ['cover'],
        categoryNames: ['available', 'removed'],
      };
      const publication =
        mode === 'new'
          ? repository.publish('draft', 'owner', { ...data, slug: 'title' })
          : repository.publishRevision('draft', 'owner', {
              ...data,
              sourceVersion: 0,
              postId: 1,
            });
      await expect(publication).rejects.toThrow(
        'Remove or replace unavailable categories: removed',
      );
      expect(tx.post.create).not.toHaveBeenCalled();
      expect(tx.post.updateMany).not.toHaveBeenCalled();
    },
  );

  it('returns an existing active revision after a concurrent create conflict', async () => {
    const activeRevision = { id: 'existing-revision', postId: 7 };
    const tx = mockDeep<PrismaService>();
    tx.postMedia.findMany.mockResolvedValue([]);
    tx.post.findUnique.mockResolvedValue({
      id: 7,
      authorId: 'owner-id',
      version: 1,
      content: 'Post',
      coverImage: 'https://example.com/cover.webp',
      categories: [],
      postMedia: [],
    } as never);
    tx.draft.findFirst.mockResolvedValue(null);
    tx.draft.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('duplicate', {
        code: 'P2002',
        clientVersion: 'test',
        meta: { target: ['post_id'] },
      }),
    );
    prisma.$transaction.mockImplementation((async (
      callback: (client: Prisma.TransactionClient) => Promise<unknown>,
    ) => callback(tx)) as never);
    prisma.draft.findFirst.mockResolvedValue(activeRevision as never);

    await expect(repository.createRevision('owner-id', 7)).resolves.toEqual(
      activeRevision,
    );
    expect(prisma.draft.findFirst).toHaveBeenCalled();
  });

  it('does not mask unrelated unique constraint errors', async () => {
    const tx = mockDeep<PrismaService>();
    tx.postMedia.findMany.mockResolvedValue([]);
    tx.post.findUnique.mockResolvedValue({
      id: 7,
      authorId: 'owner-id',
      version: 1,
      content: 'Post',
      coverImage: 'https://example.com/cover.webp',
      categories: [],
      postMedia: [],
    } as never);
    tx.draft.findFirst.mockResolvedValue(null);
    const error = new Prisma.PrismaClientKnownRequestError('duplicate', {
      code: 'P2002',
      clientVersion: 'test',
      meta: { target: ['title'] },
    });
    tx.draft.create.mockRejectedValue(error);
    prisma.$transaction.mockImplementation((async (
      callback: (client: Prisma.TransactionClient) => Promise<unknown>,
    ) => callback(tx)) as never);

    await expect(repository.createRevision('owner-id', 7)).rejects.toBe(error);
    expect(prisma.draft.findFirst).not.toHaveBeenCalled();
  });

  it('does not mask compound unique conflicts containing postId', async () => {
    const tx = mockDeep<PrismaService>();
    tx.postMedia.findMany.mockResolvedValue([]);
    tx.post.findUnique.mockResolvedValue({
      id: 7,
      authorId: 'owner-id',
      version: 1,
      content: 'Post',
      coverImage: 'https://example.com/cover.webp',
      categories: [],
      postMedia: [],
    } as never);
    tx.draft.findFirst.mockResolvedValue(null);
    const error = new Prisma.PrismaClientKnownRequestError('duplicate', {
      code: 'P2002',
      clientVersion: 'test',
      meta: { target: ['postId', 'status'] },
    });
    tx.draft.create.mockRejectedValue(error);
    prisma.$transaction.mockImplementation((async (
      callback: (client: Prisma.TransactionClient) => Promise<unknown>,
    ) => callback(tx)) as never);

    await expect(repository.createRevision('owner-id', 7)).rejects.toBe(error);
    expect(prisma.draft.findFirst).not.toHaveBeenCalled();
  });

  it('archives only inactive active revisions during retention cleanup', async () => {
    const cutoff = new Date('2026-10-01T00:00:00.000Z');
    prisma.draft.updateMany.mockResolvedValue({ count: 1 });

    await repository.archiveInactiveRevisionsBefore(cutoff);

    expect(prisma.draft.updateMany).toHaveBeenCalledWith({
      where: {
        postId: { not: null },
        sourceVersion: { not: null },
        status: DraftStatus.ACTIVE,
        updatedAt: { lte: cutoff },
      },
      data: { status: DraftStatus.ARCHIVED, archivedAt: expect.any(Date) },
    });
  });

  it('deletes only archived revisions during retention cleanup', async () => {
    const cutoff = new Date('2026-10-01T00:00:00.000Z');
    prisma.draft.deleteMany.mockResolvedValue({ count: 1 });

    await repository.deleteArchivedBefore(cutoff);

    expect(prisma.draft.deleteMany).toHaveBeenCalledWith({
      where: {
        status: DraftStatus.ARCHIVED,
        archivedAt: { lte: cutoff },
      },
    });
  });

  it('includes revision media when updating a draft', async () => {
    prisma.draft.update.mockResolvedValue({} as never);

    await repository.update('draft-id', { title: 'Updated title' });

    expect(prisma.draft.update).toHaveBeenCalledWith({
      where: { id: 'draft-id' },
      data: { title: 'Updated title' },
      include: {
        draftMedia: {
          where: {
            media: {
              deletedAt: null,
              parentId: null,
              variant: MediaVariant.ORIGINAL,
            },
          },
          include: { media: true },
        },
        post: true,
      },
    });
  });
});
