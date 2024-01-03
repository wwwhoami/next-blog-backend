import { GetNotificationDto } from '@app/shared/dto';
import { IsOptional, IsUUID } from 'class-validator';

export class GetNotificationMessageDto {
  @IsUUID()
  userId: string;

  @IsOptional()
  options?: GetNotificationDto;
}
