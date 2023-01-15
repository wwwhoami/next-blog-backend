import { Module } from '@nestjs/common';
import { EntityWithAuthorService } from 'src/common/entity-with-author.service';
import { PrismaModule } from 'src/prisma/prisma.module';
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
  imports: [PrismaModule],
  exports: [PostRepository],
})
export class PostModule {}
