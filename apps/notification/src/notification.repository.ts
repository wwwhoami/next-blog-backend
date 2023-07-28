import { PrismaService } from '@app/prisma';
import { GetNotificationDto } from '@app/shared/dto';
import { NotificationMessage } from '@app/shared/entities';
import { Injectable } from '@nestjs/common';
import { NotificationType } from '@prisma/client';
import { instanceToPlain } from 'class-transformer';

@Injectable()
export class NotificationRepository {
  constructor(private readonly prisma: PrismaService) {}

  async getManyForUser<T>(
    userId: string,
    { skip = 0, take = 20, isRead, type }: GetNotificationDto = {},
  ): Promise<NotificationMessage<T>[]> {
    const notifications = await this.prisma.notification.findMany({
      select: {
        id: true,
        isRead: true,
        actor: true,
        type: true,
        data: true,
      },
      where: {
        target: userId,
        isRead,
        type,
      },
      orderBy: {
        createdAt: 'asc',
      },
      skip,
      take,
    });

    return notifications.map((n) => ({
      id: n.id,
      actor: n.actor,
      target: userId,
      isRead: n.isRead,
      data: n.data as T,
    }));
  }

  create(
    { actor, target, data }: NotificationMessage<unknown>,
    type: NotificationType,
  ) {
    return this.prisma.notification.create({
      data: {
        actor,
        target,
        data: instanceToPlain(data),
        type,
      },
    });
  }

  getTargetId(id: number): Promise<{ target: string | null }> {
    return this.prisma.notification.findUniqueOrThrow({
      where: {
        id,
      },
      select: {
        target: true,
      },
    });
  }

  markAsRead(id: number) {
    return this.prisma.notification.update({
      where: {
        id,
      },
      data: {
        isRead: true,
      },
      select: {
        id: true,
        isRead: true,
        actor: true,
        type: true,
        data: true,
      },
    });
  }
}
