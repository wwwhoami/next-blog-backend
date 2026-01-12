import { PrismaService } from '@app/prisma';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PinoLogger } from 'nestjs-pino';
import { MediaType } from 'prisma/generated/client';
import { MediaCreate } from './types/media-create.type';

@Injectable()
export class MediaRepository {
  private s3: S3Client;
  public readonly bucket: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly logger: PinoLogger,
  ) {
    this.bucket = this.configService.get<string>('MINIO_MEDIA_BUCKET') || '';
    this.s3 = new S3Client({
      region: configService.get<string>('MINIO_REGION') ?? 'us-east-1',
      endpoint: configService.get<string>('MINIO_ENDPOINT'),
      forcePathStyle: true,
      credentials: {
        accessKeyId: configService.get<string>('MINIO_ACCESS_KEY')!,
        secretAccessKey: configService.get<string>('MINIO_SECRET_KEY')!,
      },
    });
  }

  async getAuthorId(id: string) {
    const author = await this.prisma.media.findUniqueOrThrow({
      where: { id },
      select: { ownerId: true },
    });

    return { authorId: author?.ownerId };
  }

  async getPresignedUrl(id: string, ttlSeconds = 600) {
    const mediaRec = await this.findByIdWithVariants(id);
    if (!mediaRec) throw new NotFoundException('media not found');

    const cmd = new GetObjectCommand({
      Bucket: mediaRec.bucket,
      Key: mediaRec.key,
    });

    return getSignedUrl(this.s3, cmd, { expiresIn: ttlSeconds });
  }

  async findById(id: string) {
    return this.prisma.media.findUnique({ where: { id } });
  }

  async findByKey(key: string) {
    return this.prisma.media.findUnique({ where: { key } });
  }

  async findByIdWithVariants(id: string) {
    return this.prisma.media.findUnique({
      where: { id },
      include: { Variants: true },
    });
  }

  async findByKeyWithVariants(key: string) {
    return this.prisma.media.findUnique({
      where: { key },
      include: { Variants: true },
    });
  }

  async findByHashAndType(hash: string, type: MediaType) {
    return this.prisma.media.findUnique({
      where: {
        hash_type: {
          hash,
          type,
        },
      },
    });
  }

  async findVariants(parentId: string) {
    return this.prisma.media.findMany({
      where: { parentId },
    });
  }

  async incrementRefCount(id: string) {
    return this.prisma.media.update({
      where: { id },
      data: { refCount: { increment: 1 } },
    });
  }

  // Decrement and if <= 0 remove DB record and S3 object
  async decrementRefCountOrRemove(id: string) {
    const media = await this.findById(id);
    if (!media) return null;

    const newCount = media.refCount - 1;
    if (newCount <= 0) {
      // delete object in S3
      try {
        await this.deleteObject(media.key, media.bucket);
      } catch (err) {
        this.logger.warn(
          `Failed to delete object ${media.key} in bucket ${media.bucket}: `,
          err,
        );
      }
      // delete DB row
      return this.prisma.media.delete({ where: { id } });
    } else {
      return this.prisma.media.update({
        where: { id },
        data: { refCount: newCount },
      });
    }
  }

  async create(data: MediaCreate) {
    return this.prisma.media.create({ data });
  }

  async createMany(data: MediaCreate[]) {
    return this.prisma.media.createMany({ data });
  }

  async uploadBuffer(
    buffer: Buffer,
    key: string,
    mimeType: string,
    makePublic = true,
  ) {
    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: buffer,
        ContentType: mimeType,
        ACL: makePublic ? 'public-read' : 'private',
      }),
    );
  }

  async downloadToBuffer(key: string): Promise<Buffer> {
    const response = await this.s3.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }),
    );

    const byteArr = await response.Body?.transformToByteArray();
    if (byteArr === undefined) {
      return Buffer.from([]);
    }

    return Buffer.from(byteArr);
  }

  // delete storage (used rarely because we usually gate via refCount)
  async deleteObject(key: string, bucket: string) {
    return this.s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  }
}
