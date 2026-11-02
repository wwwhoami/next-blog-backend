import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { MediaTarget, MediaType } from 'prisma/generated/client';

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
}
