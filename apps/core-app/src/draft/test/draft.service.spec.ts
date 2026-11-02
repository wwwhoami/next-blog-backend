import { PrismaService } from '@app/prisma';
import {
  ConflictException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DeepMockProxy, mockDeep } from 'jest-mock-extended';
import { DraftStatus, MediaTarget } from 'prisma/generated/client';
import { DraftRepository } from '../draft.repository';
import { DraftService } from '../draft.service';

describe('DraftService', () => {
  let service: DraftService;
  let repository: DeepMockProxy<DraftRepository>;
  let prisma: DeepMockProxy<PrismaService>;
  let config: DeepMockProxy<ConfigService>;

  beforeEach(() => {
    repository = mockDeep<DraftRepository>();
    prisma = mockDeep<PrismaService>();
    config = mockDeep<ConfigService>();
    config.get.mockReturnValue('');
    service = new DraftService(repository, prisma, config);
  });

  it('creates an incomplete draft without creating a Post', async () => {
    repository.create.mockResolvedValue({
      id: 'draft-id',
      ownerId: 'owner-id',
      title: 'Draft',
    } as never);

    await expect(
      service.create('owner-id', { title: 'Draft' }),
    ).resolves.toMatchObject({ id: 'draft-id' });
    expect(repository.create).toHaveBeenCalledWith(
      'owner-id',
      expect.objectContaining({
        title: 'Draft',
        excerpt: '',
        content: '',
        categoryNames: [],
      }),
    );
    expect(prisma.post.create).not.toHaveBeenCalled();
  });

  it('rejects publishing a draft without a cover media asset', async () => {
    repository.findById.mockResolvedValue({
      id: 'draft-id',
      ownerId: 'owner-id',
      title: 'Title',
      excerpt: 'Excerpt',
      content: '# Content',
      categoryNames: [],
      coverMediaId: null,
      status: DraftStatus.ACTIVE,
      media: [],
    } as never);

    await expect(service.publish('draft-id', 'owner-id')).rejects.toThrow(
      UnprocessableEntityException,
    );
  });

  it('rejects repeated publishing of an archived draft', async () => {
    repository.findById.mockResolvedValue({
      id: 'draft-id',
      ownerId: 'owner-id',
      status: DraftStatus.ARCHIVED,
    } as never);

    await expect(service.publish('draft-id', 'owner-id')).rejects.toThrow(
      ConflictException,
    );
  });

  it('requires draft-bound post media to be owned by the draft owner', async () => {
    repository.findById.mockResolvedValue({
      id: 'draft-id',
      ownerId: 'owner-id',
      status: DraftStatus.ACTIVE,
      media: [],
    } as never);
    prisma.media.findMany.mockResolvedValue([] as never);

    await expect(
      service.update('draft-id', 'owner-id', {
        mediaIds: ['media-id'],
      }),
    ).rejects.toThrow();

    expect(prisma.media.findMany).toHaveBeenCalledWith({
      where: {
        id: { in: ['media-id'] },
        ownerId: 'owner-id',
        target: MediaTarget.POST,
      },
    });
  });
});
