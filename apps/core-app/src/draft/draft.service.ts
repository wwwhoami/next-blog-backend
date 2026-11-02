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

@Injectable()
export class DraftService {
  constructor(
    private readonly repo: DraftRepository,
    @InjectQueue(DRAFT_PROCESSOR_QUEUE)
    private readonly draftQueue: Queue,
  ) {}

  /**
   * Returns the draft owner for shared authorization checks.
   */
  getAuthorId(id: string): Promise<{ authorId: string }> {
    return this.repo.getAuthorId(id);
  }

  /**
   * Lists the owner's active drafts; archived drafts are excluded.
   */
  list(ownerId: string) {
    return this.repo.findMany(ownerId);
  }

  /**
   * Returns an owned draft, hiding missing and foreign drafts as not found.
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
