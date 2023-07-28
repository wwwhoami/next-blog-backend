import { Module } from '@nestjs/common';
import { NotificationService } from './notification.service';
import { NotificationController } from './notification.controller';
import { ClientsModule } from '@nestjs/microservices';
import { kafkaClientProvider } from '../kafka-client/kafka.provider';

@Module({
  controllers: [NotificationController],
  providers: [NotificationService],
  imports: [ClientsModule.registerAsync([kafkaClientProvider])],
})
export class NotificationModule {}
