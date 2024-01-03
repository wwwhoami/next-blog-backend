import { PrismaService } from '@app/prisma';
import { GetNotificationDto } from '@app/shared/dto';
import { Notification, NotificationMessage } from '@app/shared/entities';
import { Injectable } from '@nestjs/common';
import { NotificationType } from '@prisma/client';
import { instanceToPlain } from 'class-transformer';

@Injectable()
export class NotificationRepository {
  constructor(private readonly prisma: PrismaService) {}

  async getManyForUser(
    userId: string,
    { skip = 0, take = 20, isRead, type }: GetNotificationDto = {},
  ): Promise<Notification<unknown>[]> {
    return this.prisma.notification.findMany({
      select: {
        id: true,
        isRead: true,
        actor: true,
        target: true,
        type: true,
        data: true,
        createdAt: true,
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

  markAsRead(id: number): Promise<Notification<unknown>> {
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
        target: true,
        data: true,
        createdAt: true,
        type: true,
      },
    });
  }
}
