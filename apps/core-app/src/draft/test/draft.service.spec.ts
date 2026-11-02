import {
  ConflictException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DeepMockProxy, mockDeep } from 'jest-mock-extended';
import { DraftStatus } from 'prisma/generated/client';
import {
  MAX_DRAFT_CONTENT_LENGTH,
  MAX_DRAFT_IMAGE_REFERENCES,
} from '../constants/draft-content.constants';
import { DraftRepository } from '../draft.repository';
import { DraftService } from '../draft.service';

describe('DraftService', () => {
  let service: DraftService;
  let repository: DeepMockProxy<DraftRepository>;
  let config: DeepMockProxy<ConfigService>;

  beforeEach(() => {
    repository = mockDeep<DraftRepository>();
    config = mockDeep<ConfigService>();
    config.get.mockReturnValue('');
    service = new DraftService(repository, config);
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

  it('rejects content above the parsing size limit', () => {
    expect(() =>
      (service as any).validateMarkdownImages(
        'x'.repeat(MAX_DRAFT_CONTENT_LENGTH + 1),
        [],
      ),
    ).toThrow(
      `Content exceeds the maximum length of ${MAX_DRAFT_CONTENT_LENGTH} characters`,
    );
  });

  it('rejects content with too many image references', () => {
    const media = Array.from(
      { length: MAX_DRAFT_IMAGE_REFERENCES + 1 },
      (_, index) => ({ publicUrl: `https://example.com/${index}.png` }),
    );
    const content = Array.from(
      { length: MAX_DRAFT_IMAGE_REFERENCES + 1 },
      (_, index) => `![image](https://example.com/${index}.png)`,
    ).join('\n');

    expect(() =>
      (service as any).validateMarkdownImages(content, media),
    ).toThrow(
      `Content exceeds the maximum of ${MAX_DRAFT_IMAGE_REFERENCES} image references`,
    );
  });
});
