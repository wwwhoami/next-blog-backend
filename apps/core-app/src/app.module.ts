import { CacheModule } from '@nestjs/cache-manager';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { redisStore } from 'cache-manager-ioredis-yet';
import { configValidationSchema } from 'config.schema';
import { LoggerModule } from 'nestjs-pino';
import { AuthModule } from './auth/auth.module';
import { CategoryModule } from './category/category.module';
import { CommentModule } from './comment/comment.module';
import { pinoParams } from './common/pino/pino.provider';
import { NotificationModule } from './notification/notification.module';
import { PostModule } from './post/post.module';
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
      useFactory: async (configService: ConfigService) => ({
        isGlobal: true,
        store: await redisStore({
          host: configService.get<string>('REDIS_HOST'),
          port: configService.get<number>('REDIS_PORT'),
          password: configService.get<string>('REDIS_PASSWORD'),
        }),
      }),
      inject: [ConfigService],
      isGlobal: true,
    }),
    PostModule,
    CategoryModule,
    UserModule,
    AuthModule,
    CommentModule,
    NotificationModule,
  ],
})
export class AppModule {}
