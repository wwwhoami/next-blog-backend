import { BadRequestException, ConflictException } from '@nestjs/common';
import { DeepMockProxy, mockDeep } from 'jest-mock-extended';
import { DraftStatus } from 'prisma/generated/client';
import { DraftRepository } from '../draft.repository';
import { DraftService } from '../draft.service';

describe('DraftService', () => {
  let service: DraftService;
  let repository: DeepMockProxy<DraftRepository>;
  let queue: { add: jest.Mock; getJobState: jest.Mock; getJob: jest.Mock };

  beforeEach(() => {
    repository = mockDeep<DraftRepository>();
    queue = { add: jest.fn(), getJobState: jest.fn(), getJob: jest.fn() };
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
      .mockResolvedValue({
        id: 'draft-id',
        ownerId: 'owner-id',
        status: DraftStatus.ARCHIVED,
      } as never);
    repository.markPublishing.mockResolvedValue({
      status: DraftStatus.PUBLISHING,
    } as never);

    await expect(
      service.publish('draft-id', 'owner-id'),
    ).resolves.toMatchObject({
      status: DraftStatus.PUBLISHING,
    });

    expect(repository.markPublishing).toHaveBeenCalledWith(
      'draft-id',
      'owner-id',
      expect.any(String),
    );
    expect(queue.add).toHaveBeenCalledWith(
      'validate-and-publish',
      { draftId: 'draft-id', ownerId: 'owner-id' },
      expect.objectContaining({
        attempts: 3,
        jobId: repository.markPublishing.mock.calls[0][2],
      }),
    );
  });

  it('preserves the claim after an ambiguous enqueue acknowledgment', async () => {
    repository.findById.mockResolvedValue({
      ownerId: 'owner',
      status: DraftStatus.ACTIVE,
    } as never);
    repository.markPublishing.mockResolvedValue({
      status: DraftStatus.PUBLISHING,
    } as never);
    queue.add.mockRejectedValue(new Error('connection lost'));
    await expect(service.publish('draft', 'owner')).rejects.toThrow(
      'connection lost',
    );
    expect(repository.markValidationFailed).not.toHaveBeenCalled();
  });

  it('preserves claims while Redis state is unavailable or the enqueue grace period is open', async () => {
    repository.pendingClaims.mockResolvedValue([
      { id: 'old', publicationAttemptId: 'a', updatedAt: new Date(0) },
      { id: 'new', publicationAttemptId: 'b', updatedAt: new Date() },
    ]);
    queue.getJobState
      .mockRejectedValueOnce(new Error('Redis unavailable'))
      .mockResolvedValueOnce('unknown');
    await service.reconcile();
    expect(repository.markValidationFailed).not.toHaveBeenCalled();
    expect(queue.getJob).not.toHaveBeenCalled();
  });

  it('requires draft-bound post media to be owned by the draft owner', async () => {
    repository.findById.mockResolvedValue({
      id: 'draft-id',
      ownerId: 'owner-id',
      status: DraftStatus.ACTIVE,
      media: [],
    } as never);
    repository.attachMedia.mockRejectedValue(new BadRequestException());

    await expect(
      service.update('draft-id', 'owner-id', {
        mediaIds: ['media-id'],
      }),
    ).rejects.toThrow();

    expect(repository.attachMedia).toHaveBeenCalledWith(
      'draft-id',
      'owner-id',
      ['media-id'],
      {},
      undefined,
    );
  });

  it('preserves revision media in update responses', async () => {
    repository.findById.mockResolvedValue({
      id: 'revision-id',
      ownerId: 'owner-id',
      postId: 7,
      sourceVersion: 0,
      status: DraftStatus.ACTIVE,
      draftMedia: [
        { media: { id: 'uploaded' } },
        { media: { id: 'media-id' } },
      ],
    } as never);
    repository.attachMedia.mockResolvedValue({
      id: 'revision-id',
      ownerId: 'owner-id',
      postId: 7,
      sourceVersion: 0,
      status: DraftStatus.ACTIVE,
      draftMedia: [
        { media: { id: 'uploaded' } },
        { media: { id: 'media-id' } },
      ],
    } as never);

    await expect(
      service.update('revision-id', 'owner-id', { title: 'Updated title' }),
    ).resolves.toEqual(
      expect.objectContaining({
        revisionMode: 'REVISION',
        effectiveMedia: [{ id: 'uploaded' }, { id: 'media-id' }],
      }),
    );
  });
});
