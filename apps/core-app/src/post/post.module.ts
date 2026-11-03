import { PrismaModule } from '@app/prisma';
import { EntityWithAuthorService } from '@core/src/common/entity-with-author.service';
import { Module } from '@nestjs/common';
import { DraftModule } from '../draft/draft.module';
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
  imports: [PrismaModule, NotificationModule, DraftModule],
  exports: [PostRepository],
})
export class PostModule {}
