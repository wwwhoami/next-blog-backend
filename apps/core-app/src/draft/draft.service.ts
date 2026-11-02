import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DraftStatus, MediaTarget } from 'prisma/generated/client';
import slugify from 'slugify';
import {
  MAX_DRAFT_CONTENT_LENGTH,
  MAX_DRAFT_IMAGE_REFERENCES,
} from './constants/draft-content.constants';
import { DraftRepository } from './draft.repository';
import { CreateDraftDto } from './dto/create-draft.dto';
import { UpdateDraftDto } from './dto/update-draft.dto';

const imagePattern = /!\[[^\]]*]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;

@Injectable()
export class DraftService {
  private readonly externalHosts: Set<string>;

  constructor(
    private readonly repo: DraftRepository,
    configService: ConfigService,
  ) {
    this.externalHosts = new Set(
      (configService.get<string>('EXTERNAL_MEDIA_DOMAINS') ?? '')
        .split(',')
        .map((host) => host.trim().toLowerCase())
        .filter(Boolean),
    );
  }

  getAuthorId(id: string): Promise<{ authorId: string }> {
    return this.repo.getAuthorId(id);
  }

  list(ownerId: string) {
    return this.repo.findMany(ownerId);
  }

  async get(id: string, ownerId: string) {
    const draft = await this.repo.findById(id);
    if (!draft || draft.ownerId !== ownerId) {
      throw new NotFoundException('Draft not found');
    }

    return draft;
  }

  create(ownerId: string, dto: CreateDraftDto) {
    return this.repo.create(ownerId, {
      title: dto.title ?? '',
      excerpt: dto.excerpt ?? '',
      content: dto.content ?? '',
      categoryNames: dto.categoryNames ?? [],
    });
  }

  /**
   * Saves draft fields and synchronizes its media relationships.
   *
   * Media IDs are validated against the authenticated owner before attachment,
   * while cover selection is stored separately through the draft's
   * `coverMediaId` relationship. This keeps media ownership and cover
   * designation consistent before the draft content is persisted.
   */
  async update(id: string, ownerId: string, dto: UpdateDraftDto) {
    const draft = await this.get(id, ownerId);
    const { mediaIds, ...draftData } = dto;

    if (mediaIds) {
      await this.syncMedia(id, ownerId, mediaIds);
    }

    if (dto.coverMediaId !== undefined) {
      await this.setCoverMedia(id, ownerId, dto.coverMediaId);
    }

    return this.repo.update(draft.id, draftData);
  }

  /**
   * Validates and publishes an active draft as a complete post.
   *
   * Publishing requires complete text fields, an attached POST cover asset,
   * and valid Markdown image references. The repository then creates the post,
   * transfers the draft's media, and archives the draft in one transaction.
   * Archived drafts are rejected to prevent duplicate post creation.
   */
  async publish(id: string, ownerId: string) {
    const draft = await this.get(id, ownerId);
    if (draft.status !== DraftStatus.ACTIVE) {
      throw new ConflictException('Draft has already been published');
    }

    if (!draft.title.trim() || !draft.excerpt.trim() || !draft.content.trim()) {
      throw new UnprocessableEntityException(
        'Title, excerpt, and content are required to publish',
      );
    }

    const cover = draft.media.find(
      (media) =>
        media.id === draft.coverMediaId && media.target === MediaTarget.POST,
    );
    if (!cover) {
      throw new UnprocessableEntityException(
        'A cover image attached to the draft is required to publish',
      );
    }

    this.validateMarkdownImages(draft.content, draft.media);

    return this.repo.publish(draft.id, ownerId, {
      title: draft.title,
      slug: slugify(draft.title, { lower: true }),
      excerpt: draft.excerpt,
      content: draft.content,
      coverImage: cover.publicUrl,
      categoryNames: draft.categoryNames,
    });
  }

  private async syncMedia(id: string, ownerId: string, mediaIds: string[]) {
    const media = await this.repo.findAttachableMedia(ownerId, mediaIds);
    if (media.length !== mediaIds.length) {
      throw new BadRequestException('One or more media assets are invalid');
    }

    await this.repo.attachMedia(id, mediaIds);
  }

  private async setCoverMedia(
    id: string,
    ownerId: string,
    coverMediaId: string | null,
  ) {
    if (!coverMediaId) {
      await this.repo.clearCoverMedia(id);
      return;
    }

    const media = await this.repo.findCoverCandidate(id, ownerId, coverMediaId);
    if (!media) {
      throw new BadRequestException(
        'Cover media must be attached to the draft',
      );
    }

    await this.repo.setCoverMedia(id, coverMediaId);
  }

  private validateMarkdownImages(
    content: string,
    media: { publicUrl: string }[],
  ) {
    if (content.length > MAX_DRAFT_CONTENT_LENGTH) {
      throw new UnprocessableEntityException(
        `Content exceeds the maximum length of ${MAX_DRAFT_CONTENT_LENGTH} characters`,
      );
    }

    const knownUrls = new Set(media.map(({ publicUrl }) => publicUrl));
    let imageReferenceCount = 0;
    for (const match of content.matchAll(imagePattern)) {
      imageReferenceCount += 1;
      if (imageReferenceCount > MAX_DRAFT_IMAGE_REFERENCES) {
        throw new UnprocessableEntityException(
          `Content exceeds the maximum of ${MAX_DRAFT_IMAGE_REFERENCES} image references`,
        );
      }

      const rawUrl = match[1];
      let url: URL;
      try {
        url = new URL(rawUrl);
      } catch {
        throw new UnprocessableEntityException(
          `Invalid image URL in Markdown: ${rawUrl}`,
        );
      }

      if (knownUrls.has(rawUrl)) continue;
      if (
        url.protocol !== 'https:' ||
        !this.externalHosts.has(url.hostname.toLowerCase())
      ) {
        throw new UnprocessableEntityException(
          `Image URL is not attached media or an allowed external host: ${rawUrl}`,
        );
      }
    }
  }
}
