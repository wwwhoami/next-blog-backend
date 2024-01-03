import { Module } from '@nestjs/common';
import { ClientsModule } from '@nestjs/microservices';
import { LoggerModule } from 'nestjs-pino';
import { kafkaClientProvider } from '../../../../libs/shared/src/kafka/kafka.provider';
import { NotificationController } from './notification.controller';
import { NotificationService } from './notification.service';

@Module({
  controllers: [NotificationController],
  providers: [NotificationService],
  exports: [NotificationService],
  imports: [
    ClientsModule.registerAsync([kafkaClientProvider]),
    LoggerModule.forRoot({ useExisting: true }),
  ],
})
export class NotificationModule {}
