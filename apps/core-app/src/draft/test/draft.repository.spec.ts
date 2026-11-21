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

  it('moves draft media to the created post and archives the draft atomically', async () => {
    const post = { id: 42 };
    const tx = mockDeep<PrismaService>();
    tx.draft.findFirst.mockResolvedValueOnce({
      coverMediaId: 'media-id',
    } as never);
    tx.media.findMany.mockResolvedValue([
      { id: 'media-id', ownerId: 'owner-id', Variants: [], DraftMedia: [] },
    ] as never);
    tx.post.create.mockResolvedValue(post as never);
    tx.media.updateMany.mockResolvedValue({ count: 1 });
    tx.draft.update.mockResolvedValue({
      status: DraftStatus.ARCHIVED,
      postId: post.id,
    } as never);
    prisma.$transaction.mockImplementation((async (
      callback: (client: Prisma.TransactionClient) => Promise<unknown>,
    ) => callback(tx)) as never);

    await repository.publish('draft-id', 'owner-id', {
      title: 'Title',
      slug: 'title',
      excerpt: 'Excerpt',
      content: 'Content',
      coverImage: 'https://cdn.test/cover.webp',
      mediaIds: ['media-id'],
      coverMediaId: 'media-id',
      categoryNames: [],
    });

    expect(tx.media.updateMany).toHaveBeenCalledWith({
      where: {
        id: { in: ['media-id'] },
        draftId: 'draft-id',
      },
      data: { draftId: null },
    });
    expect(tx.media.updateMany).toHaveBeenCalledWith({
      where: {
        OR: [{ id: { in: ['media-id'] } }, { parentId: { in: ['media-id'] } }],
      },
      data: { postId: post.id },
    });
    expect(tx.draft.update).toHaveBeenCalledWith({
      where: { id: 'draft-id' },
      data: {
        status: DraftStatus.ARCHIVED,
        postId: post.id,
        archivedAt: expect.any(Date),
      },
    });
  });

  it('returns an existing active revision after a concurrent create conflict', async () => {
    const activeRevision = { id: 'existing-revision', postId: 7 };
    const tx = mockDeep<PrismaService>();
    tx.post.findUnique.mockResolvedValue({
      id: 7,
      authorId: 'owner-id',
      version: 1,
      content: 'Post',
      coverImage: 'https://example.com/cover.webp',
      categories: [],
      Media: [],
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
    tx.post.findUnique.mockResolvedValue({
      id: 7,
      authorId: 'owner-id',
      version: 1,
      content: 'Post',
      coverImage: 'https://example.com/cover.webp',
      categories: [],
      Media: [],
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
    tx.post.findUnique.mockResolvedValue({
      id: 7,
      authorId: 'owner-id',
      version: 1,
      content: 'Post',
      coverImage: 'https://example.com/cover.webp',
      categories: [],
      Media: [],
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
        updatedAt: { lt: cutoff },
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
        archivedAt: { lt: cutoff },
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
        media: { where: { parentId: null, variant: MediaVariant.ORIGINAL } },
        draftMedia: {
          where: { media: { parentId: null, variant: MediaVariant.ORIGINAL } },
          include: { media: true },
        },
        post: true,
      },
    });
  });
});
