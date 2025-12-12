import { PrismaModule } from '@app/prisma';
import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { EntityWithAuthorService } from '../common/entity-with-author.service';
import { MediaEventsService } from './media-events.service';
import { MediaController } from './media.controller';
import { MediaProcessor } from './media.processor';
import { MediaRepository } from './media.repository';
import { MediaService } from './media.service';

@Module({
  imports: [
    PrismaModule,
    BullModule.registerQueue({
      name: 'media-processor',
    }),
  ],
  providers: [
    MediaService,
    MediaRepository,
    {
      provide: EntityWithAuthorService,
      useExisting: MediaService,
    },
    MediaProcessor,
    MediaEventsService,
  ],
  controllers: [MediaController],
  exports: [MediaService],
})
export class MediaModule {}
