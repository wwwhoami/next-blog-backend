import { GetNotificationDto } from '@app/shared/dto';
import {
  CommentPayload,
  Notification,
  NotificationMessage,
  PostPayload,
} from '@app/shared/entities';
import { ForbiddenError } from '@app/shared/errors/forbidden.error';
import { REDIS_PUBLISHER_CLIENT } from '@app/shared/redis/redis.constants';
import { Inject, Injectable } from '@nestjs/common';
import { ClientRedis, RpcException } from '@nestjs/microservices';
import { REDIS_SOCKET_EVENT_EMIT_ALL_NAME } from '@ws-notification/src/shared/redis-propagator/redis-propagator.constants';
import { NotificationType } from 'prisma/generated/client';
import { NotificationRepository } from './notification.repository';

@Injectable()
export class NotificationService {
  constructor(
    @Inject(REDIS_PUBLISHER_CLIENT)
    private readonly redisPublisherClient: ClientRedis,
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

  async markAsRead(userId: string, id: number): Promise<Notification<unknown>> {
    const { target } = await this.notificationRepository.getTargetId(id);

    if (target !== userId) {
      throw new RpcException(
        new ForbiddenError('Not authorized to mark this notification as read'),
      );
    }

    return this.notificationRepository.markAsRead(id);
  }

  getManyForUser(
    userId: string,
    options: GetNotificationDto = {},
  ): Promise<Notification<unknown>[]> {
    return this.notificationRepository.getManyForUser(userId, options);
  }
}
