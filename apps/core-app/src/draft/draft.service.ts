import { InjectQueue } from '@nestjs/bullmq';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Queue } from 'bullmq';
import { DraftStatus } from 'prisma/generated/client';
import {
  DRAFT_PROCESSOR_QUEUE,
  VALIDATE_AND_PUBLISH_JOB,
} from './constants/draft-processor.constants';
import { DraftRepository } from './draft.repository';
import { CreateDraftDto } from './dto/create-draft.dto';
import { UpdateDraftDto } from './dto/update-draft.dto';

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
   * Lists the owner's active drafts; archived drafts are excluded.
   *
   * @param ownerId Authenticated owner identifier.
   * @returns The owner's active drafts.
   */
  list(ownerId: string) {
    return this.repo.findMany(ownerId);
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

    return draft;
  }

  /**
   * Creates a server-side draft for the editor's explicit save flow.
   * Incomplete fields are validated later by the publish worker.
   *
   * @param ownerId Authenticated owner identifier.
   * @param dto Initial draft fields.
   * @returns The created draft.
   */
  create(ownerId: string, dto: CreateDraftDto) {
    return this.repo.create(ownerId, {
      title: dto.title ?? '',
      excerpt: dto.excerpt ?? '',
      content: dto.content ?? '',
      categoryNames: dto.categoryNames ?? [],
    });
  }

  /**
   * Saves editable fields and synchronizes owned media and `coverMediaId`.
   *
   * @param id Draft identifier.
   * @param ownerId Authenticated owner identifier.
   * @param dto Updated fields, media attachments, and optional cover.
   * @returns The updated draft.
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
   * Atomically claims an active draft and queues validation and publication.
   * The worker creates the post, transfers media, and archives the draft.
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
        { attempts: 1, removeOnComplete: true, removeOnFail: false },
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
   * Validates ownership before replacing the draft's media attachments.
   *
   * @param id Draft identifier.
   * @param ownerId Authenticated owner identifier.
   * @param mediaIds Media identifiers to attach.
   * @throws {BadRequestException} If any media is invalid or not attachable.
   */
  private async syncMedia(id: string, ownerId: string, mediaIds: string[]) {
    const media = await this.repo.findAttachableMedia(ownerId, mediaIds);
    if (media.length !== mediaIds.length) {
      throw new BadRequestException('One or more media assets are invalid');
    }

    await this.repo.attachMedia(id, mediaIds);
  }

  /**
   * Sets or clears `coverMediaId` after confirming the media is attached.
   *
   * @param id Draft identifier.
   * @param ownerId Authenticated owner identifier.
   * @param coverMediaId Attached media identifier, or `null` to clear it.
   * @throws {BadRequestException} If the cover media is not attached to the
   * draft or is not owned by the requested user.
   */
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
}
