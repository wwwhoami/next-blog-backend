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
   * Starts asynchronous validation and publication of an active draft.
   *
   * The worker performs content and media validation before the repository
   * creates the post, transfers media, and archives the draft transactionally.
   * The publishing state prevents duplicate jobs from creating duplicate posts.
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
}
