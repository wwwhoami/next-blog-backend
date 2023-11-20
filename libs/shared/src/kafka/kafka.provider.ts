import { ConfigModule, ConfigService } from '@nestjs/config';
import {
  ClientProvider,
  ClientsProviderAsyncOptions,
  Transport,
} from '@nestjs/microservices';
import { NOTIFICATION_SERVICE } from './kafka.constants';

export const kafkaClientProvider: ClientsProviderAsyncOptions = {
  name: NOTIFICATION_SERVICE,
  imports: [ConfigModule],
  inject: [ConfigService],
  useFactory: async (configService: ConfigService) =>
    kafkaProviderFactory(configService),
};

export const kafkaProviderFactory = (
  configService: ConfigService,
): ClientProvider => {
  const kafkaHost = configService.get<string>('KAFKA_HOST');
  const kafkaPort = configService.get<number>('KAFKA_PORT');

  return {
    transport: Transport.KAFKA,
    options: {
      client: {
        clientId: 'notification',
        brokers: [`${kafkaHost}:${kafkaPort}`],
      },
      consumer: {
        groupId: 'notification-consumer',
      },
    },
  };
};
