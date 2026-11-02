import { PrismaModule } from '@app/prisma';
import { EntityWithAuthorService } from '@core/src/common/entity-with-author.service';
import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { DRAFT_PROCESSOR_QUEUE } from './constants/draft-processor.constants';
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
    {
      provide: EntityWithAuthorService,
      useExisting: DraftService,
    },
  ],
  exports: [DraftService],
})
export class DraftModule {}
