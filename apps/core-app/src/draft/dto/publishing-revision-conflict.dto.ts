import { ApiProperty } from '@nestjs/swagger';
import { DraftStatus } from 'prisma/generated/enums';

export class PublishingRevisionConflictDto {
  message: string;

  @ApiProperty({
    format: 'uuid',
    description: 'Draft ID to poll via GET /draft/{draftId}.',
  })
  draftId: string;

  @ApiProperty({ enum: [DraftStatus.PUBLISHING] })
  status: typeof DraftStatus.PUBLISHING;
}
