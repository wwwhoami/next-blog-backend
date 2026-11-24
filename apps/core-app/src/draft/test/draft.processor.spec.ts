import { ConfigService } from '@nestjs/config';
import { DeepMockProxy, mockDeep } from 'jest-mock-extended';
import { DraftStatus, MediaTarget } from 'prisma/generated/client';
import { configValidationSchema } from '../../../../../config.schema';
import { DraftPublicationMediaService } from '../draft-publication-media.service';
import { DraftPublicationRepository } from '../draft-publication.repository';
import { DraftProcessor } from '../draft.processor';
import { DraftRepository } from '../draft.repository';

describe('DraftProcessor', () => {
  let processor: DraftProcessor;
  let publication: DeepMockProxy<DraftPublicationRepository>;
  let repository: DeepMockProxy<DraftRepository>;
  let config: DeepMockProxy<ConfigService>;

  beforeEach(() => {
    publication = mockDeep<DraftPublicationRepository>();
    repository = mockDeep<DraftRepository>();
    repository.findVariantUrls.mockResolvedValue([]);
    config = mockDeep<ConfigService>();
    config.get.mockReturnValue('');
    processor = new DraftProcessor(
      repository,
      publication,
      new DraftPublicationMediaService(repository, config),
      config,
    );
  });

  it.each(['DRAFT_REVISION_RETENTION_DAYS', 'MEDIA_UNATTACHED_RETENTION_DAYS'])(
    'validates %s at startup',
    (key) => {
      const setting = configValidationSchema.extract(key);
      expect(setting.validate(-1).error).toBeDefined();
      expect(setting.validate(0).error).toBeUndefined();
    },
  );

  it('rejects duplicate category names in a stored draft', async () => {
    repository.findById.mockResolvedValue({
      publicationAttemptId: 'attempt',
      ownerId: 'owner',
      status: DraftStatus.PUBLISHING,
      title: 'title',
      excerpt: 'excerpt',
      content: 'body',
      categoryNames: ['A', 'A'],
    } as never);
    await expect(
      processor.process({
        id: 'attempt',
        name: 'validate-and-publish',
        data: { draftId: 'id', ownerId: 'owner' },
      } as never),
    ).rejects.toThrow('duplicate category names');
    expect(publication.publish).not.toHaveBeenCalled();
  });

  it('validates and publishes a draft in the worker', async () => {
    repository.findById.mockResolvedValue({
      id: 'draft-id',
      ownerId: 'owner-id',
      title: 'Title',
      excerpt: 'Excerpt',
      content: '# Content',
      categoryNames: [],
      coverMediaId: 'cover-id',
      publicationAttemptId: 'attempt',
      status: DraftStatus.PUBLISHING,
      draftMedia: [
        {
          media: {
            id: 'cover-id',
            ownerId: 'owner-id',
            target: MediaTarget.POST,
            publicUrl: 'https://cdn.example.com/cover.webp',
          },
        },
      ],
    } as never);
    publication.publish.mockResolvedValue({ id: 1 } as never);

    await expect(
      processor.process({
        id: 'attempt',
        name: 'validate-and-publish',
        data: { draftId: 'draft-id', ownerId: 'owner-id' },
      } as never),
    ).resolves.toMatchObject({ id: 1 });

    expect(publication.publish).toHaveBeenCalledWith(
      'draft-id',
      'owner-id',
      expect.objectContaining({
        coverImage: 'https://cdn.example.com/cover.webp',
      }),
    );
  });

  it('records validation failures and leaves the draft active', async () => {
    repository.findById.mockResolvedValue({
      id: 'draft-id',
      ownerId: 'owner-id',
      title: 'Title',
      excerpt: 'Excerpt',
      content: '# Content',
      categoryNames: [],
      coverMediaId: null,
      publicationAttemptId: 'attempt',
      status: DraftStatus.PUBLISHING,
      draftMedia: [],
    } as never);

    await expect(
      processor.process({
        id: 'attempt',
        name: 'validate-and-publish',
        data: { draftId: 'draft-id', ownerId: 'owner-id' },
      } as never),
    ).rejects.toThrow(
      'A cover image attached to the draft is required to publish',
    );

    expect(publication.markValidationFailed).toHaveBeenCalledWith(
      'draft-id',
      'attempt',
      'A cover image attached to the draft is required to publish',
    );
  });

  it('restores a draft after the final worker attempt fails', async () => {
    publication.markValidationFailed.mockResolvedValue({} as never);

    await processor.onFailed(
      {
        id: 'attempt',
        name: 'validate-and-publish',
        data: { draftId: 'draft-id', ownerId: 'owner-id' },
        attemptsMade: 1,
        getState: async () => 'failed',
        opts: { attempts: 3 },
      } as never,
      new Error('Storage unavailable'),
    );

    expect(publication.markValidationFailed).toHaveBeenCalledWith(
      'draft-id',
      'attempt',
      'Publication failed. Please publish again.',
    );
  });

  it('leaves recovery to reconciliation if the failure update rejects', async () => {
    publication.markValidationFailed.mockRejectedValue(
      new Error('Database unavailable'),
    );
    const job = {
      id: 'attempt',
      name: 'validate-and-publish',
      data: { draftId: 'draft-id' },
      getState: async () => 'failed',
    };
    await expect(
      processor.onFailed(job as never, new Error('Worker failed')),
    ).resolves.toBeUndefined();
    expect(publication.markValidationFailed).toHaveBeenCalledTimes(1);
  });

  it('ignores a failed worker event without a job payload', async () => {
    await expect(
      processor.onFailed(undefined, new Error('Worker unavailable')),
    ).resolves.toBeUndefined();

    expect(publication.markValidationFailed).not.toHaveBeenCalled();
  });

  it('does not restore a draft for a failed cleanup job', async () => {
    await processor.onFailed(
      {
        name: 'cleanup-archived-revisions',
        attemptsMade: 1,
        getState: async () => 'failed',
        opts: { attempts: 3 },
      } as never,
      new Error('Cleanup unavailable'),
    );

    expect(publication.markValidationFailed).not.toHaveBeenCalled();
  });

  it('deletes archived revisions older than the configured retention period', async () => {
    config.get.mockImplementation((key: string) =>
      key === 'DRAFT_REVISION_RETENTION_DAYS' ? 14 : '',
    );
    repository.deleteArchivedBefore.mockResolvedValue({
      count: 2,
    } as never);
    repository.archiveInactiveRevisionsBefore.mockResolvedValue({
      count: 1,
    } as never);
    const now = Date.now();
    jest.spyOn(Date, 'now').mockReturnValue(now);

    await expect(
      processor.process({
        name: 'cleanup-archived-revisions',
        data: {},
      } as never),
    ).resolves.toEqual({ count: 2 });

    expect(repository.deleteArchivedBefore).toHaveBeenCalledWith(
      new Date(now - 14 * 24 * 60 * 60 * 1000),
    );
    expect(repository.archiveInactiveRevisionsBefore).toHaveBeenCalledWith(
      new Date(now - 14 * 24 * 60 * 60 * 1000),
    );
    jest.restoreAllMocks();
  });
});
