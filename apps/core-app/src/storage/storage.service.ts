import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class StorageService {
  private readonly s3: S3Client;
  public readonly bucket: string;

  constructor(private readonly configService: ConfigService) {
    this.bucket = this.configService.getOrThrow<string>('MINIO_MEDIA_BUCKET');

    this.s3 = new S3Client({
      region: configService.getOrThrow<string>('MINIO_REGION'),
      endpoint: configService.getOrThrow<string>('MINIO_ENDPOINT'),
      forcePathStyle: true,
      credentials: {
        accessKeyId: configService.getOrThrow<string>('MINIO_ACCESS_KEY')!,
        secretAccessKey: configService.getOrThrow<string>('MINIO_SECRET_KEY')!,
      },
    });
  }

  buildPublicUrl(key: string): string {
    const base =
      this.configService.get<string>('MEDIA_BASE_URL') ??
      this.configService.get<string>('MINIO_ENDPOINT') ??
      '';
    return `${base}/${this.bucket}/${key}`;
  }

  async getPresignedUrl(bucket: string, key: string, ttlSeconds = 600) {
    const cmd = new GetObjectCommand({
      Bucket: bucket,
      Key: key,
    });

    return getSignedUrl(this.s3, cmd, { expiresIn: ttlSeconds });
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
