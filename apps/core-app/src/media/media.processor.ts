import { OnQueueEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { MediaVariant } from '@prisma/client';
import { Job } from 'bullmq';
import { PinoLogger } from 'nestjs-pino';
import sharp from 'sharp';
import { MediaEventsService } from './media-events.service';
import { MediaRepository } from './media.repository';

@Processor('media-processor')
export class MediaProcessor extends WorkerHost {
  constructor(
    private readonly repo: MediaRepository,
    private readonly events: MediaEventsService,
    private readonly logger: PinoLogger,
  ) {
    super();
  }

  // concurrency is configured by Bull / Nest's decorators optionally; job options control retries
  async process(job: Job<{ mediaId: string }>) {
    const { mediaId } = job.data;

    // Fetch original + sanity check
    const original = await this.repo.findById(mediaId);
    if (!original) throw new Error(`Original media not found: ${mediaId}`);

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
      const publicUrl = `${process.env.MEDIA_BASE_URL?.replace(/\/$/, '')}/${this.repo['bucket']}/${variantKey}`;

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

      createdVariants.push({ key: created.key, publicUrl: created.publicUrl });
    }

    // publish via Redis so every instance notifies its SSE clients
    await this.events.publishVariantsReady({
      mediaId: original.id,
      variants: createdVariants,
    });

    return { mediaId: original.id, variants: createdVariants };
  }

  @OnQueueEvent('failed')
  onFailed(job: Job, err: Error) {
    this.logger.error(`Job ${job.id} failed: `, err.message);
  }
}
