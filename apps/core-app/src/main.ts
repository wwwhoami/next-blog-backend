import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { LoggerErrorInterceptor, Logger as PinoLogger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { ErrorInterceptor } from './common/interceptors/error.interceptor';
import metadata from './metadata';

// Override JSON.stringify to handle BigInt
(BigInt.prototype as any).toJSON = function () {
  return this.toString();
};

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  const logger = app.get(PinoLogger);
  app.useLogger(logger);

  const configService = app.get<ConfigService>(ConfigService);
  const port = configService.getOrThrow<number>('APP_CORE_PORT');
  const clientUrl = configService.get<string>('CLIENT_URL');

  app.use(helmet());

  if (clientUrl) {
    app.enableCors({
      origin: clientUrl,
      credentials: true,
    });
  }

  app.useGlobalPipes(new ValidationPipe({ transform: true }));
  app.useGlobalInterceptors(
    new ErrorInterceptor(),
    new LoggerErrorInterceptor(),
  );

  app.use(cookieParser());

  const config = new DocumentBuilder()
    .setTitle('nest-blog')
    .setDescription('NextBlog API description')
    .setVersion('0.1')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'Bearer',
        bearerFormat: 'JWT',
        in: 'header',
      },
      'accessToken',
    )
    .addCookieAuth('refreshToken')
    .build();
  await SwaggerModule.loadPluginMetadata(metadata);
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document);

  await app.listen(port, () => {
    logger.log(`Application is running on: http://localhost:${port}`);
  });
}

bootstrap().catch(console.error);
