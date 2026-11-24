import { PrismaService } from '@app/prisma';
import { Test, TestingModule } from '@nestjs/testing';
import { DeepMockProxy, mockDeep } from 'jest-mock-extended';
import { DraftStatus, Prisma } from 'prisma/generated/client';
import { DraftPublicationRepository } from '../draft-publication.repository';

describe('DraftPublicationRepository', () => {
  let repository: DraftPublicationRepository;
  let prisma: DeepMockProxy<PrismaService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DraftPublicationRepository,
        { provide: PrismaService, useValue: mockDeep<PrismaService>() },
      ],
    }).compile();

    repository = module.get(DraftPublicationRepository);
    prisma = module.get(PrismaService);
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
});
