import { ApiProperty, PickType } from '@nestjs/swagger';
import { MediaTarget, MediaType, MediaVariant } from 'prisma/generated/client';

export class MediaEntity {
  @ApiProperty({ format: 'uuid' })
  id: string;
  key: string;
  @ApiProperty({ format: 'uuid' })
  ownerId: string;
  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  parentId: string | null;
  @ApiProperty({ enum: MediaType })
  type: MediaType;
  @ApiProperty({ enum: MediaTarget })
  target: MediaTarget;
  @ApiProperty({ enum: MediaVariant })
  variant: MediaVariant;
  mimeType: string;
  @ApiProperty({ type: String })
  sizeBytes: string;
  bucket: string;
  publicUrl: string;
  @ApiProperty({ type: String, nullable: true })
  hash: string | null;
  @ApiProperty({ type: String, format: 'date-time' })
  createdAt: Date;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  deletedAt: Date | null;
}

export class ListedMediaEntity extends MediaEntity {
  @ApiProperty({ type: [MediaEntity] })
  Variants: MediaEntity[];
}

export class MediaChildEntity extends PickType(MediaEntity, [
  'id',
  'key',
  'variant',
  'publicUrl',
  'mimeType',
  'sizeBytes',
] as const) {}

export class MediaDetailEntity extends PickType(MediaEntity, [
  'id',
  'key',
  'type',
  'target',
  'variant',
  'publicUrl',
] as const) {
  @ApiProperty({ type: [MediaChildEntity] })
  children: MediaChildEntity[];
}
