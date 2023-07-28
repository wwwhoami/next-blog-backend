import { PrismaModule } from '@app/prisma';
import { EntityWithAuthorService } from '@core/src/common/entity-with-author.service';
import { PostModule } from '@core/src/post/post.module';
import { Module } from '@nestjs/common';
import { ClientsModule } from '@nestjs/microservices';
import { kafkaClientProvider } from '../kafka-client/kafka.provider';
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
  imports: [
    PrismaModule,
    PostModule,
    ClientsModule.registerAsync([kafkaClientProvider]),
  ],
})
export class CommentModule {}
