import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { NotificationModule } from './notification.module';

async function bootstrap() {
  const logger = new Logger('Notification');

  const app = await NestFactory.create(NotificationModule);

  const config = app.get<ConfigService>(ConfigService);
  const kafkaPort = config.get<number>('KAFKA_PORT');
  const redisHost = config.get<string>('REDIS_HOST');
  const redisPort = config.get<number>('REDIS_PORT');
  const redisPassword = config.get<string>('REDIS_PASSWORD');

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      // exceptionFactory: (errors) => {
      //   return new RpcException('BadRequest');
      // },
    }),
  );

  app.connectMicroservice<MicroserviceOptions>(
    {
      transport: Transport.KAFKA,
      options: {
        client: {
          clientId: 'notification',
          brokers: [`localhost:${kafkaPort}`],
        },
        consumer: {
          groupId: 'notification-consumer',
        },
      },
    },
    {
      inheritAppConfig: true,
    },
  );
  app.connectMicroservice<MicroserviceOptions>(
    {
      transport: Transport.REDIS,
      options: {
        host: redisHost,
        port: redisPort,
        password: redisPassword,
      },
    },
    { inheritAppConfig: true },
  );

  await app.startAllMicroservices();
  logger.log('Notification service is listening');
}

bootstrap();
