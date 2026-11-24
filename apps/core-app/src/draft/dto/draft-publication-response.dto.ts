import { ApiProperty } from '@nestjs/swagger';
import { DraftStatus } from 'prisma/generated/enums';

export class DraftPublicationResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ enum: DraftStatus })
  status: DraftStatus;

  @ApiProperty({ type: String, nullable: true })
  validationError: string | null;
}
