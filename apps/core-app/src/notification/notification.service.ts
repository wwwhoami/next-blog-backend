import { GetNotificationDto } from '@app/shared/dto';
import {
  CommentPayload,
  NotificationMessage,
  PostPayload,
} from '@app/shared/entities';
import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ClientKafka } from '@nestjs/microservices';
import { catchError, lastValueFrom, throwError } from 'rxjs';
import { NOTIFICATION_SERVICE } from '../kafka-client/kafka.constants';

@Injectable()
export class NotificationService implements OnModuleInit {
  constructor(
    @Inject(NOTIFICATION_SERVICE) private readonly client: ClientKafka,
  ) {}

  logger = new Logger('Notification');

  onModuleInit() {
    this.client.subscribeToResponseOf('get_notifications');
    this.client.subscribeToResponseOf('mark_as_read');
  }

  getMany(
    userId: string,
    options: GetNotificationDto = {},
  ): Promise<NotificationMessage<CommentPayload | PostPayload>[]> {
    const d = this.client
      .send<NotificationMessage<CommentPayload | PostPayload>[]>(
        'get_notifications',
        { userId, options },
      )
      .pipe(
        catchError((err) => {
          if (typeof err.error === 'object') return throwError(() => err.error);
          return throwError(() => err);
        }),
      );

    return lastValueFrom(d);
  }

  markAsRead(
    id: number,
    userId: string,
  ): Promise<NotificationMessage<CommentPayload | PostPayload>> {
    const d = this.client
      .send<NotificationMessage<CommentPayload | PostPayload>>('mark_as_read', {
        id,
        userId,
      })
      .pipe(
        catchError((err) => {
          if (typeof err.error === 'object') return throwError(() => err.error);

          return throwError(() => err);
        }),
      );

    return lastValueFrom(d);
  }
}
