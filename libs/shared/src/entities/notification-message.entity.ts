import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class NotificationMessage<PayloadType> {
  @IsUUID()
  actor: string;

  @IsUUID()
  target: string;

  @ApiProperty({ type: () => Object })
  data: PayloadType;
}

export class CommentPayload {
  id: number;
  postId: number;
}

export class PostPayload {
  id: number;
}
