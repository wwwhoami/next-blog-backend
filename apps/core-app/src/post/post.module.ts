import { PrismaModule } from '@app/prisma';
import { EntityWithAuthorService } from '@core/src/common/entity-with-author.service';
import { Module } from '@nestjs/common';
import { ClientsModule } from '@nestjs/microservices';
import { kafkaClientProvider } from '../kafka-client/kafka.provider';
import { PostController } from './post.controller';
import { PostRepository } from './post.repository';
import { PostService } from './post.service';

@Module({
  controllers: [PostController],
  providers: [
    PostRepository,
    PostService,
    {
      provide: EntityWithAuthorService,
      useExisting: PostService,
    },
  ],
  imports: [PrismaModule, ClientsModule.registerAsync([kafkaClientProvider])],
  exports: [PostRepository],
})
export class PostModule {}
