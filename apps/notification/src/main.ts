import { kafkaProviderFactory } from '@app/shared/kafka';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import {
  KafkaOptions,
  MicroserviceOptions,
  Transport,
} from '@nestjs/microservices';
import { LoggerErrorInterceptor, Logger as PinoLogger } from 'nestjs-pino';
import { NotificationModule } from './notification.module';

async function bootstrap() {
  const app = await NestFactory.create(NotificationModule, {
    bufferLogs: true,
  });

  const logger = app.get(PinoLogger);
  app.useLogger(logger);

  const config = app.get<ConfigService>(ConfigService);
  const redisHost = config.get<string>('REDIS_HOST');
  const redisPort = config.get<number>('REDIS_PORT');
  const redisPassword = config.get<string>('REDIS_PASSWORD');

  app.useGlobalInterceptors(new LoggerErrorInterceptor());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.connectMicroservice<MicroserviceOptions>(
    kafkaProviderFactory(config) as KafkaOptions,
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
