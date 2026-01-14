import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { LoggerErrorInterceptor, Logger as PinoLogger } from 'nestjs-pino';
import { initAdapters } from './adapters.init';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  const logger = app.get(PinoLogger);
  app.useLogger(logger);

  const configService = app.get<ConfigService>(ConfigService);
  const port = configService.getOrThrow<number>('APP_WS_NOTIFICATION_PORT');

  await initAdapters(app);
  app.useGlobalInterceptors(new LoggerErrorInterceptor());

  await app.listen(port, () => {
    logger.log(`Service is listening on port ${port}`);
  });
}
bootstrap();
