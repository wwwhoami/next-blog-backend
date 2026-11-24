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
import { DraftStatus, Prisma } from 'prisma/generated/client';
import { postConflictMessage } from '../post/post-conflict';
import { postSlug } from '../post/post-slug';
import {
  CLEANUP_ARCHIVED_REVISIONS_JOB,
  DRAFT_PROCESSOR_QUEUE,
  DraftPublishJobData,
  VALIDATE_AND_PUBLISH_JOB,
} from './constants/draft-processor.constants';
import { DraftPublicationMediaService } from './draft-publication-media.service';
import { DraftPublicationRepository } from './draft-publication.repository';
import { DraftRepository } from './draft.repository';

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
  private readonly logger = new Logger(DraftProcessor.name);

  constructor(
    private readonly repo: DraftRepository,
    private readonly publication: DraftPublicationRepository,
    private readonly media: DraftPublicationMediaService,
    private readonly configService: ConfigService,
  ) {
    super();
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
      await this.publication.markValidationFailed(
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
      const media = await this.media.prepare(draft);
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
        return await this.publication.publish(id, ownerId, {
          ...data,
          slug: postSlug(title),
        });
      }
      if (draft.sourceVersion === null) {
        throw new ConflictException('Revision source version is missing');
      }

      return await this.publication.publishRevision(id, ownerId, {
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
      await this.publication.markValidationFailed(
        id,
        publicationAttemptId,
        message,
      );
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
}
