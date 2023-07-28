import { GetNotificationDto } from '@app/shared/dto';
import { Transform } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsUUID } from 'class-validator';

export class GetNotificationMessageDto {
  @IsUUID()
  userId: string;

  @IsOptional()
  options?: GetNotificationDto;
}
