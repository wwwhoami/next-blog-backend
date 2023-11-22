import { GetNotificationDto } from '@app/shared/dto';
import {
  CommentPayload,
  Notification,
  NotificationMessage,
} from '@app/shared/entities';
import { CommentLike } from '@core/src/comment/entities/comment.entity';
import { PostLike } from '@core/src/post/entities/post.entity';
import { Controller, ParseUUIDPipe, UseFilters } from '@nestjs/common';
import {
  EventPattern,
  MessagePattern,
  Payload,
  Transport,
} from '@nestjs/microservices';
import { PrismaExceptionFilter } from './filters/prisma-exception.filter';
import { RpcValidationFilter } from './filters/rpc-validation.filter';
import { NotificationService } from './notification.service';

@Controller()
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  @EventPattern('comment.create', Transport.KAFKA)
  commentCreate(@Payload() message: NotificationMessage<CommentPayload>) {
    this.notificationService.commentNotification(message, 'COMMENT_CREATE');
  }

  @EventPattern('comment.like', Transport.KAFKA)
  commentLike(@Payload() message: NotificationMessage<CommentLike>) {
    this.notificationService.commentNotification(message, 'COMMENT_LIKE');
  }

  @EventPattern('comment.unlike', Transport.KAFKA)
  commentUnlike(@Payload() message: NotificationMessage<CommentLike>) {
    this.notificationService.commentNotification(message, 'COMMENT_UNLIKE');
  }

  @EventPattern('post.like', Transport.KAFKA)
  postLike(@Payload() message: NotificationMessage<PostLike>) {
    this.notificationService.postNotification(message, 'POST_LIKE');
  }

  @EventPattern('post.unlike', Transport.KAFKA)
  postUnlike(@Payload() message: NotificationMessage<PostLike>) {
    this.notificationService.postNotification(message, 'POST_UNLIKE');
  }

  @UseFilters(new PrismaExceptionFilter())
  @MessagePattern('notification.mark-as-read', Transport.KAFKA)
  markAsRead(
    @Payload() message: { userId: string; id: number },
  ): Promise<Notification<unknown>> {
    return this.notificationService.markAsRead(message.userId, message.id);
  }

  @UseFilters(new RpcValidationFilter())
  @MessagePattern('notification.get-many', Transport.KAFKA)
  getNotifications(
    @Payload('userId', ParseUUIDPipe) userId: string,
    @Payload('options') options: GetNotificationDto,
  ): Promise<Notification<unknown>[]> {
    return this.notificationService.getManyForUser(userId, options);
  }
}
