import { PrismaModule } from '@app/prisma';
import { EntityWithAuthorService } from '@core/src/common/entity-with-author.service';
import { Module } from '@nestjs/common';
import { DraftController } from './draft.controller';
import { DraftRepository } from './draft.repository';
import { DraftService } from './draft.service';

@Module({
  imports: [PrismaModule],
  controllers: [DraftController],
  providers: [
    DraftRepository,
    DraftService,
    {
      provide: EntityWithAuthorService,
      useExisting: DraftService,
    },
  ],
  exports: [DraftService],
})
export class DraftModule {}
