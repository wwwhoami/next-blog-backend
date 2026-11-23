import { NotFoundError } from '@app/shared/errors/not-found.error';
import { InjectQueue } from '@nestjs/bullmq';
import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { createHash, randomUUID } from 'crypto';
import { PinoLogger } from 'nestjs-pino';
import {
  DraftStatus,
  MediaTarget,
  MediaType,
  MediaVariant,
} from 'prisma/generated/client';
import sharp from 'sharp';
import { EntityWithAuthorService } from '../common/entity-with-author.service';
import { UnprocessableEntityError } from '../common/errors/unprocessable-entity.error';
import { DraftRepository } from '../draft/draft.repository';
import { StorageService } from '../storage/storage.service';
import {
  MEDIA_POLICIES,
  MediaPolicyKey,
} from './constants/media-policies.constants';
import {
  MEDIA_PROCESSOR_QUEUE,
  VARIANT_CONFIGS,
} from './constants/media-processor.constants';
import { QUEUE_JOB_CONFIG } from './constants/queue-config.constants';
import { UploadMediaDto } from './dto/upload-media.dto';
import { MediaVariantsStatusMsg } from './media-events.service';
import { MediaRepository } from './media.repository';
import { drainStorageDeletions } from './util/drain-storage-deletions';

function hasCompleteVariantSet(rows: { variant: MediaVariant }[]) {
  return VARIANT_CONFIGS.every(({ variant }) =>
    rows.some((row) => row.variant === variant),
  );
}

@Injectable()
export class MediaService implements EntityWithAuthorService {
  private bucket: string;

  constructor(
    configService: ConfigService,
    private readonly repo: MediaRepository,
    private readonly draftRepo: DraftRepository,
    private readonly storageService: StorageService,
    @InjectQueue(MEDIA_PROCESSOR_QUEUE) private readonly mediaQueue: Queue,
    private readonly logger: PinoLogger,
  ) {
    this.bucket = configService.getOrThrow<string>('MINIO_MEDIA_BUCKET');
    this.logger.setContext(MediaService.name);
  }

  /**
   * Retrieves the media policy configuration for a given media type and target.
   * @param mediaType - The type of media (IMAGE)
   * @param mediaTarget - The target use case (POST, COMMENT, USER_AVATAR)
   * @returns The policy configuration including size limits, formats, and dimensions
   * @throws {Error} If the policy combination is not found
   * @private
   */
  private mediaPolicy(mediaType: MediaType, mediaTarget: MediaTarget) {
    const key: MediaPolicyKey = `${mediaTarget}_${mediaType}`;
    const policy = MEDIA_POLICIES[key];

    if (!policy) {
      throw new Error(
        `No policy found for combination: ${mediaTarget}_${mediaType}`,
      );
    }

    return policy;
  }

  /**
   * Computes a SHA-256 hash of the provided buffer for deduplication.
   * @param buffer - The buffer to hash
   * @returns The hexadecimal hash string
   * @private
   */
  private computeHash(buffer: Buffer): string {
    return createHash('sha256').update(buffer).digest('hex');
  }

  /**
   * Uploads and processes a media file with validation, resizing, and variant generation.
   *
   * This method:
   * 1. Validates file format, size, and dimensions against policy
   * 2. Processes and resizes the image according to target requirements
   * 3. Checks for duplicate uploads using content hash
   * 4. Uploads the processed file to storage
   * 5. Creates a database record
   * 6. Enqueues a job for generating image variants (thumbnails, etc.)
   *
   * @param file - The uploaded file from multer
   * @param userId - The ID of the user uploading the file
   * @param mediaMeta - Metadata specifying the media type and target use case
   * @returns The created media record with public URL
   * @throws {UnprocessableEntityError} If file validation fails (format, size, or dimensions)
   * @throws {InternalServerErrorException} If storage upload fails
   */
  async upload(
    file: Express.Multer.File,
    userId: string,
    mediaMeta: UploadMediaDto,
  ) {
    const policy = this.mediaPolicy(mediaMeta.type, mediaMeta.target);
    if (mediaMeta.draftId) {
      const draft = await this.draftRepo.findForMediaAttachment(
        mediaMeta.draftId,
      );
      if (
        !draft ||
        draft.ownerId !== userId.toLowerCase() ||
        draft.status !== DraftStatus.ACTIVE
      ) {
        throw new NotFoundException('Draft not found');
      }
      if (mediaMeta.target !== MediaTarget.POST) {
        throw new UnprocessableEntityError(
          'Draft-bound media must target a post',
        );
      }
    }
    const formatToConvertTo = 'webp'; // prefer webp for uploads

    const allowedMimeTypes = policy.formats.map((format) => `image/${format}`);
    if (!allowedMimeTypes.includes(file.mimetype)) {
      throw new UnprocessableEntityError(
        `Unsupported file format provided ${file.mimetype}, supported formats: ${allowedMimeTypes.join(', ')}`,
      );
    }

    if (file.size === 0) {
      throw new UnprocessableEntityError('File is empty');
    }
    if (file.size > policy.maxFileSize) {
      throw new UnprocessableEntityError('File too large');
    }

    const image = sharp(file.buffer);
    const metadata = await image.metadata();

    if (
      metadata.width > policy.maxWidth ||
      metadata.height > policy.maxHeight
    ) {
      throw new UnprocessableEntityError('Image dimensions too large');
    }

    const processed = await image
      .resize({
        width: policy.resizeTo,
        height: policy.resizeTo,
        fit: mediaMeta.target === 'USER_AVATAR' ? 'cover' : 'inside',
        withoutEnlargement: true,
      })
      .toFormat(formatToConvertTo, { quality: 90 })
      .toBuffer({ resolveWithObject: true });

    const hash = this.computeHash(processed.data);

    const key = `${mediaMeta.type.toLowerCase()}/${userId}/${randomUUID()}.${policy.formats[0]}`;
    const media = await this.repo.reuseOrCreateUpload(
      userId,
      hash,
      mediaMeta.type,
      mediaMeta.target,
      mediaMeta.draftId,
      { key, bucket: this.bucket },
      async () => {
        const publicUrl = this.storageService.buildPublicUrl(key);
        const mimeType = `image/${formatToConvertTo}`;

        try {
          await this.storageService.uploadBuffer(
            processed.data,
            key,
            mimeType,
            true,
          );
        } catch (error) {
          this.logger.error('Error uploading media buffer:', error);
          throw new InternalServerErrorException('Failed to upload media');
        }

        return {
          key,
          bucket: this.bucket,
          ownerId: userId,
          type: mediaMeta.type,
          target: mediaMeta.target,
          variant: MediaVariant.ORIGINAL,
          mimeType,
          sizeBytes: processed.data.length,
          publicUrl,
          hash,
        };
      },
    );

    if (hasCompleteVariantSet(await this.repo.findVariants(media.id)))
      return media;

    await this.mediaQueue.add(
      'generateVariants',
      { mediaId: media.id },
      {
        jobId: media.id,
        attempts: QUEUE_JOB_CONFIG.RETRY_ATTEMPTS,
        backoff: { type: 'exponential', delay: QUEUE_JOB_CONFIG.BACKOFF_DELAY },
        removeOnComplete: {
          age: QUEUE_JOB_CONFIG.CLEANUP_AGE,
          count: QUEUE_JOB_CONFIG.CLEANUP_COUNT,
        },
        removeOnFail: false,
      },
    );

    const job = await this.mediaQueue.getJob(media.id);
    const state = await job?.getState();
    if (
      job &&
      (state === 'failed' || state === 'completed') &&
      !hasCompleteVariantSet(await this.repo.findVariants(media.id))
    ) {
      try {
        await job.retry(state, {
          resetAttemptsMade: true,
          resetAttemptsStarted: true,
        });
      } catch (error) {
        const current = await job.getState();
        if (['waiting', 'delayed', 'active', 'prioritized'].includes(current))
          return media;
        if (
          current === 'completed' &&
          hasCompleteVariantSet(await this.repo.findVariants(media.id))
        )
          return media;
        throw error;
      }
    }

    return media;
  }

  /**
   * Retrieves a media record with all its generated variants.
   * @param id - The UUID of the media record
   * @returns A DTO containing the media record and all its variants (thumbnails, etc.)
   * @throws {NotFoundError} If the media record is not found
   */
  async getMediaWithVariants(id: string) {
    const media = await this.repo.findByIdWithVariants(id);
    if (!media) {
      throw new NotFoundError('media not found');
    }

    // Map children to DTO-friendly objects (publicUrl already stored)
    const dto = {
      id: media.id,
      key: media.key,
      type: media.type,
      target: media.target,
      variant: media.variant,
      publicUrl: media.publicUrl,
      children: (media.variants || []).map((c) => ({
        id: c.id,
        key: c.key,
        variant: c.variant,
        publicUrl: c.publicUrl,
        mimeType: c.mimeType,
        sizeBytes: c.sizeBytes,
      })),
    };

    return dto;
  }

  findReferences(id: string, ownerId: string) {
    return this.repo.findReferences(id, ownerId);
  }

  /**
   * Lists media owned by a user, optionally filtered by attachment state.
   *
   * Variants are included so callers can render the available media URLs
   * without issuing separate lookups.
   *
   * @param ownerId - UUID of the media owner.
   * @param attached - When `true`, return media attached to a draft or post;
   * when `false`, return unattached media; when omitted, return both.
   * @returns The owner's media records ordered from newest to oldest.
   */
  async listOwnedMedia(ownerId: string, attached?: boolean) {
    const media = await this.repo.findOwnedMedia(ownerId, attached);
    return media.map(({ variants, ...original }) => ({
      ...original,
      Variants: variants,
    }));
  }

  /**
   * Retrieves the owner/author ID of a media record.
   * Used for authorization checks to ensure users can only modify their own media.
   * @param id - The UUID of the media record
   * @returns An object containing the authorId (ownerId)
   */
  async getAuthorId(id: string) {
    return this.repo.getAuthorId(id);
  }

  /**
   * Generates a time-limited presigned URL for accessing a media file.
   * Useful for private media or temporary access without exposing storage credentials.
   * @param id - The UUID of the media record
   * @param ttlSeconds - Time-to-live in seconds for the URL (default: 600 = 10 minutes)
   * @returns A presigned URL string valid for the specified duration
   * @throws {NotFoundException} If the media record is not found
   */
  async getPresignedUrl(id: string, ttlSeconds = 600) {
    const mediaRec = await this.repo.findByIdWithVariants(id);

    if (!mediaRec) throw new NotFoundException('media not found');

    return this.storageService.getPresignedUrl(
      mediaRec.bucket,
      mediaRec.key,
      ttlSeconds,
    );
  }

  /**
   * Deletes the original and variants and drains their storage deletion records.
   * Referenced media requires confirmation. Publishing drafts block deletion.
   */
  async removeReference(id: string, force = false) {
    const result = await this.repo.removeReference(id, force);
    if (result.objects.length) {
      await drainStorageDeletions(
        this.repo,
        this.storageService,
        this.logger,
        result.objects,
      );
    }
    return result.media;
  }

  /**
   * Checks the processing status of media variants generation.
   *
   * This method determines the current state of variant processing:
   * - "completed": All variants have been generated and are available
   * - "failed": The processing job failed with an error
   * - "pending": Variants are still being processed or queued
   *
   * Used by SSE endpoints to provide real-time status updates to clients.
   *
   * @param id - The UUID of the media record
   * @returns A status message indicating the processing state and available variants
   * @throws {NotFoundError} If the media record is not found
   */
  async getProcessingResult(id: string): Promise<MediaVariantsStatusMsg> {
    const media = await this.repo.findByIdWithVariants(id);

    if (!media) {
      throw new NotFoundError('Media not found');
    }

    if (hasCompleteVariantSet(media.variants)) {
      return {
        status: 'completed',
        payload: {
          mediaId: media.id,
          ownerId: media.ownerId,
          variants: media.variants.map((v) => ({
            key: v.key,
            publicUrl: v.publicUrl,
            variant: v.variant,
          })),
        },
      };
    }

    const job = await this.mediaQueue.getJob(media.id);
    if (job) {
      const state = await job.getState();
      if (state === 'failed') {
        return {
          status: 'failed',
          payload: { mediaId: media.id, error: job.failedReason },
        };
      }
    }

    return { status: 'pending', payload: { mediaId: media.id } };
  }
}
