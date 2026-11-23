import { ApiProperty } from '@nestjs/swagger';
import { DraftStatus } from 'prisma/generated/enums';

export class ReferencingDraftDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ enum: DraftStatus })
  status: DraftStatus;
}

export class MediaReferencesDto {
  @ApiProperty({ type: [Number] })
  postIds: number[];

  @ApiProperty({ type: [ReferencingDraftDto] })
  drafts: ReferencingDraftDto[];

  @ApiProperty({ type: [Number] })
  commentIds: number[];

  @ApiProperty({ type: [String], format: 'uuid' })
  avatarUserIds: string[];
}
