import { PrismaModule } from '@app/prisma';
import { EntityWithAuthorService } from '@core/src/common/entity-with-author.service';
import { Module } from '@nestjs/common';
import { NotificationModule } from '../notification/notification.module';
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
  imports: [PrismaModule, NotificationModule],
  exports: [PostRepository],
})
export class PostModule {}
