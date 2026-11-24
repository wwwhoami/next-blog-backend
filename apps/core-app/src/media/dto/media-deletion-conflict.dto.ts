import { ApiProperty } from '@nestjs/swagger';

const mediaDeletionConflictCodes = [
  'MEDIA_IN_USE',
  'MEDIA_DRAFT_PUBLISHING',
  'MEDIA_VARIANT',
] as const;

export class MediaDeletionConflictDto {
  @ApiProperty({ enum: mediaDeletionConflictCodes })
  code: (typeof mediaDeletionConflictCodes)[number];

  message: string;

  @ApiProperty({
    description:
      'True only for MEDIA_IN_USE. Confirm before retrying with force=true.',
  })
  canForce: boolean;
}
