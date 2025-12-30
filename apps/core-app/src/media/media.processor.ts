import { OnQueueEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MediaVariant } from '@prisma/client';
import { Job } from 'bullmq';
import { PinoLogger } from 'nestjs-pino';
import sharp from 'sharp';
import { MediaEventsService } from './media-events.service';
import { MediaRepository } from './media.repository';

@Injectable()
@Processor('media-processor')
export class MediaProcessor extends WorkerHost {
  private readonly logger = new PinoLogger({
    renameContext: MediaProcessor.name,
  });

  constructor(
    private readonly repo: MediaRepository,
    private readonly events: MediaEventsService,
    private readonly configService: ConfigService,
  ) {
    super();
  }

  private buildPublicUrl(key: string): string {
    const base =
      this.configService.get<string>('MEDIA_BASE_URL') ??
      this.configService.get<string>('MINIO_ENDPOINT') ??
      '';
    return `${base}/${this.repo['bucket']}/${key}`;
  }

  // concurrency is configured by Bull / Nest's decorators optionally; job options control retries
  async process(job: Job<{ mediaId: string }>) {
    this.logger.info('Processing job id: ', job.id, ' with data: ', job.data);
    const { mediaId } = job.data;

    // Fetch original + sanity check
    const original = await this.repo.findById(mediaId);
    if (!original) {
      this.logger.error('Original media not found: ', mediaId);
      return;
    }

    try {
      const buffer = await this.repo.downloadToBuffer(original.key);

      // variant configs could be policy-dependent; here's a reasonable default
      const configs: Array<{
        variant: MediaVariant;
        width?: number;
        quality?: number;
        suffix: string;
      }> = [
        {
          variant: MediaVariant.THUMBNAIL,
          width: 300,
          quality: 65,
          suffix: 'thumb',
        },
        {
          variant: MediaVariant.MEDIUM,
          width: 800,
          quality: 75,
          suffix: 'medium',
        },
        {
          variant: MediaVariant.LARGE,
          width: 1600,
          quality: 80,
          suffix: 'large',
        },
      ];

      const createdVariants: Array<{ key: string; publicUrl: string }> = [];

      for (const cfg of configs) {
        // create resized buffer
        const outBuffer = await sharp(buffer)
          .resize({ width: cfg.width, withoutEnlargement: true })
          .webp({ quality: cfg.quality })
          .toBuffer();

        // variant key naming
        const variantKey = `${original.key}__${cfg.suffix}.webp`;

        // upload storage
        await this.repo.uploadBuffer(outBuffer, variantKey, 'image/webp', true);

        // build public url
        const publicUrl = this.buildPublicUrl(variantKey);

        // TODO: Use a createMany
        // create DB record as a child
        const created = await this.repo.create({
          key: variantKey,
          bucket: this.repo['bucket'],
          ownerId: original.ownerId ?? null,
          parentId: original.id,
          type: original.type,
          target: original.target,
          variant: cfg.variant,
          mimeType: 'image/webp',
          sizeBytes: outBuffer.length,
          publicUrl,
          hash: null,
        });

        createdVariants.push({
          key: created.key,
          publicUrl: created.publicUrl,
        });
      }

      await this.events.publishUploadStatus({
        status: 'completed',
        payload: {
          ownerId: original.ownerId,
          mediaId: original.id,
          variants: createdVariants,
        },
      });

      this.logger.info('Published variants ready: ', {
        mediaId: original.id,
        variants: createdVariants,
      });
      return { mediaId: original.id, variants: createdVariants };
    } catch (err) {
      await this.events.publishUploadStatus({
        status: 'failed',
        payload: {
          mediaId: original.id,
          error: `Error processing media variants: ${err.message}`,
        },
      });

      this.logger.error('Error processing media variants: ', err);
    }
  }

  @OnQueueEvent('failed')
  onFailed(job: Job, err: Error) {
    this.logger.error(`Job ${job.id} failed: `, err.message);
  }
}
