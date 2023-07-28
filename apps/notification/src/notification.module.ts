import { Module, ValidationPipe } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ClientsModule, RpcException, Transport } from '@nestjs/microservices';
import { REDIS_PUBLISHER_CLIENT } from 'apps/ws-notification/src/shared/redis/redis.constants';
import { configValidationSchema } from 'config.schema';
import { NotificationController } from './notification.controller';
import { NotificationService } from './notification.service';
import { PrismaModule } from '@app/prisma';
import { NotificationRepository } from './notification.repository';

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
    ClientsModule.registerAsync([
      {
        name: REDIS_PUBLISHER_CLIENT,
        imports: [ConfigModule],
        inject: [ConfigService],
        useFactory: async (configService: ConfigService) => ({
          transport: Transport.REDIS,
          options: {
            host: configService.get<string>('REDIS_HOST'),
            port: configService.get<number>('REDIS_PORT'),
            password: configService.get<string>('REDIS_PASSWORD'),
          },
        }),
      },
    ]),
    PrismaModule,
  ],
  controllers: [NotificationController],
  providers: [
    NotificationService,
    NotificationRepository,
    // {
    //   provide: 'APP_PIPE',
    //   useValue: new ValidationPipe({
    //     whitelist: true,
    //     forbidNonWhitelisted: true,
    //     transform: true,
    //     exceptionFactory: (errors) => {
    //       return new RpcException(errors);
    //     },
    //   }),
    // },
  ],
})
export class NotificationModule {}
