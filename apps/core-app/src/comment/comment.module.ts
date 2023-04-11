import { Module } from '@nestjs/common';
import { EntityWithAuthorService } from '@core/src/common/entity-with-author.service';
import { PostModule } from '@core/src/post/post.module';
import { PrismaModule } from '@core/src/prisma/prisma.module';
import { CommentController } from './comment.controller';
import { CommentRepository } from './comment.repository';
import { CommentService } from './comment.service';

@Module({
  controllers: [CommentController],
  providers: [
    CommentService,
    CommentRepository,
    {
      provide: EntityWithAuthorService,
      useExisting: CommentService,
    },
  ],
  imports: [PrismaModule, PostModule],
})
export class CommentModule {}