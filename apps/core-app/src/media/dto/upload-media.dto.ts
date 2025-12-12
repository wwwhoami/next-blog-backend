import { ApiProperty } from '@nestjs/swagger';
import { MediaTarget, MediaType } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class UploadMediaDto {
  @IsEnum(MediaType)
  @ApiProperty({ enum: MediaType })
  type: MediaType;

  @IsEnum(MediaTarget)
  @ApiProperty({ enum: MediaTarget })
  target: MediaTarget;
}
