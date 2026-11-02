import { ConflictException } from '@nestjs/common';
import { DeepMockProxy, mockDeep } from 'jest-mock-extended';
import { DraftStatus } from 'prisma/generated/client';
import { DraftRepository } from '../draft.repository';
import { DraftService } from '../draft.service';

describe('DraftService', () => {
  let service: DraftService;
  let repository: DeepMockProxy<DraftRepository>;
  let queue: { add: jest.Mock };

  beforeEach(() => {
    repository = mockDeep<DraftRepository>();
    queue = { add: jest.fn() };
    service = new DraftService(repository, queue as never);
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

  it('claims an active draft and queues asynchronous publication', async () => {
    repository.findById
      .mockResolvedValueOnce({
        id: 'draft-id',
        ownerId: 'owner-id',
        status: DraftStatus.ACTIVE,
      } as never)
      .mockResolvedValueOnce({
        id: 'draft-id',
        ownerId: 'owner-id',
        status: DraftStatus.PUBLISHING,
      } as never);
    repository.markPublishing.mockResolvedValue({ count: 1 } as never);

    await expect(
      service.publish('draft-id', 'owner-id'),
    ).resolves.toMatchObject({
      status: DraftStatus.PUBLISHING,
    });

    expect(repository.markPublishing).toHaveBeenCalledWith(
      'draft-id',
      'owner-id',
    );
    expect(queue.add).toHaveBeenCalledWith(
      'validate-and-publish',
      { draftId: 'draft-id', ownerId: 'owner-id' },
      expect.objectContaining({ attempts: 1 }),
    );
  });

  it('requires draft-bound post media to be owned by the draft owner', async () => {
    repository.findById.mockResolvedValue({
      id: 'draft-id',
      ownerId: 'owner-id',
      status: DraftStatus.ACTIVE,
      media: [],
    } as never);
    repository.findAttachableMedia.mockResolvedValue([]);

    await expect(
      service.update('draft-id', 'owner-id', {
        mediaIds: ['media-id'],
      }),
    ).rejects.toThrow();

    expect(repository.findAttachableMedia).toHaveBeenCalledWith('owner-id', [
      'media-id',
    ]);
  });
});
