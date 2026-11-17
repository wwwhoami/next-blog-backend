import { OnQueueEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Job } from 'bullmq';
import { PinoLogger } from 'nestjs-pino';
import sharp from 'sharp';
import { StorageService } from '../storage/storage.service';
import {
  MAX_FILE_SIZE_BYTES,
  MEDIA_PROCESSOR_QUEUE,
  SUPPORTED_IMAGE_FORMATS,
  VARIANT_CONFIGS,
} from './constants/media-processor.constants';
import { ProcessingError } from './errors/processing.error';
import { ValidationError } from './errors/validation.error';
import { MediaEventsService } from './media-events.service';
import { MediaRepository } from './media.repository';
import { MediaProcessorJobData } from './types/media-job.type';

@Injectable()
@Processor(MEDIA_PROCESSOR_QUEUE)
export class MediaProcessor extends WorkerHost {
  constructor(
    private readonly repo: MediaRepository,
    private readonly storageService: StorageService,
    private readonly events: MediaEventsService,
    private readonly logger: PinoLogger,
  ) {
    super();
    this.logger.setContext(MediaProcessor.name);
  }

  /**
   * Checks if the image MIME type is supported for processing.
   * @param mimeType - The MIME type to validate
   * @returns True if the image format is supported, false otherwise
   */
  private isImageSupported(mimeType: string): boolean {
    return SUPPORTED_IMAGE_FORMATS.includes(mimeType.toLowerCase());
  }

  /**
   * Validates the image format and size, then downloads it to a buffer.
   * @param mediaId - The ID of the media being validated
   * @param key - The storage key of the media file
   * @param mimeType - The MIME type of the media file
   * @returns A buffer containing the media file data
   * @throws {ValidationError} If the image format is unsupported or size exceeds the limit
   */
  private async validateAndGetBuffer(
    mediaId: string,
    key: string,
    mimeType: string,
  ): Promise<Buffer> {
    if (!this.isImageSupported(mimeType)) {
      throw new ValidationError(
        `Unsupported image format: ${mimeType} for mediaId: ${mediaId}`,
      );
    }

    const buffer = await this.storageService.downloadToBuffer(key);

    if (buffer.length > MAX_FILE_SIZE_BYTES) {
      throw new ValidationError(
        `Image size exceeds limit (${MAX_FILE_SIZE_BYTES} bytes) for mediaId: ${mediaId}`,
      );
    }

    return buffer;
  }

  /**
   * Generates missing variants, preserving completed variants across retries.
   * Reports completion with the full configured variant set.
   *
   * @param job - BullMQ job containing the original media ID.
   * @returns The original ID and full variant set when processing completes.
   * @throws {ValidationError} If the source format or size is unsupported.
   * @throws {ProcessingError} If the original exists but the variant set is incomplete after processing.
   */
  async process(job: Job<MediaProcessorJobData>) {
    if (job.name !== 'generateVariants') return;

    this.logger.info(
      `Processing job ${job.id} for mediaId: ${job.data.mediaId}`,
    );
    const { mediaId } = job.data;

    const original = await this.repo.findById(mediaId);
    if (!original) {
      this.logger.error(`Original media not found for mediaId: ${mediaId}`);
      return;
    }

    try {
      const existing = await this.repo.findVariants(mediaId);
      const missing = VARIANT_CONFIGS.filter(
        ({ variant }) => !existing.some((row) => row.variant === variant),
      );
      if (missing.length) {
        const buffer = await this.validateAndGetBuffer(
          mediaId,
          original.key,
          original.mimeType,
        );
        const results = await Promise.allSettled(
          missing.map(async (cfg) => {
            const rendered = await sharp(buffer)
              .resize({ width: cfg.width, withoutEnlargement: true })
              .webp({ quality: cfg.quality })
              .toBuffer();

            const key = `${original.key}__${cfg.suffix}.webp`;
            const attempt = await this.repo.beginVariantPut(
              mediaId,
              key,
              this.storageService.bucket,
              cfg.variant,
            );
            if (!attempt) return;
            try {
              await this.storageService.uploadBuffer(
                rendered,
                key,
                'image/webp',
                true,
              );
              await this.repo.finishVariantPut(attempt, {
                publicUrl: this.storageService.buildPublicUrl(key),
                variant: cfg.variant,
                mimeType: 'image/webp',
                sizeBytes: rendered.length,
              });
            } catch (error) {
              await this.repo
                .releaseVariantPut(attempt)
                .catch((releaseError: unknown) => {
                  this.logger.warn(
                    { err: releaseError, key },
                    'Failed to release variant PUT lease',
                  );
                });
              throw error;
            }
          }),
        );
        const failure = results.find((result) => result.status === 'rejected');
        if (failure) throw failure.reason;
      }

      const current = await this.repo.findByIdWithVariants(mediaId);
      if (!current) return;
      const createdVariants = VARIANT_CONFIGS.map(({ variant }) => {
        const row = current.Variants.find((row) => row.variant === variant);
        if (!row)
          throw new ProcessingError(
            `Missing ${variant} variant for mediaId: ${mediaId}`,
          );
        return { key: row.key, publicUrl: row.publicUrl };
      });

      await this.events.publishUploadStatus({
        status: 'completed',
        payload: {
          ownerId: original.ownerId,
          mediaId: original.id,
          variants: createdVariants,
        },
      });

      this.logger.info(
        `Successfully processed ${createdVariants.length} variants for mediaId: ${mediaId}`,
      );

      return { mediaId: original.id, variants: createdVariants };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);

      await this.events.publishUploadStatus({
        status: 'failed',
        payload: {
          mediaId: original.id,
          error: `Error processing media variants for ${mediaId}: ${errorMsg}`,
        },
      });

      this.logger.error(
        `Error processing media variants for mediaId: ${mediaId}`,
        err,
      );
      throw err;
    }
  }

  /**
   * Handles failed job events from the BullMQ queue.
   * @param job - The failed job
   * @param err - The error that caused the failure
   */
  @OnQueueEvent('failed')
  onFailed(job: Job<MediaProcessorJobData>, err: Error) {
    this.logger.error(
      `Job ${job.id} failed for mediaId: ${job.data?.mediaId}`,
      err,
    );
  }
}
