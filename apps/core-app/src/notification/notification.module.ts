import { Module } from '@nestjs/common';
import { NotificationService } from './notification.service';
import { NotificationController } from './notification.controller';
import { ClientsModule } from '@nestjs/microservices';
import { kafkaClientProvider } from '../../../../libs/shared/src/kafka/kafka.provider';

@Module({
  controllers: [NotificationController],
  providers: [NotificationService],
  exports: [NotificationService],
  imports: [ClientsModule.registerAsync([kafkaClientProvider])],
})
export class NotificationModule {}
