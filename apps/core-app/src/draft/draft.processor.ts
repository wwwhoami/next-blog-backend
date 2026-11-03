import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job, UnrecoverableError } from 'bullmq';
import { DraftStatus, MediaTarget, Prisma } from 'prisma/generated/client';
import slugify from 'slugify';
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

const imagePattern = /!\[[^\]]*]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;

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
      return this.repo.deleteArchivedBefore(cutoff);
    }

    if (job.name === VALIDATE_AND_PUBLISH_JOB) {
      return this.publish(job.data.draftId, job.data.ownerId);
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

    const attempts = job.opts.attempts ?? 1;
    if (job.attemptsMade < attempts) return;

    await this.repo.markValidationFailed(
      job.data.draftId,
      error.message || 'Draft publication failed',
    );
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
  private async publish(id: string, ownerId: string) {
    try {
      const draft = await this.repo.findById(id);
      if (!draft || draft.ownerId !== ownerId) {
        throw new NotFoundException('Draft not found');
      }
      if (draft.status !== DraftStatus.PUBLISHING) {
        throw new ConflictException('Draft is no longer publishing');
      }
      if (
        !draft.title.trim() ||
        !draft.excerpt.trim() ||
        !draft.content.trim()
      ) {
        throw new UnprocessableEntityException(
          'Title, excerpt, and content are required to publish',
        );
      }

      const revisionMedia = draft.draftMedia?.map(({ media }) => media) ?? [];
      const effectiveMedia = revisionMedia.length ? revisionMedia : draft.media;
      const cover = effectiveMedia.find(
        (media) =>
          media.id === draft.coverMediaId && media.target === MediaTarget.POST,
      );
      if (!cover) {
        throw new UnprocessableEntityException(
          'A cover image attached to the draft is required to publish',
        );
      }

      this.validateMarkdownImages(draft.content, effectiveMedia);
      for (const media of effectiveMedia) {
        if (
          media.id !== draft.coverMediaId &&
          !draft.content.includes(media.publicUrl)
        ) {
          throw new UnprocessableEntityException(
            `Attached media is not referenced by the draft: ${media.id}`,
          );
        }
      }

      if (draft.postId != null) {
        if (draft.sourceVersion === null) {
          throw new ConflictException('Revision source version is missing');
        }
        return this.repo.publishRevision(draft.id, ownerId, {
          title: draft.title,
          excerpt: draft.excerpt,
          content: draft.content,
          coverImage: cover.publicUrl,
          categoryNames: draft.categoryNames,
          sourceVersion: draft.sourceVersion,
          postId: draft.postId,
        });
      }

      return this.repo.publish(draft.id, ownerId, {
        title: draft.title,
        slug: slugify(draft.title, { lower: true }),
        excerpt: draft.excerpt,
        content: draft.content,
        coverImage: cover.publicUrl,
        categoryNames: draft.categoryNames,
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const conflict = new ConflictException(
          'A post with this title already exists',
        );
        await this.repo.markValidationFailed(id, conflict.message);
        throw new UnrecoverableError(conflict.message);
      }
      if (
        error instanceof NotFoundException ||
        error instanceof ConflictException ||
        error instanceof UnprocessableEntityException
      ) {
        await this.repo.markValidationFailed(id, error.message);
        throw new UnrecoverableError(error.message);
      }
      throw error;
    }
  }

  /**
   * Validates image references without parsing Markdown on request reads.
   *
   * Internal URLs must match media attached to the draft. Other URLs must be
   * valid HTTPS URLs whose hostname is configured in the external allowlist.
   * Size and reference-count limits keep this synchronous validation bounded.
   *
   * @param content - Draft Markdown content to inspect.
   * @param media - Media currently attached to the draft.
   * @returns Nothing when all image references are valid.
   * @throws {UnprocessableEntityException} When a reference is invalid,
   * detached, disallowed, or exceeds a configured limit.
   */
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
