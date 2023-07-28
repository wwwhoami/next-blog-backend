import { GetNotificationDto } from '@app/shared/dto';
import {
  CommentPayload,
  NotificationMessage,
  PostPayload,
} from '@app/shared/entities';
import { UnauthorizedError } from '@core/src/common/errors/unauthorized.error';
import { Inject, Injectable } from '@nestjs/common';
import { ClientProxy, RpcException } from '@nestjs/microservices';
import { NotificationType } from '@prisma/client';
import { NotificationRepository } from './notification.repository';
import { REDIS_SOCKET_EVENT_EMIT_ALL_NAME } from '@ws-notification/src/shared/redis-propagator/redis-propagator.constants';
import { REDIS_PUBLISHER_CLIENT } from '@ws-notification/src/shared/redis/redis.constants';

@Injectable()
export class NotificationService {
  constructor(
    @Inject(REDIS_PUBLISHER_CLIENT)
    private readonly redisPublisherClient: ClientProxy,
    private readonly notificationRepository: NotificationRepository,
  ) {}

  async commentNotification<T extends CommentPayload>(
    message: NotificationMessage<T>,
    type: NotificationType,
  ): Promise<void> {
    await this.notificationRepository.create(message, type);

    this.redisPublisherClient.emit(REDIS_SOCKET_EVENT_EMIT_ALL_NAME, {
      event: `${type}:${message.data.postId}`,
      userId: message.target,
      data: message.data,
    });
  }

  async postNotification<T extends PostPayload>(
    message: NotificationMessage<T>,
    type: NotificationType,
  ): Promise<void> {
    await this.notificationRepository.create(message, type);

    this.redisPublisherClient.emit(REDIS_SOCKET_EVENT_EMIT_ALL_NAME, {
      event: `${type}:${message.data.id}`,
      userId: message.target,
      data: message.data,
    });
  }

  async markAsRead(userId: string, id: number) {
    const { target } = await this.notificationRepository.getTargetId(id);

    if (target !== userId) {
      throw new RpcException(
        new UnauthorizedError(
          'Not authorized to mark this notification as read',
        ),
      );
    }

    return this.notificationRepository.markAsRead(id);
  }

  getManyForUser(
    userId: string,
    options: GetNotificationDto = {},
  ): Promise<NotificationMessage<CommentPayload | PostPayload>[]> {
    return this.notificationRepository.getManyForUser(userId, options);
  }
}
