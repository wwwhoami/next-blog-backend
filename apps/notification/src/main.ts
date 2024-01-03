import { kafkaProviderFactory } from '@app/shared/kafka';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { LoggerErrorInterceptor, Logger as PinoLogger } from 'nestjs-pino';
import { NotificationModule } from './notification.module';

async function bootstrap() {
  const app = await NestFactory.create(NotificationModule, {
    bufferLogs: true,
  });
  app.useLogger(app.get(PinoLogger));

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

  app.connectMicroservice<MicroserviceOptions>(kafkaProviderFactory(config), {
    inheritAppConfig: true,
  });
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
  console.log('Notification service is listening');
}

bootstrap();
