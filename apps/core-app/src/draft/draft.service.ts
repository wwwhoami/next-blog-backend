import { InjectQueue } from '@nestjs/bullmq';
import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Queue } from 'bullmq';
import { DraftStatus } from 'prisma/generated/client';
import {
  CLEANUP_ARCHIVED_REVISIONS_JOB,
  DRAFT_PROCESSOR_QUEUE,
  VALIDATE_AND_PUBLISH_JOB,
} from './constants/draft-processor.constants';
import { DraftRepository } from './draft.repository';
import { CreateDraftDto } from './dto/create-draft.dto';
import { UpdateDraftDto } from './dto/update-draft.dto';
import { effectiveMedia } from './effective-media';

/**
 * Coordinates draft access, editing, media ownership, and async publication.
 */
@Injectable()
export class DraftService {
  constructor(
    private readonly repo: DraftRepository,
    @InjectQueue(DRAFT_PROCESSOR_QUEUE)
    private readonly draftQueue: Queue,
  ) {}

  /**
   * Returns the draft owner for shared authorization checks.
   *
   * @param id Draft identifier.
   * @returns The owner's identifier.
   */
  getAuthorId(id: string): Promise<{ authorId: string }> {
    return this.repo.getAuthorId(id);
  }

  /**
   * Shapes a draft for the editor by adding its mode and effective media.
   * Revision media links are flattened to media records.
   *
   * @param draft Draft record returned by the repository.
   * @returns The draft with normalized `revisionMode` and `effectiveMedia`.
   */
  private present<
    M extends { id: string; parentId?: string | null },
    T extends {
      postId?: number | null;
      media?: M[];
      draftMedia?: { media: M }[];
    },
  >(draft: T) {
    return {
      ...draft,
      revisionMode: draft.postId ? 'REVISION' : 'NEW',
      effectiveMedia: effectiveMedia(draft),
    };
  }

  /**
   * Lists the owner's active drafts; archived drafts are excluded.
   *
   * @param ownerId Authenticated owner identifier.
   * @returns The owner's active drafts.
   */
  async list(ownerId: string) {
    return this.repo
      .findMany(ownerId)
      .then((drafts) => drafts.map((draft) => this.present(draft)));
  }

  /**
   * Returns an owned draft, hiding missing and foreign drafts as not found.
   *
   * @param id Draft identifier.
   * @param ownerId Authenticated owner identifier.
   * @returns The requested draft with its related data.
   * @throws {NotFoundException} If the draft does not exist or is not owned by
   * the requested user.
   */
  async get(id: string, ownerId: string) {
    const draft = await this.repo.findById(id);
    if (!draft || draft.ownerId !== ownerId) {
      throw new NotFoundException('Draft not found');
    }

    return this.present(draft);
  }

  /**
   * Creates a server-side draft for the editor's explicit save flow.
   * Incomplete fields are validated later by the publish worker.
   *
   * @param ownerId Authenticated owner identifier.
   * @param dto Initial draft fields.
   * @returns The created draft with normalized revision metadata and media.
   */
  async create(ownerId: string, dto: CreateDraftDto) {
    return this.repo
      .create(ownerId, {
        title: dto.title ?? '',
        excerpt: dto.excerpt ?? '',
        content: dto.content ?? '',
        categoryNames: dto.categoryNames ?? [],
      })
      .then((draft) => this.present(draft));
  }

  /**
   * Creates or returns the author's active revision for an existing post.
   * Publishing revisions are not replaced so concurrent publication remains
   * visible to the caller as a structured conflict.
   *
   * @param postId Existing post identifier.
   * @param ownerId Authenticated post author identifier.
   * @returns The revision with editor-facing mode and media fields.
   * @throws {NotFoundException} If the post does not exist or is not owned by
   * the requested author.
   * @throws {ConflictException} If the existing revision is publishing.
   */
  async createRevision(postId: number, ownerId: string) {
    const revision = await this.repo.createRevision(ownerId, postId);
    if (!revision) {
      throw new NotFoundException('Post not found');
    }
    if (revision.status === DraftStatus.PUBLISHING) {
      throw new ConflictException({
        message: 'Post revision is already being published',
        draftId: revision.id,
        status: revision.status,
      });
    }
    return this.present(revision);
  }

  /**
   * Saves editable fields and synchronizes owned media and `coverMediaId`.
   *
   * @param id Draft identifier.
   * @param ownerId Authenticated owner identifier.
   * @param dto Updated fields, media attachments, and optional cover.
   * @returns The updated draft with normalized revision metadata and media.
   * @throws {NotFoundException} If the draft does not exist or is not owned by
   * the requested user.
   * @throws {ConflictException} If the draft is publishing or archived.
   * @throws {BadRequestException} If a media ID is invalid or not attachable.
   */
  async update(id: string, ownerId: string, dto: UpdateDraftDto) {
    const draft = await this.get(id, ownerId);
    if (draft.status !== DraftStatus.ACTIVE) {
      throw new ConflictException('Draft is not editable while publishing');
    }
    const { mediaIds, coverMediaId, ...draftData } = dto;

    return this.present(
      await this.repo.attachMedia(
        id,
        ownerId,
        mediaIds,
        draftData,
        coverMediaId,
      ),
    );
  }

  /**
   * Atomically claims an active draft and queues validation and publication.
   * The worker creates or updates the post, transfers media, and archives the
   * draft. The queue allows bounded retries; validation and final worker
   * failures restore the draft to `ACTIVE` with a persisted error.
   *
   * @param id Draft identifier.
   * @param ownerId Authenticated owner identifier.
   * @returns The draft in `PUBLISHING` state.
   * @throws {NotFoundException} If the draft does not exist or is not owned by
   * the requested user.
   * @throws {ConflictException} If the draft is already publishing or archived.
   * @throws {Error} If the publication job cannot be queued.
   */
  async publish(id: string, ownerId: string) {
    const draft = await this.get(id, ownerId);
    if (draft.status !== DraftStatus.ACTIVE) {
      throw new ConflictException(
        'Draft is already being published or archived',
      );
    }

    const claimed = await this.repo.markPublishing(id, ownerId);
    if (claimed.count !== 1) {
      throw new ConflictException(
        'Draft is already being published or archived',
      );
    }

    try {
      await this.draftQueue.add(
        VALIDATE_AND_PUBLISH_JOB,
        { draftId: id, ownerId },
        { attempts: 3, removeOnComplete: true, removeOnFail: false },
      );
    } catch (error) {
      await this.repo.markValidationFailed(
        id,
        error instanceof Error ? error.message : 'Failed to queue publication',
      );
      throw error;
    }

    return this.get(id, ownerId);
  }

  /**
   * Schedule daily cleanup of archived revision history.
   */
  async onModuleInit() {
    await this.draftQueue.add(
      CLEANUP_ARCHIVED_REVISIONS_JOB,
      {},
      {
        jobId: CLEANUP_ARCHIVED_REVISIONS_JOB,
        repeat: { every: 24 * 60 * 60 * 1000 },
        removeOnComplete: true,
        removeOnFail: false,
      },
    );
  }
}
