import { GetNotificationDto } from '@app/shared/dto';
import {
  CommentPayload,
  NotificationMessage,
  PostPayload,
} from '@app/shared/entities';
import { NOTIFICATION_SERVICE } from '@app/shared/kafka';
import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { ClientKafka } from '@nestjs/microservices';
import { PinoLogger } from 'nestjs-pino';
import { Prisma } from 'prisma/generated/client';
import { catchError, lastValueFrom, throwError } from 'rxjs';

@Injectable()
export class NotificationService implements OnModuleInit {
  constructor(
    @Inject(NOTIFICATION_SERVICE) private readonly client: ClientKafka,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(NotificationService.name);
  }

  async onModuleInit() {
    const requestPatterns = [
      'notification.get-many',
      'notification.mark-as-read',
    ];

    for (const pattern of requestPatterns) {
      this.client.subscribeToResponseOf(pattern);
    }

    await this.client.connect();
  }

  emit<T extends CommentPayload | PostPayload>(
    pattern: string,
    message: NotificationMessage<T>,
  ): void {
    this.client.emit(pattern, message);
  }

  getMany(
    userId: string,
    options: GetNotificationDto = {},
  ): Promise<NotificationMessage<CommentPayload | PostPayload>[]> {
    const d = this.client
      .send<
        NotificationMessage<CommentPayload | PostPayload>[]
      >('notification.get-many', { userId, options })
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
      .send<NotificationMessage<CommentPayload | PostPayload>>(
        'notification.mark-as-read',
        {
          id,
          userId,
        },
      )
      .pipe(
        catchError((err) => {
          if (
            err?.error?.name == 'PrismaClientKnownRequestError' &&
            err?.error?.code === 'P2025'
          )
            return throwError(
              () =>
                new Prisma.PrismaClientKnownRequestError(err.error.message, {
                  code: err.error.code,
                  clientVersion: err.error.clientVersion,
                }),
            );
          if (typeof err.error === 'object') return throwError(() => err.error);

          return throwError(() => err);
        }),
      );

    return lastValueFrom(d);
  }
}
