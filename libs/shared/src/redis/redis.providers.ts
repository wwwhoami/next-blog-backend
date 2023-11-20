import { Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClientProvider } from '@nestjs/microservices';
import { Redis } from 'ioredis';
import {
  REDIS_PUBLISHER_CLIENT,
  REDIS_SUBSCRIBER_CLIENT,
} from './redis.constants';

export const redisSubscriber: Provider = {
  inject: [ConfigService],
  provide: REDIS_SUBSCRIBER_CLIENT,
  useFactory: async (configService: ConfigService) =>
    redisSubscriberProviderFactory(configService),
};

export const redisPublisher: Provider = {
  inject: [ConfigService],
  provide: REDIS_PUBLISHER_CLIENT,
  useFactory: async (configService: ConfigService) =>
    redisPublisherProviderFactory(configService),
};

export const redisSubscriberProviderFactory = (
  configService: ConfigService,
): ClientProvider =>
  new Redis({
    host: configService.get<string>('REDIS_HOST'),
    port: configService.get<number>('REDIS_PORT'),
    password: configService.get<string>('REDIS_PASSWORD'),
  });

export const redisPublisherProviderFactory = (
  configService: ConfigService,
): ClientProvider =>
  new Redis({
    host: configService.get<string>('REDIS_HOST'),
    port: configService.get<number>('REDIS_PORT'),
    password: configService.get<string>('REDIS_PASSWORD'),
  });

export const redisProviders: Provider[] = [redisSubscriber, redisPublisher];
