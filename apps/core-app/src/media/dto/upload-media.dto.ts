import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { MediaRole, MediaTarget, MediaType } from 'prisma/generated/client';

export class UploadMediaDto {
  @IsEnum(MediaType)
  @ApiProperty({ enum: MediaType })
  type: MediaType;

  @IsEnum(MediaTarget)
  @ApiProperty({ enum: MediaTarget })
  target: MediaTarget;

  @IsOptional()
  @IsUUID()
  draftId?: string;

  @IsOptional()
  @IsEnum(MediaRole)
  role?: MediaRole = MediaRole.BODY;
}
