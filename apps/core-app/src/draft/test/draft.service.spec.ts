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

  it('creates an owned post revision and exposes revision metadata', async () => {
    repository.createRevision.mockResolvedValue({
      id: 'revision-id',
      ownerId: 'owner-id',
      postId: 7,
      sourceVersion: 3,
      status: DraftStatus.ACTIVE,
      draftMedia: [],
      media: [],
    } as never);

    await expect(service.createRevision(7, 'owner-id')).resolves.toMatchObject({
      id: 'revision-id',
      revisionMode: 'REVISION',
      effectiveMedia: [],
    });
    expect(repository.createRevision).toHaveBeenCalledWith('owner-id', 7);
  });

  it('returns a structured conflict when a revision is publishing', async () => {
    repository.createRevision.mockResolvedValue({
      id: 'revision-id',
      ownerId: 'owner-id',
      postId: 7,
      status: DraftStatus.PUBLISHING,
    } as never);

    await expect(service.createRevision(7, 'owner-id')).rejects.toMatchObject({
      response: {
        draftId: 'revision-id',
        status: DraftStatus.PUBLISHING,
      },
    });
  });

  it('rejects revision creation when the post is not owned or missing', async () => {
    repository.createRevision.mockResolvedValue(null);

    await expect(service.createRevision(7, 'owner-id')).rejects.toThrow(
      'Post not found',
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
      expect.objectContaining({ attempts: 3 }),
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

  it('preserves revision media in update responses', async () => {
    repository.findById.mockResolvedValue({
      id: 'revision-id',
      ownerId: 'owner-id',
      postId: 7,
      status: DraftStatus.ACTIVE,
      draftMedia: [{ media: { id: 'media-id' } }],
      media: [],
    } as never);
    repository.update.mockResolvedValue({
      id: 'revision-id',
      ownerId: 'owner-id',
      postId: 7,
      status: DraftStatus.ACTIVE,
      draftMedia: [{ media: { id: 'media-id' } }],
      media: [],
    } as never);

    await expect(
      service.update('revision-id', 'owner-id', { title: 'Updated title' }),
    ).resolves.toEqual(
      expect.objectContaining({
        revisionMode: 'REVISION',
        effectiveMedia: [{ id: 'media-id' }],
      }),
    );
  });
});
