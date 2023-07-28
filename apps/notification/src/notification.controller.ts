import { GetNotificationDto } from '@app/shared/dto';
import { NotificationMessage } from '@app/shared/entities';
import {
  CommentEntity,
  CommentLike,
} from '@core/src/comment/entities/comment.entity';
import { PostLike } from '@core/src/post/entities/post.entity';
import { Controller, ParseUUIDPipe, UseFilters } from '@nestjs/common';
import {
  EventPattern,
  MessagePattern,
  Payload,
  Transport,
} from '@nestjs/microservices';
import { NotificationService } from './notification.service';
import { PrismaExceptionFilter } from './prisma-exception.filter';
import { RpcValidationFilter } from './rpc-validation.filter';

@Controller()
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  @EventPattern('comment_create', Transport.KAFKA)
  commentCreate(@Payload() message: NotificationMessage<CommentEntity>) {
    this.notificationService.commentNotification(message, 'COMMENT_CREATE');
  }

  @EventPattern('comment_like', Transport.KAFKA)
  commentLike(@Payload() message: NotificationMessage<CommentLike>) {
    this.notificationService.commentNotification(message, 'COMMENT_LIKE');
  }

  @EventPattern('comment_unlike', Transport.KAFKA)
  commentUnlike(@Payload() message: NotificationMessage<CommentLike>) {
    this.notificationService.commentNotification(message, 'COMMENT_UNLIKE');
  }

  @EventPattern('post_like', Transport.KAFKA)
  postLike(@Payload() message: NotificationMessage<PostLike>) {
    this.notificationService.postNotification(message, 'POST_LIKE');
  }

  @EventPattern('post_unlike', Transport.KAFKA)
  postUnlike(@Payload() message: NotificationMessage<PostLike>) {
    this.notificationService.postNotification(message, 'POST_UNLIKE');
  }

  @UseFilters(new PrismaExceptionFilter())
  @MessagePattern('mark_as_read', Transport.KAFKA)
  markAsRead(@Payload() message: { userId: string; id: number }) {
    return this.notificationService.markAsRead(message.userId, message.id);
  }

  @UseFilters(new RpcValidationFilter())
  @MessagePattern('get_notifications', Transport.KAFKA)
  getNotifications(
    @Payload('userId', ParseUUIDPipe) userId: string,
    @Payload('options') options: GetNotificationDto,
  ) {
    return this.notificationService.getManyForUser(userId, options);
  }
}
