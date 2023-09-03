import { ConfigModule, ConfigService } from '@nestjs/config';
import { ClientsProviderAsyncOptions, Transport } from '@nestjs/microservices';
import { NOTIFICATION_SERVICE } from './kafka.constants';

export const kafkaClientProvider: ClientsProviderAsyncOptions = {
  name: NOTIFICATION_SERVICE,
  imports: [ConfigModule],
  inject: [ConfigService],
  useFactory: async (configService: ConfigService) => ({
    transport: Transport.KAFKA,
    options: {
      client: {
        clientId: 'notification',
        brokers: [`localhost:${configService.get<number>('KAFKA_PORT')}`],
      },
      consumer: {
        groupId: 'notification-consumer',
      },
    },
  }),
};
