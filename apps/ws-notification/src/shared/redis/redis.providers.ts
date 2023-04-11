import { Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import {
  REDIS_SUBSCRIBER_CLIENT,
  REDIS_PUBLISHER_CLIENT,
} from './redis.constants';

export const redisProviders: Provider[] = [
  {
    inject: [ConfigService],
    provide: REDIS_SUBSCRIBER_CLIENT,
    useFactory: async (configService: ConfigService) => {
      return new Redis({
        host: configService.get<string>('REDIS_HOST'),
        port: configService.get<number>('REDIS_PORT'),
        password: configService.get<string>('REDIS_PASSWORD'),
      });
    },
  },
  {
    inject: [ConfigService],
    provide: REDIS_PUBLISHER_CLIENT,
    useFactory: async (configService: ConfigService) => {
      return new Redis({
        host: configService.get<string>('REDIS_HOST'),
        port: configService.get<number>('REDIS_PORT'),
        password: configService.get<string>('REDIS_PASSWORD'),
      });
    },
  },
];
