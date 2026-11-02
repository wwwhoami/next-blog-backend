import { PrismaService } from '@app/prisma';
import { Test, TestingModule } from '@nestjs/testing';
import { DeepMockProxy, mockDeep } from 'jest-mock-extended';
import { DraftStatus, MediaTarget, Prisma } from 'prisma/generated/client';
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

  it('finds only post media owned by the user', async () => {
    prisma.media.findMany.mockResolvedValue([]);

    await repository.findAttachableMedia('owner-id', ['media-id']);

    expect(prisma.media.findMany).toHaveBeenCalledWith({
      where: {
        id: { in: ['media-id'] },
        ownerId: 'owner-id',
        target: MediaTarget.POST,
      },
    });
  });

  it('attaches media in a transaction after clearing existing draft media', async () => {
    prisma.media.updateMany.mockReturnValue({} as never);
    prisma.$transaction.mockResolvedValue([] as never);

    await repository.attachMedia('draft-id', ['media-id']);

    expect(prisma.$transaction).toHaveBeenCalledWith([
      expect.anything(),
      expect.anything(),
    ]);
    expect(prisma.media.updateMany).toHaveBeenNthCalledWith(1, {
      where: { draftId: 'draft-id' },
      data: { draftId: null },
    });
    expect(prisma.media.updateMany).toHaveBeenNthCalledWith(2, {
      where: { id: { in: ['media-id'] } },
      data: { draftId: 'draft-id' },
    });
  });

  it('moves draft media to the created post and archives the draft atomically', async () => {
    const post = { id: 42 };
    const tx = mockDeep<PrismaService>();
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
      categoryNames: [],
    });

    expect(tx.media.updateMany).toHaveBeenCalledWith({
      where: { draftId: 'draft-id' },
      data: { draftId: null, postId: post.id },
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

  it('promotes one attached media asset to cover media', async () => {
    prisma.draft.update.mockResolvedValue({} as never);

    await repository.setCoverMedia('draft-id', 'media-id');

    expect(prisma.draft.update).toHaveBeenCalledWith({
      where: { id: 'draft-id' },
      data: { coverMediaId: 'media-id' },
    });
  });
});
