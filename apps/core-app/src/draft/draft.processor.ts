import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job, UnrecoverableError } from 'bullmq';
import { maxLength } from 'class-validator';
import { DraftStatus, MediaTarget, Prisma } from 'prisma/generated/client';
import { ManagedMedia } from '../media/util/managed-media';
import { markdownImages } from '../media/util/markdown-images';
import { postConflictMessage } from '../post/post-conflict';
import { postSlug } from '../post/post-slug';
import {
  MAX_DRAFT_CONTENT_LENGTH,
  MAX_DRAFT_IMAGE_REFERENCES,
} from './constants/draft-content.constants';
import {
  CLEANUP_ARCHIVED_REVISIONS_JOB,
  DRAFT_PROCESSOR_QUEUE,
  DraftPublishJobData,
  VALIDATE_AND_PUBLISH_JOB,
} from './constants/draft-processor.constants';
import { DraftRepository } from './draft.repository';
import { effectiveMedia } from './effective-media';

/**
 * Processes asynchronous draft publication jobs.
 *
 * The API marks a draft as `PUBLISHING` before enqueueing a job. This worker
 * re-reads the draft, validates its publish requirements and Markdown image
 * references, then delegates the transactional post creation to the
 * repository. Validation failures restore the draft to `ACTIVE` and persist
 * the error so the client can correct and retry the draft.
 */
@Injectable()
@Processor(DRAFT_PROCESSOR_QUEUE)
export class DraftProcessor extends WorkerHost {
  private readonly managedMedia: ManagedMedia;
  private readonly externalHosts: Set<string>;
  private readonly logger = new Logger(DraftProcessor.name);

  /**
   * Builds the worker with persistence and the configured external image hosts.
   *
   * Only HTTPS image URLs from this allowlist may be referenced externally;
   * URLs belonging to media attached to the draft are accepted directly.
   *
   * @param repo Draft persistence and publication transaction boundary.
   * @param configService Provides the external image host allowlist.
   */
  constructor(
    private readonly repo: DraftRepository,
    private readonly configService: ConfigService,
  ) {
    super();
    this.managedMedia = new ManagedMedia(configService);
    this.externalHosts = new Set(
      (configService.get<string>('EXTERNAL_MEDIA_DOMAINS') ?? '')
        .split(',')
        .map((host) => host.trim().toLowerCase())
        .filter(Boolean),
    );
  }

  /**
   * Dispatches supported BullMQ jobs to the publication workflow.
   *
   * Unknown job names are ignored so that this processor can safely share its
   * queue with future draft-related jobs.
   *
   * @param job - The queued draft job and its draft ownership payload.
   * @returns The created or updated post for a publication job, or `undefined`
   * otherwise.
   * @throws {NotFoundException} If the queued draft no longer exists or is not
   * owned by the job owner.
   * @throws {ConflictException} If the draft is no longer publishing.
   * @throws {UnprocessableEntityException} If draft content or media is invalid.
   */
  async process(job: Job<DraftPublishJobData>) {
    if (job.name === CLEANUP_ARCHIVED_REVISIONS_JOB) {
      const retentionDays = Number(
        this.configService.get<number>('DRAFT_REVISION_RETENTION_DAYS') ?? 30,
      );
      const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
      await this.repo.archiveInactiveRevisionsBefore(cutoff);

      return this.repo.deleteArchivedBefore(
        retentionDays === 0 ? new Date() : cutoff,
      );
    }

    if (job.name === VALIDATE_AND_PUBLISH_JOB) {
      if (!job.id) throw new UnrecoverableError('Missing publication attempt');
      return this.publish(job.data.draftId, job.data.ownerId, job.id);
    }

    return;
  }

  /**
   * Restores a draft after all queue attempts are exhausted.
   *
   * Validation failures are restored by `publish` immediately. This handler
   * covers worker or infrastructure failures that occur outside validation.
   *
   * @param job - The failed publication job.
   * @param error - The final worker error.
   */
  @OnWorkerEvent('failed')
  async onFailed(job: Job<DraftPublishJobData> | undefined, error: Error) {
    if (!job) {
      this.logger.error(
        `Draft publication failed without a job payload: ${error.message}`,
      );
      return;
    }
    if (job.name !== VALIDATE_AND_PUBLISH_JOB) return;
    if (!job.id) return;

    const { draftId } = job.data;
    const context = `draft ${draftId}, attempt ${job.id}`;
    try {
      if ((await job.getState()) !== 'failed') return;
      this.logger.error(
        `Publication failed for ${context}`,
        error.stack ?? error.message,
      );
      await this.repo.markValidationFailed(
        draftId,
        job.id,
        'Publication failed. Please publish again.',
      );
    } catch (recoveryError) {
      this.logger.error(`Could not recover ${context}`, recoveryError);
    }
  }

  /**
   * Validates and publishes one claimed draft.
   *
   * The draft must still belong to the job owner and remain in the
   * `PUBLISHING` state. The repository owns the final transaction that creates
   * or updates the post, transfers media, and archives the draft. Validation
   * failures are persisted and made unrecoverable; infrastructure failures
   * are rethrown for bounded BullMQ retries and final-failure recovery.
   *
   * @param id Draft identifier from the queued job.
   * @param ownerId Expected draft owner from the queued job.
   * @returns The newly created post.
   * @throws {NotFoundException} If the draft does not exist or has another
   * owner.
   * @throws {ConflictException} If the draft is not in `PUBLISHING` state.
   * @throws {UnprocessableEntityException} If required fields, cover media, or
   * Markdown image references are invalid.
   * @throws {UnrecoverableError} For non-retryable validation conflicts.
   */
  private async publish(
    id: string,
    ownerId: string,
    publicationAttemptId: string,
  ) {
    try {
      const draft = await this.loadPublishableDraft(
        id,
        ownerId,
        publicationAttemptId,
      );
      const media = await this.preparePublicationMedia(draft);
      const { title, excerpt, content, categoryNames } = draft;
      const data = {
        publicationAttemptId,
        title,
        excerpt,
        content,
        categoryNames,
        ...media,
      };

      if (draft.postId == null) {
        return await this.repo.publish(id, ownerId, {
          ...data,
          slug: postSlug(title),
        });
      }
      if (draft.sourceVersion === null) {
        throw new ConflictException('Revision source version is missing');
      }

      return await this.repo.publishRevision(id, ownerId, {
        ...data,
        postId: draft.postId,
        sourceVersion: draft.sourceVersion,
      });
    } catch (error) {
      let message: string;
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        message = postConflictMessage(error);
      } else if (
        error instanceof BadRequestException ||
        error instanceof NotFoundException ||
        error instanceof ConflictException ||
        error instanceof UnprocessableEntityException
      ) {
        message = error.message;
      } else {
        throw error;
      }
      await this.repo.markValidationFailed(id, publicationAttemptId, message);
      throw new UnrecoverableError(message);
    }
  }

  private async loadPublishableDraft(
    id: string,
    ownerId: string,
    publicationAttemptId: string,
  ) {
    const draft = await this.repo.findById(id);

    if (!draft || draft.ownerId !== ownerId) {
      throw new NotFoundException('Draft not found');
    }
    if (
      draft.status !== DraftStatus.PUBLISHING ||
      draft.publicationAttemptId !== publicationAttemptId
    ) {
      throw new ConflictException('Draft is no longer publishing');
    }
    if (!draft.title.trim() || !draft.excerpt.trim() || !draft.content.trim()) {
      throw new UnprocessableEntityException(
        'Title, excerpt, and content are required to publish',
      );
    }
    if (new Set(draft.categoryNames).size !== draft.categoryNames.length)
      throw new UnprocessableEntityException(
        'Remove duplicate category names before publishing',
      );
    if (draft.sourceVersion != null && draft.postId == null)
      throw new ConflictException('Source post was deleted');

    return draft;
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
  private async preparePublicationMedia(
    draft: NonNullable<Awaited<ReturnType<DraftRepository['findById']>>>,
  ) {
    const { ownerId } = draft;
    const originals = effectiveMedia(draft);
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
