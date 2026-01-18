import { OnQueueEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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
import { MediaCreate } from './types/media-create.type';
import { MediaProcessorJobData } from './types/media-job.type';

@Injectable()
@Processor(MEDIA_PROCESSOR_QUEUE)
export class MediaProcessor extends WorkerHost {
  constructor(
    private readonly repo: MediaRepository,
    private readonly storageService: StorageService,
    private readonly events: MediaEventsService,
    private readonly configService: ConfigService,
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
   * Processes a media job by creating image variants.
   * Downloads the original image, generates variants with different sizes and qualities,
   * uploads them to storage, and publishes status updates.
   * @param job - The BullMQ job containing media processing data
   * @returns An object containing the media ID and created variants
   * @throws {ProcessingError} If variant creation fails
   */
  async process(job: Job<MediaProcessorJobData>) {
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
      const buffer = await this.validateAndGetBuffer(
        mediaId,
        original.key,
        original.mimeType,
      );

      const variantsToCreate: MediaCreate[] = [];

      const variantPromises = VARIANT_CONFIGS.map(async (cfg) => {
        try {
          const outBuffer = await sharp(buffer)
            .resize({ width: cfg.width, withoutEnlargement: true })
            .webp({ quality: cfg.quality })
            .toBuffer();

          const variantKey = `${original.key}__${cfg.suffix}.webp`;

          await this.storageService.uploadBuffer(
            outBuffer,
            variantKey,
            'image/webp',
            true,
          );

          const publicUrl = this.storageService.buildPublicUrl(variantKey);

          variantsToCreate.push({
            key: variantKey,
            publicUrl,
            bucket: this.storageService.bucket,
            ownerId: original.ownerId,
            parentId: original.id,
            type: original.type,
            target: original.target,
            variant: cfg.variant,
            mimeType: 'image/webp',
            sizeBytes: outBuffer.length,
            hash: null,
          });
        } catch (variantErr) {
          this.logger.error(
            `Failed to create ${cfg.variant} variant for mediaId: ${mediaId}`,
            variantErr,
          );

          throw variantErr;
        }
      });

      await Promise.all(variantPromises);

      const created = await this.repo.createMany(variantsToCreate);
      if (created.count === 0) {
        throw new ProcessingError(
          `Failed to create any variants in DB for mediaId: ${mediaId}`,
        );
      }

      const createdVariants = variantsToCreate.map((v) => ({
        key: v.key,
        publicUrl: v.publicUrl,
      }));

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
