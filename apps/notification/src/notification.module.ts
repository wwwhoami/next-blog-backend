import { PrismaModule } from '@app/prisma';
import { redisPublisher } from '@app/shared/redis';
import { REDIS_PUBLISHER_CLIENT } from '@app/shared/redis/redis.constants';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ClientsModule } from '@nestjs/microservices';
import { configValidationSchema } from 'config.schema';
import { LoggerModule } from 'nestjs-pino';
import { NotificationController } from './notification.controller';
import { NotificationRepository } from './notification.repository';
import { NotificationService } from './notification.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [
        `${
          process.env.NODE_ENV === 'prod'
            ? '.env'
            : `.env.${process.env.NODE_ENV}`
        }`,
      ],
      validationSchema: configValidationSchema,
    }),
    LoggerModule.forRoot({
      pinoHttp: {
        transport:
          process.env.NODE_ENV !== 'prod'
            ? {
                target: 'pino-pretty',
                options: {
                  singleLine: true,
                },
              }
            : {
                targets: [
                  {
                    target: 'pino/file',
                    options: {
                      destination: `${__dirname}/notification-app.log`,
                    },
                  },
                  {
                    target: 'pino-pretty',
                    options: {
                      singleLine: true,
                    },
                  },
                ],
              },

        level:
          (process.env.NODE_ENV === 'prod' && 'info') ||
          // suppress pino logs during testing
          (process.env.NODE_ENV === 'testing' && 'silent') ||
          'debug',
      },
    }),
    ClientsModule.registerAsync([
      {
        name: REDIS_PUBLISHER_CLIENT,
        ...redisPublisher,
      },
    ]),
    PrismaModule,
  ],
  controllers: [NotificationController],
  providers: [NotificationService, NotificationRepository],
})
export class NotificationModule {}
