import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { ErrorInterceptor } from './common/interceptors/error.interceptor';

async function bootstrap() {
  const logger = new Logger('Application');
  const app = await NestFactory.create(AppModule);
  const port = process.env.PORT || 3000;

  app.useGlobalPipes(new ValidationPipe({ transform: true }));
  app.useGlobalInterceptors(new ErrorInterceptor());
  app.use(cookieParser());

  const config = new DocumentBuilder()
    .setTitle('nest-blog')
    .setDescription('NextBlog API description')
    .setVersion('0.1')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document);

  await app.listen(3000);

  logger.log(`listening on port ${port}`);
}
bootstrap();
