import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsInt, IsOptional } from 'class-validator';
import { NotificationType } from 'prisma/generated/client';

export class GetNotificationDto {
  @IsOptional()
  @IsInt()
  @Transform(({ value }) => Number.parseInt(value))
  skip?: number;

  @IsOptional()
  @IsInt()
  @Transform(({ value }) => Number.parseInt(value))
  take?: number;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  })
  isRead?: boolean;

  @IsOptional()
  @IsEnum(NotificationType)
  @ApiProperty({ enum: NotificationType })
  type?: NotificationType;
}
