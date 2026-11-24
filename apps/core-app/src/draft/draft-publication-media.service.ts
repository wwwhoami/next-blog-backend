import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { maxLength } from 'class-validator';
import { MediaTarget } from 'prisma/generated/client';
import { ManagedMedia } from '../media/util/managed-media';
import { markdownImages } from '../media/util/markdown-images';
import {
  MAX_DRAFT_CONTENT_LENGTH,
  MAX_DRAFT_IMAGE_REFERENCES,
} from './constants/draft-content.constants';
import { getAttachedDraftMedia } from './draft-attached-media';
import { DraftRepository } from './draft.repository';

@Injectable()
export class DraftPublicationMediaService {
  private readonly managedMedia: ManagedMedia;
  private readonly externalHosts: Set<string>;
  constructor(
    private readonly repo: DraftRepository,
    configService: ConfigService,
  ) {
    this.managedMedia = new ManagedMedia(configService);
    this.externalHosts = new Set(
      (configService.get<string>('EXTERNAL_MEDIA_DOMAINS') ?? '')
        .split(',')
        .map((host) => host.trim().toLowerCase())
        .filter(Boolean),
    );
  }

  /**
   * Validates draft image references and selects the cover URL for publication.
   * A revision keeps its source post's cover URL when it matches a variant of
   * the selected cover. Otherwise, publication uses the original cover URL.
   *
   * @param draft - Draft with its attached originals and optional source post.
   * @returns The attached original IDs, selected cover ID, and cover URL.
   * @throws {UnprocessableEntityException} If the cover is not an attached
   * post image owned by the author, Markdown image validation fails, or a
   * non-cover attachment is unreferenced by either its original or variant URL.
   */
  async prepare(
    draft: NonNullable<Awaited<ReturnType<DraftRepository['findById']>>>,
  ) {
    const { ownerId } = draft;
    const originals = getAttachedDraftMedia(draft);
    const mediaIds = originals.map(({ id }) => id);
    const cover = originals.find(
      (media) =>
        media.id === draft.coverMediaId &&
        media.ownerId === ownerId &&
        media.target === MediaTarget.POST,
    );

    if (!cover) {
      throw new UnprocessableEntityException(
        'A cover image attached to the draft is required to publish',
      );
    }

    const variants = await this.repo.findVariantUrls(mediaIds);
    const ownedIds = new Set(
      originals
        .filter(
          (media) =>
            media.ownerId === ownerId && media.target === MediaTarget.POST,
        )
        .map(({ id }) => id),
    );
    const imageUrls = this.validateMarkdownImages(draft.content, [
      ...originals.map((media) => ({
        ...media,
        owned: ownedIds.has(media.id),
      })),
      ...variants.map((media) => ({
        ...media,
        owned: media.parentId != null && ownedIds.has(media.parentId),
      })),
    ]);

    for (const media of originals) {
      if (
        media.id !== draft.coverMediaId &&
        !imageUrls.has(media.publicUrl) &&
        !variants.some(
          (variant) =>
            variant.parentId === media.id && imageUrls.has(variant.publicUrl),
        )
      ) {
        throw new UnprocessableEntityException(
          `Attached media is not referenced by the draft: ${media.id}`,
        );
      }
    }

    const sourceCover =
      draft.postId != null ? draft.post?.coverImage : undefined;
    const sourceKey = sourceCover && this.managedMedia.key(sourceCover);
    const keepsSourceCover =
      sourceCover &&
      variants.some(
        (variant) =>
          variant.parentId === cover.id &&
          (variant.publicUrl === sourceCover ||
            (sourceKey !== undefined && variant.key === sourceKey)),
      );

    return {
      mediaIds,
      coverMediaId: cover.id,
      coverImage: keepsSourceCover ? sourceCover : cover.publicUrl,
    };
  }

  /**
   * Validates parsed inline Markdown image nodes without rendering Markdown.
   *
   * Internal URLs must match media attached to the draft. Other URLs must be
   * valid HTTPS URLs whose hostname is configured in the external allowlist.
   * Size and reference-count limits keep this synchronous validation bounded.
   *
   * @param content - Draft Markdown content to inspect.
   * @param media - Media currently attached to the draft.
   * @returns The parsed image destinations.
   * @throws {UnprocessableEntityException} When a reference is invalid,
   * detached, disallowed, or exceeds a configured limit.
   */
  private validateMarkdownImages(
    content: string,
    media: { publicUrl: string; key?: string; owned: boolean }[],
  ) {
    const urls = this.parseMarkdownImageUrls(content);
    const ownedMedia = media.filter(({ owned }) => owned);
    const knownUrls = new Set(ownedMedia.map(({ publicUrl }) => publicUrl));
    const ownedKeys = new Map(
      ownedMedia.map(({ key, publicUrl }) => [
        key ?? this.managedMedia.key(publicUrl),
        publicUrl,
      ]),
    );

    return new Set(
      urls.map((url) => this.resolveImageUrl(url, ownedKeys, knownUrls)),
    );
  }

  private parseMarkdownImageUrls(content: string) {
    if (!maxLength(content, MAX_DRAFT_CONTENT_LENGTH)) {
      throw new UnprocessableEntityException(
        `Content exceeds the maximum length of ${MAX_DRAFT_CONTENT_LENGTH} characters`,
      );
    }

    let parsed: ReturnType<typeof markdownImages>;
    try {
      parsed = markdownImages(content);
    } catch {
      throw new UnprocessableEntityException('Invalid Markdown content');
    }
    if (parsed.hasHtml || parsed.hasReferenceSyntax) {
      throw new UnprocessableEntityException(
        'Raw HTML and reference-style Markdown images are not supported',
      );
    }
    if (parsed.urls.length > MAX_DRAFT_IMAGE_REFERENCES) {
      throw new UnprocessableEntityException(
        `Content exceeds the maximum of ${MAX_DRAFT_IMAGE_REFERENCES} image references`,
      );
    }
    return parsed.urls;
  }

  private resolveImageUrl(
    rawUrl: string,
    ownedKeys: ReadonlyMap<string | undefined, string>,
    knownUrls: ReadonlySet<string>,
  ): string {
    if (!rawUrl) {
      throw new UnprocessableEntityException(
        'Image URL is required in Markdown',
      );
    }

    const key = this.managedMedia.key(rawUrl);
    if (key !== undefined) {
      const publicUrl = ownedKeys.get(key);
      if (!publicUrl) {
        throw new UnprocessableEntityException(
          `Image URL is not attached media or an allowed external host: ${rawUrl}`,
        );
      }
      return publicUrl;
    }

    let url: URL;
    try {
      url = new URL(rawUrl);
    } catch {
      throw new UnprocessableEntityException(
        `Invalid image URL in Markdown: ${rawUrl}`,
      );
    }

    if (knownUrls.has(rawUrl)) return rawUrl;
    if (
      url.protocol !== 'https:' ||
      !this.externalHosts.has(url.hostname.toLowerCase())
    ) {
      throw new UnprocessableEntityException(
        `Image URL is not attached media or an allowed external host: ${rawUrl}`,
      );
    }

    return rawUrl;
  }
}
