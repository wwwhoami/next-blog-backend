import { PrismaModule } from '@app/prisma';
import { EntityWithAuthorService } from '@core/src/common/entity-with-author.service';
import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { DRAFT_PROCESSOR_QUEUE } from './constants/draft-processor.constants';
import { DraftMaintenanceService } from './draft-maintenance.service';
import { DraftPublicationMediaService } from './draft-publication-media.service';
import { DraftPublicationRepository } from './draft-publication.repository';
import { DraftController } from './draft.controller';
import { DraftProcessor } from './draft.processor';
import { DraftRepository } from './draft.repository';
import { DraftService } from './draft.service';

@Module({
  imports: [
    PrismaModule,
    BullModule.registerQueue({ name: DRAFT_PROCESSOR_QUEUE }),
  ],
  controllers: [DraftController],
  providers: [
    DraftRepository,
    DraftService,
    DraftProcessor,
    DraftPublicationRepository,
    DraftMaintenanceService,
    DraftPublicationMediaService,

    {
      provide: EntityWithAuthorService,
      useExisting: DraftService,
    },
  ],
  exports: [DraftService, DraftRepository],
})
export class DraftModule {}
