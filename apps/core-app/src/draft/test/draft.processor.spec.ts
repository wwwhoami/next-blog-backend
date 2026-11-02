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
      media: [
        {
          id: 'cover-id',
          target: MediaTarget.POST,
          publicUrl: 'https://cdn.example.com/cover.webp',
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
      media: [],
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
});
