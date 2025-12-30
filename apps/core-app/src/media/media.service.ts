import { NotFoundError } from '@app/shared/errors/not-found.error';
import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MediaTarget, MediaType, MediaVariant } from '@prisma/client';
import { Queue } from 'bullmq';
import { createHash, randomUUID } from 'crypto';
import sharp from 'sharp';
import { EntityWithAuthorService } from '../common/entity-with-author.service';
import { UnprocesasbleEntityError } from '../common/errors/unprocessable-entity.errror';
import { UploadMediaDto } from './dto/upload-media.dto';
import {
  MediaEventsService,
  MediaVariantsStatusMsg,
} from './media-events.service';
import { MediaRepository } from './media.repository';

export const MEDIA_POLICIES = {
  POST_IMAGE: {
    maxWidth: 2000,
    maxHeight: 2000,
    resizeTo: 1200,
    formats: ['webp', 'jpeg', 'png'],
    maxFileSize: 5 * 1024 * 1024,
    multipleAllowed: true,
  },
  COMMENT_IMAGE: {
    maxWidth: 1000,
    maxHeight: 1000,
    resizeTo: 800,
    formats: ['webp', 'jpeg', 'png'],
    maxFileSize: 2 * 1024 * 1024,
    multipleAllowed: true,
  },
  USER_AVATAR_IMAGE: {
    maxWidth: 500,
    maxHeight: 500,
    resizeTo: 256,
    formats: ['webp', 'jpeg', 'png'],
    maxFileSize: 1 * 1024 * 1024,
    multipleAllowed: false,
  },
} as const;

@Injectable()
export class MediaService implements EntityWithAuthorService {
  private bucket: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly repo: MediaRepository,
    private readonly events: MediaEventsService,
    @InjectQueue('media-processor') private readonly mediaQueue: Queue,
  ) {
    this.bucket = configService.get<string>('MINIO_MEDIA_BUCKET') || '';
  }

  private mediaPolicy(mediaType: MediaType, mediaTarget: MediaTarget) {
    return MEDIA_POLICIES[`${mediaTarget}_${mediaType}`];
  }

  private computeHash(buffer: Buffer): string {
    return createHash('sha256').update(buffer).digest('hex');
  }

  private buildPublicUrl(key: string): string {
    const base =
      this.configService.get<string>('MEDIA_BASE_URL') ??
      this.configService.get<string>('MINIO_ENDPOINT') ??
      '';
    return `${base}/${this.repo['bucket']}/${key}`;
  }

  async upload(
    file: Express.Multer.File,
    userId: string,
    mediaMeta: UploadMediaDto,
  ) {
    const policy = this.mediaPolicy(mediaMeta.type, mediaMeta.target);
    const format = 'webp';

    const allowedMimeTypes = policy.formats.map((format) => `image/${format}`);
    if (!allowedMimeTypes.includes(file.mimetype)) {
      throw new UnprocesasbleEntityError('Unsupported file format');
    }

    if (file.size === 0) {
      throw new UnprocesasbleEntityError('File is empty');
    }
    if (file.size > policy.maxFileSize) {
      throw new UnprocesasbleEntityError('File too large');
    }

    const image = sharp(file.buffer);
    const metadata = await image.metadata();

    if (
      metadata.width > policy.maxWidth ||
      metadata.height > policy.maxHeight
    ) {
      throw new UnprocesasbleEntityError('Image dimensions too large');
    }

    const processed = await image
      // .resize({
      //   width: policy.resizeTo,
      //   height: policy.resizeTo,
      //   fit: mediaMeta.target === 'USER_AVATAR' ? 'cover' : 'inside',
      //   withoutEnlargement: true,
      // })
      // .toFormat(policy.formats[0], { quality: 90 })
      .toFormat(format, { quality: 100 })
      .toBuffer({ resolveWithObject: true });

    const hash = this.computeHash(processed.data);

    const existing = await this.repo.findByHashAndType(hash, mediaMeta.type);
    if (existing) {
      await this.repo.incrementRefCount(existing.id);
      return existing;
    }

    const key = `${mediaMeta.type.toLowerCase()}/${userId}/${randomUUID()}.${policy.formats[0]}`;
    const publicUrl = this.buildPublicUrl(key);

    try {
      await this.repo.uploadBuffer(
        processed.data,
        key,
        `image/${format}`,
        true,
      );
    } catch (error) {
      console.error('Error uploading media buffer:', error);
      throw new InternalServerErrorException('Failed to upload media');
    }

    // Create a DB record
    const media = await this.repo.create({
      key,
      bucket: this.bucket,
      ownerId: userId,
      type: mediaMeta.type,
      target: mediaMeta.target,
      variant: MediaVariant.ORIGINAL,
      mimeType: `image/${format}`,
      sizeBytes: processed.data.length,
      publicUrl,
      hash,
    });

    // Enqueue variants job with retry/backoff
    await this.mediaQueue.add(
      'generateVariants',
      { mediaId: media.id },
      {
        attempts: 5,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: {
          age: 3600,
          count: 1000,
        },
        removeOnFail: false,
      },
    );

    return media;
  }

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
      children: (media.Variants || []).map((c) => ({
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

  async getAuthorId(id: string) {
    return this.repo.getAuthorId(id);
  }

  // async listByUser(userId: string) {
  //   return this.repo.listByUser(userId);
  // }

  async getPresignedUrl(id: string, ttlSeconds = 600) {
    return this.repo.getPresignedUrl(id, ttlSeconds);
  }

  async removeReference(id: string) {
    return this.repo.decrementRefCountOrRemove(id);
  }

  async getProcessingResult(id: string): Promise<MediaVariantsStatusMsg> {
    const media = await this.repo.findByIdWithVariants(id);

    if (!media) {
      throw new NotFoundError('Media not found');
    }

    // If variants exist, return them immediately
    if (media.Variants && media.Variants.length > 0) {
      return {
        status: 'completed',
        payload: {
          mediaId: media.id,
          ownerId: media.ownerId,
          variants: media.Variants.map((v) => ({
            key: v.key,
            publicUrl: v.publicUrl,
            variant: v.variant,
          })),
        },
      };
    }

    return { status: 'pending', payload: { mediaId: media.id } };
  }
}
