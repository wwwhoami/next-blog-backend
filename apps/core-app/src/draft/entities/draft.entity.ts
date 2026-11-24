import {
  ApiExtraModels,
  ApiProperty,
  ApiPropertyOptional,
  getSchemaPath,
} from '@nestjs/swagger';
import type { Draft, DraftMedia, Post } from 'prisma/generated/client';
import { DraftStatus } from 'prisma/generated/enums';
import { MediaEntity } from '../../media/entities/media.entity';

// Nest serializes bigint values as decimal strings in HTTP responses.
type DraftMediaRecord = Omit<MediaEntity, 'sizeBytes'> & { sizeBytes: bigint };

export class DraftPostEntity implements Post {
  @ApiProperty({ type: 'integer' })
  id: number;

  title: string;

  content: string;

  published: boolean;

  coverImage: string;

  @ApiProperty({ format: 'uuid' })
  authorId: string;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt: Date;

  excerpt: string;

  slug: string;

  @ApiProperty({ type: 'integer' })
  likesCount: number;

  language: string;

  @ApiProperty({ type: 'integer' })
  version: number;
}

// The Swagger plugin infers nullable for inline unions. The null branch below owns it.
type DraftPost = DraftPostEntity | null;

export class DraftMediaLinkEntity implements DraftMedia {
  @ApiProperty({ format: 'uuid' })
  draftId: string;

  @ApiProperty({ format: 'uuid' })
  mediaId: string;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt: Date;

  @ApiProperty({ type: MediaEntity })
  media: DraftMediaRecord;
}

@ApiExtraModels(DraftPostEntity)
export class DraftEntity implements Draft {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ format: 'uuid' })
  ownerId: string;

  title: string;

  excerpt: string;

  content: string;

  @ApiProperty({ type: [String] })
  categoryNames: string[];

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  coverMediaId: string | null;

  @ApiProperty({ type: 'integer', nullable: true })
  postId: number | null;

  @ApiProperty({ type: 'integer', nullable: true })
  sourceVersion: number | null;

  @ApiProperty({ type: 'integer', nullable: true })
  deletedPostId: number | null;

  @ApiProperty({ enum: DraftStatus })
  status: DraftStatus;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  publicationAttemptId: string | null;

  @ApiProperty({ type: String, nullable: true })
  validationError: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt: Date;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  archivedAt: Date | null;

  @ApiProperty({ enum: ['NEW', 'REVISION'] })
  revisionMode: 'NEW' | 'REVISION';

  @ApiProperty({ type: [DraftMediaLinkEntity] })
  draftMedia: DraftMediaLinkEntity[];

  @ApiProperty({ type: [MediaEntity] })
  media: DraftMediaRecord[];

  @ApiProperty({ type: [MediaEntity] })
  effectiveMedia: DraftMediaRecord[];

  @ApiPropertyOptional({
    oneOf: [
      { $ref: getSchemaPath(DraftPostEntity) },
      { type: 'object', nullable: true, enum: [null] },
    ],
  })
  post?: DraftPost;
}
