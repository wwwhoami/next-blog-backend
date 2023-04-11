import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';
import { initAdapters } from './adapters.init';

async function bootstrap() {
  const logger = new Logger('WS-Notification');
  const app = await NestFactory.create(AppModule);
  const configService = app.get<ConfigService>(ConfigService);
  const port = configService.getOrThrow<number>('APP_WS_NOTIFICATION_PORT');

  initAdapters(app);

  await app.listen(port, () => {
    logger.log(`Service is listening on port ${port}`);
  });
}
bootstrap();
