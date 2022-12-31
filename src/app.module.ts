import {
  CacheModule,
  MiddlewareConsumer,
  Module,
  NestModule,
} from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import redisStore from 'cache-manager-redis-store';
import { configValidationSchema } from '../config.schema';
import { AuthModule } from './auth/auth.module';
import { CategoryModule } from './category/category.module';
import { LoggerMiddleware } from './common/middleware/logger.middleware';
import { PostModule } from './post/post.module';
import { PrismaService } from './prisma/prisma.service';
import { UserModule } from './user/user.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [`.env.${process.env.NODE_ENV}`],
      validationSchema: configValidationSchema,
    }),
    CacheModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        isGlobal: true,
        store: redisStore,
        host: configService.get<string>('REDIS_HOST'),
        port: configService.get<number>('REDIS_PORT'),
        auth_pass: configService.get<string>('REDIS_PASSWORD'),
      }),
      inject: [ConfigService],
      isGlobal: true,
    }),
    PostModule,
    CategoryModule,
    UserModule,
    AuthModule,
  ],
  providers: [PrismaService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(LoggerMiddleware).forRoutes('*');
  }
}
