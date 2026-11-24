import { ConfigService } from '@nestjs/config';
import { DeepMockProxy, mockDeep } from 'jest-mock-extended';
import { DraftStatus, MediaTarget } from 'prisma/generated/client';
import { DraftPublicationMediaService } from '../draft-publication-media.service';
import { DraftRepository } from '../draft.repository';

describe('DraftPublicationMediaService', () => {
  let service: DraftPublicationMediaService;
  let repository: DeepMockProxy<DraftRepository>;
  let config: DeepMockProxy<ConfigService>;

  beforeEach(() => {
    repository = mockDeep<DraftRepository>();
    repository.findVariantUrls.mockResolvedValue([]);
    config = mockDeep<ConfigService>();
    config.get.mockReturnValue('');
    service = new DraftPublicationMediaService(repository, config);
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
    const draft = {
      id: 'draft-id',
      ownerId: 'owner-id',
      publicationAttemptId: 'attempt',
      status: DraftStatus.PUBLISHING,
      title: 'Title',
      excerpt: 'Excerpt',
      content,
      categoryNames: [],
      coverMediaId: cover.id,
      draftMedia: [{ media: body }, { media: cover }],
    } as never;
    repository.findVariantUrls.mockResolvedValue([
      {
        parentId: body.id,
        key: 'body(1).webp',
        publicUrl: 'https://cdn.example.com/body(1).webp',
      },
    ]);

    const publication = service.prepare(draft);
    if (referenced) {
      await expect(publication).resolves.toMatchObject({
        coverMediaId: cover.id,
        mediaIds: [body.id, cover.id],
      });
    } else {
      await expect(publication).rejects.toThrow(
        'Attached media is not referenced',
      );
    }
  });

  it('uses the draft’s attachment links', async () => {
    const draft = {
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
    } as never;

    await expect(service.prepare(draft)).resolves.toMatchObject({
      coverMediaId: 'cover-id',
    });
  });

  it('accepts an inline image URL belonging to an attached original', async () => {
    const draft = {
      id: 'draft-id',
      ownerId: 'owner-id',
      title: 'Title',
      excerpt: 'Excerpt',
      content: '![Body](https://cdn.example.com/body.webp)',
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
            publicUrl: 'https://cdn.example.com/body.webp',
            parentId: null,
          },
        },
      ],
    } as never;

    await expect(service.prepare(draft)).resolves.toMatchObject({
      coverMediaId: 'cover-id',
    });
  });

  it.each([
    ['![Body][image]\n\n[image]: https://cdn.example.com/body.webp'],
    ['<img src="https://cdn.example.com/body.webp" />'],
  ])(
    'rejects unsupported reference-style images and raw HTML',
    async (content) => {
      const draft = {
        id: 'draft-id',
        ownerId: 'owner-id',
        title: 'Title',
        excerpt: 'Excerpt',
        content,
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
              parentId: null,
            },
          },
        ],
      } as never;

      await expect(service.prepare(draft)).rejects.toThrow(
        'Raw HTML and reference-style Markdown images are not supported',
      );
    },
  );
});
