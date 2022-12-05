import { Module } from '@nestjs/common';
import { PostModule } from './post/post.module';
import { PrismaService } from './prisma/prisma.service';

@Module({
  imports: [PostModule],
  providers: [PrismaService],
})
export class AppModule {}
