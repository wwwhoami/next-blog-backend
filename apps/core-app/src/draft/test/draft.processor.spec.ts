import { ConfigService } from '@nestjs/config';
import { DeepMockProxy, mockDeep } from 'jest-mock-extended';
import { DraftStatus, MediaTarget } from 'prisma/generated/client';
import { DraftProcessor } from '../draft.processor';
import { DraftRepository } from '../draft.repository';

describe('DraftProcessor', () => {
  let processor: DraftProcessor;
  let repository: DeepMockProxy<DraftRepository>;
  let config: DeepMockProxy<ConfigService>;

  beforeEach(() => {
    repository = mockDeep<DraftRepository>();
    repository.findVariantUrls.mockResolvedValue([]);
    config = mockDeep<ConfigService>();
    config.get.mockReturnValue('');
    processor = new DraftProcessor(repository, config);
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
    repository.publish.mockResolvedValue({ id: 1 } as never);

    await expect(
      processor.process({
        name: 'validate-and-publish',
        data: { draftId: 'draft-id', ownerId: 'owner-id' },
      } as never),
    ).resolves.toMatchObject({ id: 1 });

    expect(repository.publish).toHaveBeenCalledWith(
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
      status: DraftStatus.PUBLISHING,
      draftMedia: [],
    } as never);

    await expect(
      processor.process({
        name: 'validate-and-publish',
        data: { draftId: 'draft-id', ownerId: 'owner-id' },
      } as never),
    ).rejects.toThrow(
      'A cover image attached to the draft is required to publish',
    );

    expect(repository.markValidationFailed).toHaveBeenCalledWith(
      'draft-id',
      'A cover image attached to the draft is required to publish',
    );
  });

  it.each([
    [
      'escaped Markdown destination',
      '![Body](https://cdn.example.com/body\\(1\\).webp)',
      true,
    ],
    ['prose', 'https://cdn.example.com/body(1).webp', false],
    [
      'a code fence',
      '```markdown\n![Body](https://cdn.example.com/body(1).webp)\n```',
      false,
    ],
  ])('checks variant use in %s', async (_label, content, referenced) => {
    const cover = {
      id: 'cover-id',
      ownerId: 'owner-id',
      target: MediaTarget.POST,
      publicUrl: 'https://cdn.example.com/cover.webp',
    };
    const body = {
      id: 'body-id',
      ownerId: 'owner-id',
      target: MediaTarget.POST,
      publicUrl: 'https://cdn.example.com/body-original.webp',
    };
    repository.findById.mockResolvedValue({
      id: 'draft-id',
      ownerId: 'owner-id',
      status: DraftStatus.PUBLISHING,
      title: 'Title',
      excerpt: 'Excerpt',
      content,
      categoryNames: [],
      coverMediaId: cover.id,
      draftMedia: [{ media: body }, { media: cover }],
    } as never);
    repository.findVariantUrls.mockResolvedValue([
      {
        parentId: body.id,
        key: 'body(1).webp',
        publicUrl: 'https://cdn.example.com/body(1).webp',
      },
    ]);
    repository.publish.mockResolvedValue({ id: 1 } as never);

    const publication = processor.process({
      name: 'validate-and-publish',
      data: { draftId: 'draft-id', ownerId: 'owner-id' },
    } as never);
    if (referenced) {
      await expect(publication).resolves.toMatchObject({ id: 1 });
      expect(repository.publish).toHaveBeenCalledWith(
        'draft-id',
        'owner-id',
        expect.objectContaining({
          content,
          coverMediaId: cover.id,
          mediaIds: [body.id, cover.id],
        }),
      );
    } else {
      await expect(publication).rejects.toThrow(
        'Attached media is not referenced',
      );
      expect(repository.publish).not.toHaveBeenCalled();
    }
  });

  it('uses the draft’s attachment links', async () => {
    repository.findById.mockResolvedValue({
      id: 'draft-id',
      ownerId: 'owner-id',
      title: 'Title',
      excerpt: 'Excerpt',
      content: '# Content',
      categoryNames: [],
      coverMediaId: 'cover-id',
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
    repository.publish.mockResolvedValue({ id: 1 } as never);

    await expect(
      processor.process({
        name: 'validate-and-publish',
        data: { draftId: 'draft-id', ownerId: 'owner-id' },
      } as never),
    ).resolves.toMatchObject({ id: 1 });

    expect(repository.publish).toHaveBeenCalled();
  });

  it('accepts an inline image URL belonging to an attached original', async () => {
    repository.findById.mockResolvedValue({
      id: 'draft-id',
      ownerId: 'owner-id',
      title: 'Title',
      excerpt: 'Excerpt',
      content: '![Body](https://cdn.example.com/body.webp)',
      categoryNames: [],
      coverMediaId: 'cover-id',
      status: DraftStatus.PUBLISHING,
      draftMedia: [
        {
          media: {
            id: 'cover-id',
            ownerId: 'owner-id',
            target: MediaTarget.POST,
            publicUrl: 'https://cdn.example.com/body.webp',
            parentId: null,
          },
        },
      ],
    } as never);
    repository.publish.mockResolvedValue({ id: 1 } as never);

    await expect(
      processor.process({
        name: 'validate-and-publish',
        data: { draftId: 'draft-id', ownerId: 'owner-id' },
      } as never),
    ).resolves.toMatchObject({ id: 1 });
  });

  it.each([
    ['![Body][image]\n\n[image]: https://cdn.example.com/body.webp'],
    ['<img src="https://cdn.example.com/body.webp" />'],
  ])(
    'rejects unsupported reference-style images and raw HTML',
    async (content) => {
      repository.findById.mockResolvedValue({
        id: 'draft-id',
        ownerId: 'owner-id',
        title: 'Title',
        excerpt: 'Excerpt',
        content,
        categoryNames: [],
        coverMediaId: 'cover-id',
        status: DraftStatus.PUBLISHING,
        draftMedia: [
          {
            media: {
              id: 'cover-id',
              ownerId: 'owner-id',
              target: MediaTarget.POST,
              publicUrl: 'https://cdn.example.com/cover.webp',
              parentId: null,
            },
          },
        ],
      } as never);

      await expect(
        processor.process({
          name: 'validate-and-publish',
          data: { draftId: 'draft-id', ownerId: 'owner-id' },
        } as never),
      ).rejects.toThrow(
        'Raw HTML and reference-style Markdown images are not supported',
      );
    },
  );

  it('restores a draft after the final worker attempt fails', async () => {
    repository.markValidationFailed.mockResolvedValue({} as never);

    await processor.onFailed(
      {
        name: 'validate-and-publish',
        data: { draftId: 'draft-id', ownerId: 'owner-id' },
        attemptsMade: 3,
        opts: { attempts: 3 },
      } as never,
      new Error('Storage unavailable'),
    );

    expect(repository.markValidationFailed).toHaveBeenCalledWith(
      'draft-id',
      'Storage unavailable',
    );
  });

  it('ignores a failed worker event without a job payload', async () => {
    await expect(
      processor.onFailed(undefined, new Error('Worker unavailable')),
    ).resolves.toBeUndefined();

    expect(repository.markValidationFailed).not.toHaveBeenCalled();
  });

  it('does not restore a draft for a failed cleanup job', async () => {
    await processor.onFailed(
      {
        name: 'cleanup-archived-revisions',
        attemptsMade: 3,
        opts: { attempts: 3 },
      } as never,
      new Error('Cleanup unavailable'),
    );

    expect(repository.markValidationFailed).not.toHaveBeenCalled();
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
