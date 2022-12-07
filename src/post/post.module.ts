import { Module } from '@nestjs/common';
import { PrismaModule } from 'src/prisma/prisma.module';
import { PostController } from './post.controller';
import { PostRepository } from './post.repository';
import { PostService } from './post.service';

@Module({
  controllers: [PostController],
  providers: [PostRepository, PostService],
  imports: [PrismaModule],
})
export class PostModule {}
