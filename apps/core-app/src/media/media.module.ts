import { PrismaModule } from '@app/prisma';
import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { EntityWithAuthorService } from '../common/entity-with-author.service';
import { DraftModule } from '../draft/draft.module';
import { StorageService } from '../storage/storage.service';
import { MEDIA_PROCESSOR_QUEUE } from './constants/media-processor.constants';
import {
  MEDIA_CLEANUP_QUEUE,
  MediaCleanupProcessor,
} from './media-cleanup.processor';
import { MediaEventsService } from './media-events.service';
import { MediaController } from './media.controller';
import { MediaProcessor } from './media.processor';
import { MediaRepository } from './media.repository';
import { MediaService } from './media.service';

@Module({
  imports: [
    PrismaModule,
    DraftModule,
    BullModule.registerQueue(
      { name: MEDIA_PROCESSOR_QUEUE },
      { name: MEDIA_CLEANUP_QUEUE },
    ),
  ],
  providers: [
    MediaService,
    MediaRepository,
    {
      provide: EntityWithAuthorService,
      useExisting: MediaService,
    },
    MediaProcessor,
    MediaCleanupProcessor,
    MediaEventsService,
    StorageService,
  ],
  controllers: [MediaController],
  exports: [MediaService],
})
export class MediaModule {}
