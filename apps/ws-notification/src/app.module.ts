import { AppAuthModule } from '@app/auth';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { configValidationSchema } from 'config.schema';
import { LoggerModule } from 'nestjs-pino';
import { NotificationModule } from './notification/notification.module';
import { SharedModule } from './shared/shared.module';

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
    LoggerModule.forRoot({}),
    SharedModule,
    NotificationModule,
    AppAuthModule,
  ],
  providers: [NotificationModule],
})
export class AppModule {}
