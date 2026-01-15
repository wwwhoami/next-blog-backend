import KeyvRedis from '@keyv/redis';
import { BullModule } from '@nestjs/bullmq';
import { CacheModule } from '@nestjs/cache-manager';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { configValidationSchema } from 'config.schema';
import { LoggerModule } from 'nestjs-pino';
import { AuthModule } from './auth/auth.module';
import { CategoryModule } from './category/category.module';
import { CommentModule } from './comment/comment.module';
import { pinoParams } from './common/pino/pino.provider';
import { MediaModule } from './media/media.module';
import { NotificationModule } from './notification/notification.module';
import { PostModule } from './post/post.module';
import { StorageService } from './storage/storage.service';
import { UserModule } from './user/user.module';

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
    LoggerModule.forRoot({ ...pinoParams }),
    CacheModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => {
        const redisHost = configService.get('REDIS_HOST');
        const redisPort = configService.get('REDIS_PORT');

        return {
          isGlobal: true,
          stores: [
            new KeyvRedis({
              url: `redis://${redisHost}:${redisPort}`,
              password: configService.get<string>('REDIS_PASSWORD'),
            }),
          ],
        };
      },
      inject: [ConfigService],
      isGlobal: true,
    }),
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        connection: {
          host: configService.get<string>('REDIS_HOST'),
          port: configService.get<number>('REDIS_PORT'),
          password: configService.get<string>('REDIS_PASSWORD'),
        },
      }),
      inject: [ConfigService],
    }),
    PostModule,
    CategoryModule,
    UserModule,
    AuthModule,
    CommentModule,
    NotificationModule,
    MediaModule,
  ],
  providers: [StorageService],
})
export class AppModule {}
